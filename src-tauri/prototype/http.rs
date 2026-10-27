//! Deliberately small HTTP/1.1 surface for the isolated loopback lab, not a production server.
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::{Ipv4Addr, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

pub struct Request {
    pub method: String,
    pub target: String,
    pub headers: BTreeMap<String, String>,
    pub body: String,
}

pub struct Response {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: String,
}

impl Response {
    pub fn new(status: u16, body: &str) -> Self {
        Self {
            status,
            headers: vec![],
            body: body.into(),
        }
    }
    fn send(self, stream: &mut TcpStream) {
        let mut text = format!("HTTP/1.1 {} Result\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nPragma: no-cache\r\nReferrer-Policy: same-origin\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'\r\n", self.status, self.body.len());
        for (name, value) in self.headers {
            // All header values are constructed here from fixed text, socket addresses or base64url.
            if value.contains(['\r', '\n']) {
                return;
            }
            text.push_str(&format!("{name}: {value}\r\n"));
        }
        text.push_str("\r\n");
        text.push_str(&self.body);
        let _ = stream.write_all(text.as_bytes());
    }
}

pub fn fields(text: &str, expected: &[&str]) -> Option<BTreeMap<String, String>> {
    let mut fields = BTreeMap::new();
    for item in text.split('&') {
        let (name, value) = item.split_once('=')?;
        if !expected.contains(&name)
            || !super::crypto::canonical(value)
            || fields.insert(name.into(), value.into()).is_some()
        {
            return None;
        }
    }
    (fields.len() == expected.len()).then_some(fields)
}

fn parse(bytes: &[u8]) -> Option<(Request, usize)> {
    let text = std::str::from_utf8(bytes).ok()?;
    let (head, _) = text.split_once("\r\n\r\n")?;
    if head.len() > 4096 {
        return None;
    }
    let mut lines = head.split("\r\n");
    let parts: Vec<_> = lines.next()?.split(' ').collect();
    if parts.len() != 3
        || parts[2] != "HTTP/1.1"
        || !["GET", "POST"].contains(&parts[0])
        || !parts[1].starts_with('/')
        || parts[1].len() > 256
        || !parts[1].is_ascii()
    {
        return None;
    }
    let mut headers = BTreeMap::new();
    for line in lines {
        let (name, value) = line.split_once(':')?;
        if name.is_empty()
            || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            || value.bytes().any(|b| b < 32 && b != b'\t' || b == 127)
            || headers
                // HTTP optional whitespace is SP/HTAB, never Unicode whitespace.
                .insert(
                    name.to_ascii_lowercase(),
                    value.trim_matches([' ', '\t']).to_owned(),
                )
                .is_some()
        {
            return None;
        }
    }
    if ["transfer-encoding", "upgrade", "expect"]
        .iter()
        .any(|h| headers.contains_key(*h))
    {
        return None;
    }
    let length = match headers.get("content-length") {
        None => 0,
        Some(value) => {
            let number: usize = value.parse().ok()?;
            if number.to_string() != *value {
                return None;
            }
            number
        }
    };
    if length > 1024 || (parts[0] == "GET" && length != 0) {
        return None;
    }
    Some((
        Request {
            method: parts[0].into(),
            target: parts[1].into(),
            headers,
            body: String::new(),
        },
        head.len() + 4 + length,
    ))
}

fn receive(stream: &mut TcpStream, stop: &AtomicBool, deadline: Instant) -> Option<Request> {
    stream
        .set_read_timeout(Some(Duration::from_millis(50)))
        .ok()?;
    stream
        .set_write_timeout(Some(Duration::from_millis(100)))
        .ok()?;
    let end = (Instant::now() + Duration::from_secs(1)).min(deadline);
    let mut bytes = Vec::new();
    while !stop.load(Ordering::Acquire) && Instant::now() < end {
        let mut buffer = [0; 1024];
        match stream.read(&mut buffer) {
            Ok(0) => return None,
            Ok(count) => bytes.extend_from_slice(&buffer[..count]),
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                continue
            }
            Err(_) => return None,
        }
        if bytes.len() > 8192 {
            return None;
        }
        if bytes.windows(4).any(|b| b == b"\r\n\r\n") {
            let (mut request, total) = parse(&bytes)?;
            if bytes.len() > total {
                return None;
            } // No pipelining or ambiguous framing.
            if bytes.len() == total {
                let body_start = bytes.windows(4).position(|b| b == b"\r\n\r\n")? + 4;
                request.body = std::str::from_utf8(&bytes[body_start..]).ok()?.into();
                return Some(request);
            }
        }
    }
    None
}

pub struct Server {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Server {
    pub fn bind() -> std::io::Result<TcpListener> {
        TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
    }
    pub fn spawn(
        listener: TcpListener,
        stop: Arc<AtomicBool>,
        deadline: Instant,
        mut handler: impl FnMut(Request) -> Response + Send + 'static,
    ) -> std::io::Result<Self> {
        let address = listener.local_addr()?;
        listener.set_nonblocking(true)?;
        let worker_stop = stop.clone();
        let thread = thread::spawn(move || {
            while !worker_stop.load(Ordering::Acquire) && Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, peer)) => {
                        if peer.ip() != Ipv4Addr::LOCALHOST {
                            continue;
                        }
                        let response = match receive(&mut stream, &worker_stop, deadline) {
                            Some(request)
                                if request.headers.get("host") == Some(&address.to_string()) =>
                            {
                                handler(request)
                            }
                            _ => Response::new(400, "Invalid laboratory request."),
                        };
                        response.send(&mut stream);
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10))
                    }
                    Err(_) => break,
                }
            }
            worker_stop.store(true, Ordering::Release);
        });
        Ok(Self {
            stop,
            thread: Some(thread),
        })
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

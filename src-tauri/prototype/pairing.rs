//! A simulated authority, intentionally unavailable to Hono, D1 and the Tauri UI.
use super::{
    crypto::{canonical, challenge, hash, random_secret},
    http::{fields, Request, Response, Server},
};
use std::{
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use zeroize::Zeroizing;

struct BrowserBinding {
    cookie: [u8; 32],
    csrf: [u8; 32],
}
struct Grant {
    code: [u8; 32],
    deadline: Instant,
    used: bool,
}

pub struct MockAuthority {
    state: String,
    challenge: String,
    approval: [u8; 32],
    callback: SocketAddr,
    deadline: Instant,
    browser: Option<BrowserBinding>,
    failures: u8,
    grant: Option<Grant>,
    cancelled: bool,
}

impl MockAuthority {
    fn live(&self) -> bool {
        !self.cancelled && Instant::now() < self.deadline && self.failures < 3
    }

    // This is an in-process mock call, NOT a public HTTP endpoint or session issuer.
    pub fn redeem(&mut self, state: &str, code: &str, verifier: &str) -> Result<(), &'static str> {
        if !self.live()
            || state != self.state
            || !canonical(verifier)
            || !canonical(code)
            || challenge(verifier) != self.challenge
        {
            return Err("invalid simulated redemption");
        }
        let grant = self.grant.as_mut().ok_or("no confirmed browser")?;
        if grant.used || Instant::now() >= grant.deadline || hash(code) != grant.code {
            return Err("invalid simulated code");
        }
        grant.used = true; // Mutex holds validation and consumption together, in this process only.
        Ok(())
    }

    fn bind(
        &mut self,
        cookie: Option<&str>,
    ) -> Result<(Option<Zeroizing<String>>, Zeroizing<String>), &'static str> {
        if !self.live() || self.grant.is_some() {
            return Err("attempt unavailable");
        }
        if let Some(binding) = &self.browser {
            if cookie.map(hash) != Some(binding.cookie) {
                return Err("browser already bound");
            }
        }
        let cookie = if self.browser.is_none() {
            Some(random_secret()?)
        } else {
            None
        };
        let csrf = random_secret()?;
        let cookie_hash = cookie
            .as_deref()
            .map(|value| hash(value))
            .or_else(|| self.browser.as_ref().map(|binding| binding.cookie))
            .ok_or("no browser")?;
        self.browser = Some(BrowserBinding {
            cookie: cookie_hash,
            csrf: hash(&csrf),
        });
        Ok((cookie, csrf))
    }

    fn confirm(
        &mut self,
        cookie: Option<&str>,
        csrf: &str,
        approval: &str,
    ) -> Result<Zeroizing<String>, &'static str> {
        if !self.live() || self.grant.is_some() {
            return Err("attempt unavailable");
        }
        let binding = self.browser.as_ref().ok_or("no browser")?;
        if cookie.map(hash) != Some(binding.cookie) || hash(csrf) != binding.csrf {
            return Err("invalid browser context");
        }
        if hash(approval) != self.approval {
            self.failures += 1;
            return Err("confirmation rejected");
        }
        let code = random_secret()?;
        self.grant = Some(Grant {
            code: hash(&code),
            deadline: (Instant::now() + Duration::from_secs(60)).min(self.deadline),
            used: false,
        });
        Ok(code)
    }

    fn handle(&mut self, request: Request, origin: &str) -> Response {
        let cookie_name = format!("sc_lab_{}", self.state);
        // Cookies are host scoped, not port scoped. Unique per-attempt name prevents collisions;
        // a hostile local process can still read/spoof this lab's HTTP traffic.
        let cookie = request.headers.get("cookie").and_then(|value| {
            if !value.is_ascii() {
                return None;
            }
            let mut matched = None;
            for item in value.split(';') {
                // Reject malformed fragments instead of silently discarding an ambiguous cookie.
                let (name, value) = item.trim_matches([' ', '\t']).split_once('=')?;
                if name.is_empty()
                    || !name
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b))
                {
                    return None;
                }
                if name == cookie_name {
                    if matched.is_some() || !canonical(value) {
                        return None;
                    }
                    matched = Some(value);
                }
            }
            matched
        });
        if request.method == "GET" && request.target == format!("/start?state={}", self.state) {
            // This GET mutates browser binding/CSRF. SameSite cookies span ports, so a hostile
            // loopback page can otherwise rotate the legitimate form's CSRF via a no-cors fetch.
            if request.headers.contains_key("origin")
                || request.headers.get("sec-fetch-mode").map(String::as_str) != Some("navigate")
                || request.headers.get("sec-fetch-dest").map(String::as_str) != Some("document")
                || !matches!(
                    request.headers.get("sec-fetch-site").map(String::as_str),
                    Some("none" | "same-origin")
                )
            {
                return Response::new(403, "Direct laboratory navigation required.");
            }
            let Ok((new_cookie, csrf)) = self.bind(cookie) else {
                return Response::new(403, "Laboratory attempt unavailable.");
            };
            let mut response = Response::new(200, &format!("<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Steam Companion — laboratório local</title><h1>Pareamento SIMULADO</h1><p>Sem Steam, conta ou sessão. Confirme apenas a tentativa iniciada neste computador. Não aceite códigos enviados por outra pessoa.</p><p>Copie a confirmação exibida no terminal nativo. Ela é distinta do segredo S256, que nunca sai do Rust.</p><form action=\"/confirm\" method=\"post\"><input type=\"hidden\" name=\"state\" value=\"{}\"><input type=\"hidden\" name=\"csrf\" value=\"{}\"><label>Confirmação nativa <input name=\"approval\" required autocomplete=\"off\" minlength=\"43\" maxlength=\"43\"></label><button type=\"submit\">Confirmar simulação neste computador</button></form></html>", self.state, csrf.as_str()));
            if let Some(value) = new_cookie {
                // Secure/__Host deliberately NOT imitated on this HTTP-only laboratory origin.
                response.headers.push((
                    "Set-Cookie",
                    format!(
                        "{cookie_name}={}; HttpOnly; SameSite=Strict; Path=/; Max-Age=120",
                        value.as_str()
                    ),
                ));
            }
            return response;
        }
        if request.method != "POST" || request.target != "/confirm" {
            return Response::new(404, "No laboratory route.");
        }
        if request.headers.get("origin").map(String::as_str) != Some(origin)
            || request.headers.get("content-type").map(String::as_str)
                != Some("application/x-www-form-urlencoded")
        {
            return Response::new(403, "Invalid laboratory origin.");
        }
        let Some(values) = fields(&request.body, &["state", "csrf", "approval"]) else {
            return Response::new(400, "Invalid confirmation.");
        };
        if values["state"] != self.state {
            return Response::new(403, "Unknown laboratory attempt.");
        }
        match self.confirm(cookie, &values["csrf"], &values["approval"]) {
            Ok(code) => {
                // Explicit GET link avoids cross-origin POST redirects and keeps form-action self.
                // Only the pre-bound loopback address is used; no redirect parameter exists.
                let mut response = Response::new(200, &format!("<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Retorno simulado</title><h1>Confirmação simulada recebida</h1><p>Nenhuma sessão criada. O código expira em até 60 segundos.</p><a rel=\"noreferrer\" href=\"http://{}/callback?state={}&amp;code={}\">Concluir no aplicativo de laboratório</a></html>", self.callback, self.state, code.as_str()));
                response.headers.push((
                    "Set-Cookie",
                    format!("{cookie_name}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"),
                ));
                response
            }
            Err(_) => Response::new(403, "Confirmation rejected."),
        }
    }
}

pub struct Lab {
    pub browser_url: String,
    // Separate, one-time intent confirmation, deliberately shown only by the lab CLI.
    pub approval: Zeroizing<String>,
    pub callback_address: SocketAddr,
    pub completed: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    authority: Arc<Mutex<MockAuthority>>,
    _native: Server,
    _browser: Server,
}

impl Lab {
    pub fn start(lifetime: Duration) -> Result<Self, &'static str> {
        if lifetime.is_zero() || lifetime > Duration::from_secs(120) {
            return Err("invalid laboratory lifetime");
        }
        // Bind and retain the random callback port BEFORE creating or exposing any attempt.
        let listener = Server::bind().map_err(|_| "native bind failed")?;
        let callback = listener.local_addr().map_err(|_| "native address failed")?;
        let browser = Server::bind().map_err(|_| "browser bind failed")?;
        let browser_address = browser.local_addr().map_err(|_| "browser address failed")?;
        let verifier = random_secret()?;
        let state = random_secret()?;
        let approval = random_secret()?;
        let deadline = Instant::now() + lifetime;
        let authority = Arc::new(Mutex::new(MockAuthority {
            state: state.to_string(),
            challenge: challenge(&verifier),
            approval: hash(&approval),
            callback,
            deadline,
            browser: None,
            failures: 0,
            grant: None,
            cancelled: false,
        }));
        let stop = Arc::new(AtomicBool::new(false));
        let completed = Arc::new(AtomicBool::new(false));
        let native_stop = stop.clone();
        let native_completed = completed.clone();
        let native_authority = authority.clone();
        let expected_state = state.to_string();
        let native = Server::spawn(listener, stop.clone(), deadline, move |request| {
            if request.method != "GET" || request.headers.contains_key("origin")
                || request.headers.get("sec-fetch-mode").map(String::as_str) != Some("navigate")
                || request.headers.get("sec-fetch-dest").map(String::as_str) != Some("document") {
                return Response::new(403, "Native navigation required.");
            }
            let Some(query) = request.target.strip_prefix("/callback?") else { return Response::new(404, "No native route."); };
            let Some(values) = fields(query, &["state", "code"]) else { return Response::new(400, "Invalid native return."); };
            if values["state"] != expected_state || Instant::now() >= deadline {
                return Response::new(403, "No pending native attempt.");
            }
            let Ok(mut mock) = native_authority.lock() else { return Response::new(503, "Laboratory unavailable."); };
            if mock.redeem(&values["state"], &values["code"], &verifier).is_err() {
                return Response::new(403, "Simulated redemption denied.");
            }
            native_completed.store(true, Ordering::Release);
            native_stop.store(true, Ordering::Release);
            Response::new(200, "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Simulação concluída</title><h1>Pareamento simulado concluído</h1><p>Nenhuma autenticação Steam ou sessão foi criada. Pode fechar esta aba.</p></html>")
        }).map_err(|_| "native server failed")?;
        let origin = format!("http://{browser_address}");
        let browser_origin = origin.clone();
        let browser_authority = authority.clone();
        let browser_server =
            Server::spawn(
                browser,
                stop.clone(),
                deadline,
                move |request| match browser_authority.lock() {
                    Ok(mut mock) => mock.handle(request, &browser_origin),
                    Err(_) => Response::new(503, "Laboratory unavailable."),
                },
            )
            .map_err(|_| "browser server failed")?;
        Ok(Self {
            browser_url: format!("{origin}/start?state={}", state.as_str()),
            approval,
            callback_address: callback,
            completed,
            stop,
            authority,
            _native: native,
            _browser: browser_server,
        })
    }
    pub fn stopped(&self) -> bool {
        self.stop.load(Ordering::Acquire)
    }
    pub fn cancel(&self) {
        // Serialize cancellation with simulated redemption; no check-then-consume race.
        if let Ok(mut mock) = self.authority.lock() {
            mock.cancelled = true;
        }
        self.stop.store(true, Ordering::Release);
    }
}

impl Drop for Lab {
    fn drop(&mut self) {
        self.cancel();
    }
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;

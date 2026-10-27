use super::*;
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    time::Instant,
};

const NAV: &str = "Sec-Fetch-Mode: navigate\r\nSec-Fetch-Dest: document\r\n";

fn request(address: SocketAddr, method: &str, path: &str, headers: &str, body: &str) -> String {
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2)).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    write!(
        stream,
        "{method} {path} HTTP/1.1\r\nHost: {address}\r\nContent-Length: {}\r\n{headers}\r\n{body}",
        body.len()
    )
    .unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    response
}

fn hidden(response: &str, name: &str) -> String {
    response
        .split_once(&format!("name=\"{name}\" value=\""))
        .unwrap()
        .1
        .split('"')
        .next()
        .unwrap()
        .into()
}

fn context(controller: &Controller) -> (SocketAddr, SocketAddr, String, String) {
    let lab = controller.lab.as_ref().unwrap();
    let url = tauri::Url::parse(&lab.browser_url).unwrap();
    let address: SocketAddr = format!("{}:{}", url.host_str().unwrap(), url.port().unwrap())
        .parse()
        .unwrap();
    let response = request(
        address,
        "GET",
        &format!("{}?{}", url.path(), url.query().unwrap()),
        &format!("{NAV}Sec-Fetch-Site: none\r\n"),
        "",
    );
    assert!(response.starts_with("HTTP/1.1 200"));
    assert!(!response.contains("name=\"approval\""));
    assert!(!response.contains(lab.approval.as_str()));
    let cookie = response
        .lines()
        .find_map(|line| line.strip_prefix("Set-Cookie: "))
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .into();
    let body = format!(
        "state={}&csrf={}",
        hidden(&response, "state"),
        hidden(&response, "csrf")
    );
    (address, lab.callback_address, cookie, body)
}

fn confirm(address: SocketAddr, cookie: &str, body: &str) -> String {
    request(address, "POST", "/confirm", &format!("Origin: http://{address}\r\nCookie: {cookie}\r\nContent-Type: application/x-www-form-urlencoded\r\n"), body)
}

fn return_path(response: &str) -> String {
    format!(
        "/callback?{}",
        response
            .split_once("/callback?")
            .unwrap()
            .1
            .split('"')
            .next()
            .unwrap()
            .replace("&amp;", "&")
    )
}

fn closed(address: SocketAddr) {
    assert!(TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_err());
}

#[test]
fn complete_round_trip_requires_browser_then_native_approval_and_closes_both_listeners() {
    let mut controller = Controller::new();
    assert_eq!(
        controller.start(Duration::from_secs(10), |_| Ok(())),
        Ok("waiting")
    );
    assert_eq!(controller.approve(), Err("not_pending"));
    let (browser, callback, cookie, body) = context(&controller);
    let first = confirm(browser, &cookie, &body);
    assert!(!first.contains("/callback?"));
    controller.refresh();
    assert_eq!(controller.status, "confirmation_required");
    assert_eq!(controller.approve(), Ok("return_pending"));
    assert_eq!(controller.approve(), Err("not_pending"));
    let granted = confirm(browser, &cookie, &body);
    let path = return_path(&granted);
    assert!(request(callback, "GET", &path, NAV, "").starts_with("HTTP/1.1 200"));
    controller.refresh();
    assert_eq!(controller.status, "completed");
    assert!(controller.lab.is_none());
    closed(browser);
    closed(callback);
}

#[test]
fn cancel_closes_listeners_and_rejects_approval_without_an_attempt() {
    let mut controller = Controller::new();
    assert_eq!(controller.approve(), Err("not_pending"));
    controller
        .start(Duration::from_secs(10), |_| Ok(()))
        .unwrap();
    let (browser, callback, _, _) = context(&controller);
    assert_eq!(controller.cancel(), "cancelled");
    assert_eq!(controller.approve(), Err("not_pending"));
    closed(browser);
    closed(callback);
}

#[test]
fn expiry_cleanup_runs_without_frontend_polling() {
    let state = DemoState::default();
    state
        .controller
        .lock()
        .unwrap()
        .start(Duration::from_millis(150), |_| Ok(()))
        .unwrap();
    let (browser, callback, _, _) = context(&state.controller.lock().unwrap());
    let deadline = Instant::now() + Duration::from_secs(3);
    while state.controller.lock().unwrap().lab.is_some() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(state.controller.lock().unwrap().status, "expired");
    closed(browser);
    closed(callback);
}

#[test]
fn concurrent_starts_have_one_winner_and_never_open_another_browser() {
    let state = DemoState::default();
    let mut workers = Vec::new();
    for _ in 0..8 {
        let controller = state.controller.clone();
        workers.push(thread::spawn(move || {
            controller
                .lock()
                .unwrap()
                .start(Duration::from_secs(10), |_| Ok(()))
        }));
    }
    assert_eq!(
        workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .filter(Result::is_ok)
            .count(),
        1
    );
    state.shutdown();
}

#[test]
fn malformed_return_and_foreign_origin_cannot_complete_or_request_native_approval() {
    let mut controller = Controller::new();
    controller
        .start(Duration::from_secs(10), |_| Ok(()))
        .unwrap();
    let (browser, callback, cookie, body) = context(&controller);
    let forged = request(browser, "POST", "/confirm", &format!("Origin: https://evil.invalid\r\nCookie: {cookie}\r\nContent-Type: application/x-www-form-urlencoded\r\n"), &body);
    assert!(forged.starts_with("HTTP/1.1 403"));
    assert_eq!(controller.approve(), Err("not_pending"));
    assert!(request(
        callback,
        "GET",
        "/callback?state=invalid&code=invalid",
        NAV,
        ""
    )
    .starts_with("HTTP/1.1 400"));
    controller.refresh();
    assert_eq!(controller.status, "waiting");
    controller.cancel();
}

#[test]
fn a_second_browser_post_cannot_issue_another_code_or_replay_after_completion() {
    let mut controller = Controller::new();
    controller
        .start(Duration::from_secs(10), |_| Ok(()))
        .unwrap();
    let (browser, callback, cookie, body) = context(&controller);
    confirm(browser, &cookie, &body);
    controller.approve().unwrap();
    let path = return_path(&confirm(browser, &cookie, &body));
    assert!(!confirm(browser, &cookie, &body).contains("/callback?"));
    request(callback, "GET", &path, NAV, "");
    controller.refresh();
    closed(callback);
    closed(browser);
    assert_eq!(controller.cancel(), "completed");
}

#[test]
fn browser_launch_failure_and_shutdown_drop_native_state() {
    let state = DemoState::default();
    let mut controller = state.controller.lock().unwrap();
    assert_eq!(
        controller.start(Duration::from_secs(10), |_| Err(())),
        Err("browser_unavailable")
    );
    assert!(controller.lab.is_none());
    assert_eq!(controller.status, "error");
    controller
        .start(Duration::from_secs(10), |_| Ok(()))
        .unwrap();
    let (browser, callback, _, _) = context(&controller);
    drop(controller);
    state.shutdown();
    closed(browser);
    closed(callback);
}

#[test]
fn opener_rejects_arbitrary_targets_before_calling_the_os() {
    for url in [
        "https://steamcommunity.com/openid/",
        "file:///C:/Windows/win.ini",
        "http://127.0.0.1:12/start?state=bad",
        "http://localhost:123/start",
    ] {
        assert!(open_browser(url).is_err());
    }
}

#[test]
fn dropping_native_state_closes_pending_listeners_without_frontend_cleanup() {
    let state = DemoState::default();
    state
        .controller
        .lock()
        .unwrap()
        .start(Duration::from_secs(10), |_| Ok(()))
        .unwrap();
    let (browser, callback, _, _) = context(&state.controller.lock().unwrap());
    drop(state);
    closed(browser);
    closed(callback);
}

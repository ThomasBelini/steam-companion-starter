use super::*;
use std::{
    io::{Read, Write},
    net::TcpStream,
    thread,
};

fn fixture() -> (MockAuthority, Zeroizing<String>, Zeroizing<String>) {
    let verifier = random_secret().unwrap();
    let approval = random_secret().unwrap();
    (
        MockAuthority {
            state: random_secret().unwrap().to_string(),
            challenge: challenge(&verifier),
            approval: hash(&approval),
            callback: "127.0.0.1:12345".parse().unwrap(),
            deadline: Instant::now() + Duration::from_secs(120),
            browser: None,
            failures: 0,
            grant: None,
            cancelled: false,
        },
        verifier,
        approval,
    )
}

fn issue(mock: &mut MockAuthority, approval: &str) -> Zeroizing<String> {
    let (cookie, csrf) = mock.bind(None).unwrap();
    mock.confirm(
        cookie.as_deref().map(|value| value.as_str()),
        &csrf,
        approval,
    )
    .unwrap()
}

fn request(address: SocketAddr, method: &str, path: &str, headers: &str, body: &str) -> String {
    raw(address, &format!("{method} {path} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\nContent-Length: {}\r\n{headers}\r\n{body}", body.len()))
}

fn raw(address: SocketAddr, text: &str) -> String {
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2)).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    stream.write_all(text.as_bytes()).unwrap();
    let mut result = String::new();
    // A rejected oversized request can be reset while unread bytes remain.
    let _ = stream.read_to_string(&mut result);
    result
}

fn header<'a>(response: &'a str, name: &str) -> &'a str {
    response
        .lines()
        .find_map(|line| line.strip_prefix(&format!("{name}: ")))
        .unwrap()
}

fn hidden<'a>(response: &'a str, name: &str) -> &'a str {
    response
        .split_once(&format!("name=\"{name}\" value=\""))
        .unwrap()
        .1
        .split('"')
        .next()
        .unwrap()
}

fn browser_context(lab: &Lab) -> (SocketAddr, String, String, String) {
    let url = lab.browser_url.strip_prefix("http://").unwrap();
    let (address, path) = url.split_once('/').unwrap();
    let address = address.parse().unwrap();
    let response = request(
        address,
        "GET",
        &format!("/{path}"),
        &format!("{NAVIGATION}Sec-Fetch-Site: none\r\n"),
        "",
    );
    assert!(response.starts_with("HTTP/1.1 200"));
    (
        address,
        header(&response, "Set-Cookie")
            .split(';')
            .next()
            .unwrap()
            .into(),
        hidden(&response, "csrf").into(),
        hidden(&response, "state").into(),
    )
}

fn simulated_return(lab: &Lab) -> String {
    let (address, cookie, csrf, state) = browser_context(lab);
    let body = format!(
        "state={state}&csrf={csrf}&approval={}",
        lab.approval.as_str()
    );
    let response = request(address, "POST", "/confirm", &format!("Origin: http://{address}\r\nCookie: {cookie}\r\nContent-Type: application/x-www-form-urlencoded\r\n"), &body);
    assert!(response.starts_with("HTTP/1.1 200"));
    response
        .split_once("href=\"")
        .unwrap()
        .1
        .split('"')
        .next()
        .unwrap()
        .split_once("/callback?")
        .unwrap()
        .1
        .replace("&amp;", "&")
}

const NAVIGATION: &str = "Sec-Fetch-Mode: navigate\r\nSec-Fetch-Dest: document\r\n";

#[test]
fn foreign_background_get_cannot_rotate_the_browser_csrf() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let (address, cookie, csrf, state) = browser_context(&lab);
    let response = request(address, "GET", &format!("/start?state={state}"),
        &format!("Cookie: {cookie}\r\nOrigin: http://127.0.0.1:12346\r\nSec-Fetch-Mode: no-cors\r\nSec-Fetch-Dest: empty\r\nSec-Fetch-Site: same-site\r\n"), "");
    assert!(response.starts_with("HTTP/1.1 403"));
    let mock = lab.authority.lock().unwrap();
    assert_eq!(mock.browser.as_ref().unwrap().csrf, hash(&csrf));
}

#[test]
fn unicode_whitespace_must_not_be_normalized_into_a_valid_host() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let url = lab.browser_url.strip_prefix("http://").unwrap();
    let (address, path) = url.split_once('/').unwrap();
    let response = raw(address.parse().unwrap(), &format!("GET /{path} HTTP/1.1\r\nHost: \u{a0}{address}\u{a0}\r\n{NAVIGATION}Sec-Fetch-Site: none\r\n\r\n"));
    assert!(response.starts_with("HTTP/1.1 400"));
    assert!(lab.authority.lock().unwrap().browser.is_none());
}

#[test]
fn unicode_whitespace_must_not_be_normalized_into_a_valid_origin() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let (address, cookie, csrf, state) = browser_context(&lab);
    let body = format!(
        "state={state}&csrf={csrf}&approval={}",
        lab.approval.as_str()
    );
    let response = request(address, "POST", "/confirm", &format!("Origin: \u{a0}http://{address}\u{a0}\r\nCookie: {cookie}\r\nContent-Type: application/x-www-form-urlencoded\r\n"), &body);
    assert!(response.starts_with("HTTP/1.1 403"));
    assert!(lab.authority.lock().unwrap().grant.is_none());
}

#[test]
fn ambiguous_cookie_fragments_must_not_be_ignored() {
    for variant in 0..3 {
        let lab = Lab::start(Duration::from_secs(10)).unwrap();
        let (address, cookie, csrf, state) = browser_context(&lab);
        let name = cookie.split_once('=').unwrap().0;
        let ambiguous = match variant {
            0 => format!("{cookie}; {name}"),
            1 => format!("\u{a0}{cookie}"),
            _ => format!("{cookie}; {cookie}"),
        };
        let body = format!(
            "state={state}&csrf={csrf}&approval={}",
            lab.approval.as_str()
        );
        let response = request(address, "POST", "/confirm", &format!("Origin: http://{address}\r\nCookie: {ambiguous}\r\nContent-Type: application/x-www-form-urlencoded\r\n"), &body);
        assert!(response.starts_with("HTTP/1.1 403"));
        assert!(lab.authority.lock().unwrap().grant.is_none());
    }
}

#[test]
fn s256_matches_rfc7636_vector_and_canonical_encoding() {
    assert_eq!(
        challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
    let secret = random_secret().unwrap();
    assert!(canonical(&secret));
    assert_ne!(random_secret().unwrap().as_str(), secret.as_str());
    for invalid in ["", "a", &"a".repeat(43), &"A".repeat(44), &"=".repeat(43)] {
        assert!(!canonical(invalid));
    }
}

#[test]
fn valid_simulated_proof_consumes_once_without_session() {
    let (mut mock, verifier, approval) = fixture();
    let code = issue(&mut mock, &approval);
    let state = mock.state.clone();
    assert!(mock.redeem(&state, &code, &verifier).is_ok());
    assert!(mock.redeem(&state, &code, &verifier).is_err());
}

#[test]
fn cannot_redeem_before_browser_confirmation() {
    let (mut mock, verifier, _) = fixture();
    assert!(mock
        .redeem(&mock.state.clone(), &random_secret().unwrap(), &verifier)
        .is_err());
}

#[test]
fn wrong_proof_does_not_consume_the_correct_code() {
    let (mut mock, verifier, approval) = fixture();
    let code = issue(&mut mock, &approval);
    let state = mock.state.clone();
    assert!(mock
        .redeem(&state, &code, &random_secret().unwrap())
        .is_err());
    assert!(mock.redeem(&state, &code, &verifier).is_ok());
}

#[test]
fn wrong_code_or_attempt_cannot_be_redeemed() {
    let (mut mock, verifier, approval) = fixture();
    let code = issue(&mut mock, &approval);
    let other = random_secret().unwrap();
    assert!(mock.redeem(&other, &code, &verifier).is_err());
    assert!(mock.redeem(&mock.state.clone(), &other, &verifier).is_err());
}

#[test]
fn expired_attempt_and_expired_code_are_denied() {
    let (mut mock, verifier, approval) = fixture();
    let code = issue(&mut mock, &approval);
    mock.grant.as_mut().unwrap().deadline = Instant::now();
    assert!(mock.redeem(&mock.state.clone(), &code, &verifier).is_err());
    mock.grant.as_mut().unwrap().deadline = Instant::now() + Duration::from_secs(60);
    mock.deadline = Instant::now();
    assert!(mock.redeem(&mock.state.clone(), &code, &verifier).is_err());
    assert!(mock.bind(None).is_err());
}

#[test]
fn browser_cannot_be_rebound_by_another_client() {
    let (mut mock, _, _) = fixture();
    let (cookie, _) = mock.bind(None).unwrap();
    assert!(mock.bind(None).is_err());
    assert!(mock.bind(Some(&random_secret().unwrap())).is_err());
    assert!(mock
        .bind(cookie.as_deref().map(|value| value.as_str()))
        .is_ok());
}

#[test]
fn cookie_and_csrf_are_required_even_with_native_approval() {
    let (mut mock, _, approval) = fixture();
    let (cookie, csrf) = mock.bind(None).unwrap();
    assert!(mock.confirm(None, &csrf, &approval).is_err());
    assert!(mock
        .confirm(Some(&random_secret().unwrap()), &csrf, &approval)
        .is_err());
    assert!(mock
        .confirm(
            cookie.as_deref().map(|value| value.as_str()),
            &random_secret().unwrap(),
            &approval
        )
        .is_err());
    assert!(mock.grant.is_none());
}

#[test]
fn public_start_link_and_cookie_alone_cannot_authorize_pairing() {
    let (mut mock, _, _) = fixture();
    let (cookie, csrf) = mock.bind(None).unwrap();
    for _ in 0..3 {
        assert!(mock
            .confirm(
                cookie.as_deref().map(|value| value.as_str()),
                &csrf,
                &random_secret().unwrap()
            )
            .is_err());
    }
    assert!(!mock.live());
    assert!(mock.grant.is_none());
}

#[test]
fn repeated_confirmation_cannot_issue_another_code() {
    let (mut mock, _, approval) = fixture();
    issue(&mut mock, &approval);
    assert!(mock.bind(None).is_err());
    assert!(mock.confirm(None, "", &approval).is_err());
}

#[test]
fn simultaneous_redemptions_have_one_winner_in_one_process() {
    let (mut mock, verifier, approval) = fixture();
    let code = issue(&mut mock, &approval);
    let state = mock.state.clone();
    let shared = Arc::new(Mutex::new(mock));
    let mut workers = vec![];
    for _ in 0..12 {
        let (shared, verifier, code, state) = (
            shared.clone(),
            verifier.clone(),
            code.clone(),
            state.clone(),
        );
        workers.push(thread::spawn(move || {
            shared
                .lock()
                .unwrap()
                .redeem(&state, &code, &verifier)
                .is_ok()
        }));
    }
    assert_eq!(
        workers
            .into_iter()
            .filter_map(|worker| worker.join().ok())
            .filter(|won| *won)
            .count(),
        1
    );
}

#[test]
fn real_loopback_flow_closes_both_ports_after_success() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let query = simulated_return(&lab);
    let native = lab.callback_address;
    let browser: SocketAddr = lab
        .browser_url
        .strip_prefix("http://")
        .unwrap()
        .split('/')
        .next()
        .unwrap()
        .parse()
        .unwrap();
    let response = request(native, "GET", &format!("/callback?{query}"), NAVIGATION, "");
    assert!(response.starts_with("HTTP/1.1 200"));
    assert!(lab.completed.load(Ordering::Acquire));
    drop(lab);
    assert!(TcpStream::connect(native).is_err());
    assert!(TcpStream::connect(browser).is_err());
}

#[test]
fn forged_callback_does_not_finish_or_destroy_the_pending_attempt() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let query = simulated_return(&lab);
    let fake = format!(
        "state={}&code={}",
        random_secret().unwrap().as_str(),
        random_secret().unwrap().as_str()
    );
    assert!(request(
        lab.callback_address,
        "GET",
        &format!("/callback?{fake}"),
        NAVIGATION,
        ""
    )
    .starts_with("HTTP/1.1 403"));
    assert!(!lab.completed.load(Ordering::Acquire));
    assert!(request(
        lab.callback_address,
        "GET",
        &format!("/callback?{query}"),
        NAVIGATION,
        ""
    )
    .starts_with("HTTP/1.1 200"));
}

#[test]
fn returns_cannot_cross_two_native_attempts() {
    let first = Lab::start(Duration::from_secs(10)).unwrap();
    let second = Lab::start(Duration::from_secs(10)).unwrap();
    assert_ne!(first.callback_address, second.callback_address);
    let query = simulated_return(&first);
    assert!(request(
        second.callback_address,
        "GET",
        &format!("/callback?{query}"),
        NAVIGATION,
        ""
    )
    .starts_with("HTTP/1.1 403"));
    assert!(!second.completed.load(Ordering::Acquire));
    assert!(request(
        first.callback_address,
        "GET",
        &format!("/callback?{query}"),
        NAVIGATION,
        ""
    )
    .starts_with("HTTP/1.1 200"));
}

#[test]
fn return_without_a_registered_attempt_is_rejected() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let state = lab.browser_url.split("state=").nth(1).unwrap();
    let query = format!("state={state}&code={}", random_secret().unwrap().as_str());
    assert!(request(
        lab.callback_address,
        "GET",
        &format!("/callback?{query}"),
        NAVIGATION,
        ""
    )
    .starts_with("HTTP/1.1 403"));
}

#[test]
fn origin_fetch_and_invalid_callback_fields_are_denied_over_tcp() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let state = lab.browser_url.split("state=").nth(1).unwrap();
    let code = random_secret().unwrap();
    let query = format!("state={state}&code={}", code.as_str());
    for headers in ["", "Sec-Fetch-Mode: cors\r\nSec-Fetch-Dest: empty\r\n", "Sec-Fetch-Mode: navigate\r\nSec-Fetch-Dest: document\r\nOrigin: https://example.invalid\r\n"] {
        assert!(request(lab.callback_address, "GET", &format!("/callback?{query}"), headers, "").starts_with("HTTP/1.1 403"));
    }
    for query in [
        format!("{query}&state={state}"),
        format!("{query}&extra={state}"),
        format!("state={state}"),
        format!("state=%41&code={}", code.as_str()),
        format!("state={state}&code={}A", code.as_str()),
    ] {
        assert!(request(
            lab.callback_address,
            "GET",
            &format!("/callback?{query}"),
            NAVIGATION,
            ""
        )
        .starts_with("HTTP/1.1 400"));
    }
    assert!(!lab.completed.load(Ordering::Acquire));
}

#[test]
fn host_framing_and_size_attacks_are_rejected_over_tcp() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let address = lab.callback_address;
    for text in [
        "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n".into(),
        format!("GET / HTTP/1.1\r\nHost: {address}\r\nHost: {address}\r\n\r\n"),
        format!("GET / HTTP/1.1\r\nHost: {address}.evil.invalid\r\n\r\n"),
        format!("POST / HTTP/1.1\r\nHost: {address}\r\nContent-Length: 9000\r\n\r\n"),
        format!("GET / HTTP/1.1\r\nHost: {address}\r\nTransfer-Encoding: chunked\r\n\r\n"),
        format!("GET / HTTP/1.1\r\nHost: {address}\r\nContent-Length: 1\r\n\r\nx"),
        format!(
            "GET / HTTP/1.1\r\nHost: {address}\r\nX-Large: {}\r\n\r\n",
            "A".repeat(5000)
        ),
    ] {
        assert!(raw(address, &text).starts_with("HTTP/1.1 400"));
    }
    assert_eq!(address.ip().to_string(), "127.0.0.1");
}

#[test]
fn cross_origin_missing_cookie_and_csrf_confirmations_are_rejected_over_tcp() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let (address, cookie, csrf, state) = browser_context(&lab);
    let body = format!(
        "state={state}&csrf={csrf}&approval={}",
        lab.approval.as_str()
    );
    for headers in [
        format!("Origin: https://example.invalid\r\nCookie: {cookie}\r\n"),
        format!("Origin: http://{address}\r\n"),
        format!("Cookie: {cookie}\r\n"),
    ] {
        assert!(request(
            address,
            "POST",
            "/confirm",
            &format!("{headers}Content-Type: application/x-www-form-urlencoded\r\n"),
            &body
        )
        .starts_with("HTTP/1.1 403"));
    }
    assert!(!lab.completed.load(Ordering::Acquire));
}

#[test]
fn real_expiration_and_cancel_close_ports_and_interrupt_slow_connections() {
    let lab = Lab::start(Duration::from_millis(100)).unwrap();
    let address = lab.callback_address;
    let browser: SocketAddr = lab
        .browser_url
        .strip_prefix("http://")
        .unwrap()
        .split('/')
        .next()
        .unwrap()
        .parse()
        .unwrap();
    thread::sleep(Duration::from_millis(200));
    assert!(lab.stopped());
    assert!(TcpStream::connect(address).is_err());
    assert!(TcpStream::connect(browser).is_err()); // Both close on real timeout, before dropping Lab.
    drop(lab);
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let address = lab.callback_address;
    let mut stream = TcpStream::connect(address).unwrap();
    stream.write_all(b"GET /callback HTTP/1.1\r\n").unwrap();
    let start = Instant::now();
    lab.cancel();
    drop(lab);
    assert!(start.elapsed() < Duration::from_secs(2));
    assert!(TcpStream::connect(address).is_err());
}

#[test]
fn no_external_destination_or_arbitrary_return_can_be_registered() {
    assert!(Lab::start(Duration::ZERO).is_err());
    assert!(Lab::start(Duration::from_secs(121)).is_err());
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let url = lab.browser_url.strip_prefix("http://").unwrap();
    let address = url.split('/').next().unwrap().parse().unwrap();
    let state = lab.browser_url.split("state=").nth(1).unwrap();
    let response = request(
        address,
        "GET",
        &format!("/start?state={state}&redirect=http://example.invalid"),
        "",
        "",
    );
    assert!(response.starts_with("HTTP/1.1 404"));
    assert!(!response.contains("Access-Control-Allow-Origin"));
    assert!(response.contains("Cache-Control: no-store"));
    assert!(response.contains("Referrer-Policy: same-origin"));
}

#[test]
fn cancelled_attempt_cannot_redeem_a_previously_issued_code() {
    // Use the CORRECT verifier: a random wrong verifier would mask a cancellation bug.
    let (mut mock, verifier, approval) = fixture();
    let code = issue(&mut mock, &approval);
    let state = mock.state.clone();
    mock.cancelled = true;
    assert!(mock.redeem(&state, &code, &verifier).is_err());
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let query = simulated_return(&lab);
    let values = fields(&query, &["state", "code"]).unwrap();
    lab.cancel();
    let mut authority = lab.authority.lock().unwrap();
    assert!(!authority.live());
    assert!(authority
        .redeem(&values["state"], &values["code"], &random_secret().unwrap())
        .is_err());
}

#[test]
fn background_or_foreign_navigation_cannot_claim_the_first_browser_binding() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let (address, path) = lab
        .browser_url
        .strip_prefix("http://")
        .unwrap()
        .split_once('/')
        .unwrap();
    let address = address.parse().unwrap();
    for headers in [
        "",
        "Sec-Fetch-Mode: no-cors\r\nSec-Fetch-Dest: empty\r\nSec-Fetch-Site: same-site\r\n",
        "Sec-Fetch-Mode: navigate\r\nSec-Fetch-Dest: document\r\nSec-Fetch-Site: cross-site\r\n",
        "Sec-Fetch-Mode: navigate\r\nSec-Fetch-Dest: document\r\nSec-Fetch-Site: same-site\r\n",
    ] {
        assert!(
            request(address, "GET", &format!("/{path}"), headers, "").starts_with("HTTP/1.1 403")
        );
        assert!(lab.authority.lock().unwrap().browser.is_none());
    }
    browser_context(&lab); // Explicit navigation remains usable after all rejected requests.
}

#[test]
fn confirmation_origin_must_match_scheme_host_and_port_exactly() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let (address, cookie, csrf, state) = browser_context(&lab);
    let body = format!(
        "state={state}&csrf={csrf}&approval={}",
        lab.approval.as_str()
    );
    for origin in [
        "null".into(),
        format!("https://{address}"),
        "http://127.0.0.1".into(),
        "http://localhost".into(),
        format!("http://{address}/"),
        format!("http://{address}.evil.invalid"),
        format!("http://{address} http://example.invalid"),
        format!("http://user@{address}"),
    ] {
        let response = request(address, "POST", "/confirm", &format!("Origin: {origin}\r\nCookie: {cookie}\r\nContent-Type: application/x-www-form-urlencoded\r\n"), &body);
        assert!(response.starts_with("HTTP/1.1 403"));
        assert!(lab.authority.lock().unwrap().grant.is_none());
    }
    // SP/HTAB are valid HTTP OWS; keeping these valid does not permit Unicode normalization.
    let response = request(address, "POST", "/confirm", &format!("Origin: \t http://{address} \t\r\nCookie: unrelated=demo; {cookie}\r\nContent-Type: application/x-www-form-urlencoded\r\n"), &body);
    assert!(response.starts_with("HTTP/1.1 200"));
}

#[test]
fn expired_return_code_is_denied_by_the_live_native_listener() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let query = simulated_return(&lab);
    lab.authority
        .lock()
        .unwrap()
        .grant
        .as_mut()
        .unwrap()
        .deadline = Instant::now();
    let response = request(
        lab.callback_address,
        "GET",
        &format!("/callback?{query}"),
        NAVIGATION,
        "",
    );
    assert!(response.starts_with("HTTP/1.1 403"));
    assert!(!lab.completed.load(Ordering::Acquire));
}

#[test]
fn error_responses_do_not_echo_codes_cookies_or_request_values() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let marker = random_secret().unwrap();
    let response = request(
        lab.callback_address,
        "GET",
        &format!(
            "/callback?state={}&code={}",
            marker.as_str(),
            marker.as_str()
        ),
        &format!("{NAVIGATION}Cookie: marker={}\r\n", marker.as_str()),
        "",
    );
    assert!(response.starts_with("HTTP/1.1 403"));
    assert!(!response.contains(marker.as_str()));
    assert!(!response.contains("Set-Cookie:"));
}

#[test]
fn independent_http_returns_cannot_complete_the_same_attempt_twice() {
    let lab = Lab::start(Duration::from_secs(10)).unwrap();
    let query = simulated_return(&lab);
    let barrier = Arc::new(std::sync::Barrier::new(3));
    let mut workers = vec![];
    // Both connections exist before either request is released. The server serializes them;
    // this is a real local HTTP race, not a distributed Worker/D1 transaction test.
    for _ in 0..2 {
        let mut stream = TcpStream::connect(lab.callback_address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let barrier = barrier.clone();
        let text = format!(
            "GET /callback?{query} HTTP/1.1\r\nHost: {}\r\n{NAVIGATION}\r\n",
            lab.callback_address
        );
        workers.push(thread::spawn(move || {
            barrier.wait();
            let _ = stream.write_all(text.as_bytes());
            let mut response = String::new();
            let _ = stream.read_to_string(&mut response);
            response.starts_with("HTTP/1.1 200")
        }));
    }
    barrier.wait();
    assert_eq!(
        workers
            .into_iter()
            .filter_map(|worker| worker.join().ok())
            .filter(|won| *won)
            .count(),
        1
    );
    assert!(lab.completed.load(Ordering::Acquire));
}

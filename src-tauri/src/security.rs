use tauri::Url;

pub fn allows_navigation(url: &Url, development: bool) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    if development {
        return url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.port() == Some(5173);
    }
    // Origem do protocolo interno do Tauri no Windows, sem páginas externas.
    url.scheme() == "https" && url.host_str() == Some("tauri.localhost") && url.port().is_none()
}

pub fn allows_image_download(url: &Url) -> bool {
    // Somente os dois formatos já produzidos por exportImage.ts; nenhum download HTTP.
    url.as_str().starts_with("data:image/png;base64,")
        || url.as_str().starts_with("data:image/jpeg;base64,")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn development_is_limited_to_the_exact_loopback_origin() {
        assert!(allows_navigation(
            &Url::parse("http://127.0.0.1:5173/").unwrap(),
            true
        ));
        for value in [
            "http://127.0.0.1:5174/",
            "http://localhost:5173/",
            "http://127.0.0.1.evil.invalid:5173/",
            "http://user:password@127.0.0.1:5173/",
            "https://steamcommunity.com/openid/login",
            "file:///C:/Windows/win.ini",
            "javascript:alert(1)",
        ] {
            assert!(
                !allows_navigation(&Url::parse(value).unwrap(), true),
                "{value}"
            );
        }
    }

    #[test]
    fn release_never_allows_the_development_server_or_steam() {
        assert!(allows_navigation(
            &Url::parse("https://tauri.localhost/").unwrap(),
            false
        ));
        for value in [
            "http://127.0.0.1:5173/",
            "http://tauri.localhost/",
            "https://tauri.localhost.evil.invalid/",
            "https://tauri.localhost:1234/",
            "https://user:password@tauri.localhost/",
            "https://steamcommunity.com/openid/login",
            "data:text/html,hello",
        ] {
            assert!(
                !allows_navigation(&Url::parse(value).unwrap(), false),
                "{value}"
            );
        }
    }

    #[test]
    fn downloads_are_limited_to_canvas_image_urls() {
        for value in [
            "data:image/png;base64,dGVzdA==",
            "data:image/jpeg;base64,dGVzdA==",
        ] {
            assert!(allows_image_download(&Url::parse(value).unwrap()));
        }
        for value in [
            "https://example.invalid/image.png",
            "file:///C:/image.png",
            "data:text/html;base64,dGVzdA==",
            "data:image/svg+xml;base64,dGVzdA==",
            "data:image/png,not-base64",
        ] {
            assert!(
                !allows_image_download(&Url::parse(value).unwrap()),
                "{value}"
            );
        }
    }
}

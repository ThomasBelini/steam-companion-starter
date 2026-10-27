#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod security;

#[cfg(all(feature = "desktop-pairing-demo", not(all(debug_assertions, windows))))]
compile_error!("desktop-pairing-demo is restricted to Windows debug builds");

#[cfg(feature = "desktop-pairing-demo")]
#[path = "../prototype/crypto.rs"]
mod crypto;
#[cfg(feature = "desktop-pairing-demo")]
#[path = "../prototype/http.rs"]
mod http;
#[cfg(feature = "desktop-pairing-demo")]
#[path = "../prototype/pairing.rs"]
mod pairing;
#[cfg(feature = "desktop-pairing-demo")]
mod pairing_demo;

use tauri::webview::{DownloadEvent, NewWindowResponse};

fn main() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "desktop-pairing-demo")]
    let builder = builder
        .manage(pairing_demo::DemoState::default())
        .invoke_handler(tauri::generate_handler![
            pairing_demo::pairing_demo_start,
            pairing_demo::pairing_demo_status,
            pairing_demo::pairing_demo_approve,
            pairing_demo::pairing_demo_cancel
        ])
        .on_window_event(|window, event| {
            use tauri::Manager;
            if window.label() == "main"
                && matches!(
                    event,
                    tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
                )
            {
                window.state::<pairing_demo::DemoState>().shutdown();
            }
        });
    builder
        .setup(|app| {
            // Criação manual para aplicar as restrições antes da primeira navegação.
            let window = tauri::WebviewWindowBuilder::from_config(
                app.handle(),
                &app.config().app.windows[0],
            )?
            .on_navigation(|url| security::allows_navigation(url, cfg!(dev)))
            .on_new_window(|_, _| NewWindowResponse::Deny)
            .on_download(|_, event| match event {
                // Mantém o download do Canvas pelo WebView, sem IPC de filesystem.
                DownloadEvent::Requested { url, .. } => security::allows_image_download(&url),
                DownloadEvent::Finished { .. } => true,
                _ => false,
            });
            #[cfg(feature = "desktop-pairing-demo")]
            let window = window.initialization_script(
                "Object.defineProperty(window, '__SC_PAIRING_DEMO__', { value: true });",
            );
            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o Steam Companion.");
}

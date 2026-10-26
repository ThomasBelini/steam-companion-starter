#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod security;

use tauri::webview::{DownloadEvent, NewWindowResponse};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Criação manual para aplicar as restrições antes da primeira navegação.
            tauri::WebviewWindowBuilder::from_config(app.handle(), &app.config().app.windows[0])?
                .on_navigation(|url| security::allows_navigation(url, cfg!(dev)))
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .on_download(|_, event| match event {
                    // Mantém o download do Canvas pelo WebView, sem IPC de filesystem.
                    DownloadEvent::Requested { url, .. } => security::allows_image_download(&url),
                    DownloadEvent::Finished { .. } => true,
                    _ => false,
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o Steam Companion.");
}

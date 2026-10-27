fn main() {
    if std::env::var_os("CARGO_FEATURE_DESKTOP_PAIRING_DEMO").is_some()
        && std::env::var("PROFILE").as_deref() != Ok("debug")
    {
        panic!("desktop-pairing-demo is restricted to Windows debug builds");
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "pairing_demo_start",
            "pairing_demo_status",
            "pairing_demo_approve",
            "pairing_demo_cancel",
        ]),
    ))
    .expect("Tauri build configuration");
}

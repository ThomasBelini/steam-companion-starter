//! Opt-in console harness. The normal Tauri binary never imports these modules.
mod crypto;
mod http;
mod pairing;

use std::{io, sync::atomic::Ordering, thread, time::Duration};

fn main() {
    if std::env::args().skip(1).collect::<Vec<_>>() != ["--simulate"] {
        eprintln!("Isolated lab only. Run with --simulate. No Steam login is available.");
        std::process::exit(2);
    }
    let lab = match pairing::Lab::start(Duration::from_secs(120)) {
        Ok(lab) => lab,
        Err(_) => {
            eprintln!("Could not start isolated laboratory.");
            return;
        }
    };
    println!("SIMULAÇÃO LOCAL — sem Steam, Worker, D1 ou sessão.");
    println!("Abra no navegador externo: {}", lab.browser_url);
    println!(
        "Confirmação descartável (NÃO é o segredo S256): {}",
        lab.approval.as_str()
    );
    println!(
        "Listener nativo: {}. Expira em 120 s. Enter cancela.",
        lab.callback_address
    );
    // No shell/opener permission or automatic launch. A human opens only the generated loopback URL.
    let (cancel, receiver) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let mut input = String::new();
        let _ = io::stdin().read_line(&mut input);
        let _ = cancel.send(());
    });
    while !lab.stopped() {
        if receiver.try_recv().is_ok() {
            lab.cancel();
        }
        thread::sleep(Duration::from_millis(20));
    }
    if lab.completed.load(Ordering::Acquire) {
        println!("Pareamento SIMULADO concluído; nenhuma sessão emitida.");
    } else {
        println!("Simulação cancelada ou expirada.");
    }
    // Drop joins both listeners and destroys the native verifier; no disk persistence.
}

//! Debug-only bridge. IPC exchanges only a closed set of public status strings.
use crate::{crypto::canonical, pairing::Lab, security};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

struct Controller {
    lab: Option<Lab>,
    status: &'static str,
}

impl Controller {
    fn new() -> Self {
        Self {
            lab: None,
            status: "idle",
        }
    }

    fn refresh(&mut self) {
        if let Some(lab) = &self.lab {
            self.status = if lab.completed.load(Ordering::Acquire) {
                "completed"
            } else if lab.stopped() {
                "expired"
            } else {
                lab.desktop_phase().unwrap_or("error")
            };
            if matches!(self.status, "completed" | "expired" | "error") {
                self.lab.take(); // Drop joins both listeners and destroys native secrets.
            }
        }
    }

    fn start(
        &mut self,
        lifetime: Duration,
        open: impl FnOnce(&str) -> Result<(), ()>,
    ) -> Result<&'static str, &'static str> {
        self.refresh();
        if self.lab.is_some() {
            return Err("already_running");
        }
        let lab = Lab::start_desktop(lifetime).map_err(|_| {
            self.status = "error";
            "unavailable"
        })?;
        // These values remain native; never serialize Lab or errors from the OS.
        if !lab.callback_address.ip().is_loopback()
            || !canonical(&lab.approval)
            || open(&lab.browser_url).is_err()
        {
            drop(lab);
            self.status = "error";
            return Err("browser_unavailable");
        }
        self.lab = Some(lab);
        self.status = "waiting";
        Ok(self.status)
    }

    fn approve(&mut self) -> Result<&'static str, &'static str> {
        self.refresh();
        self.lab
            .as_ref()
            .ok_or("not_pending")?
            .approve_desktop()
            .map_err(|_| "not_pending")?;
        self.refresh();
        Ok(self.status)
    }

    fn cancel(&mut self) -> &'static str {
        self.refresh();
        if let Some(lab) = self.lab.take() {
            lab.cancel();
            // A return that already won before cancellation remains completed.
            self.status = if lab.completed.load(Ordering::Acquire) {
                "completed"
            } else {
                "cancelled"
            };
            drop(lab);
        }
        if self.status == "error" {
            self.status = "cancelled";
        }
        self.status
    }
}

pub struct DemoState {
    controller: Arc<Mutex<Controller>>,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl Default for DemoState {
    fn default() -> Self {
        let controller = Arc::new(Mutex::new(Controller::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let worker_controller = controller.clone();
        let worker_stop = stop.clone();
        let worker = thread::spawn(move || {
            while !worker_stop.load(Ordering::Acquire) {
                if let Ok(mut controller) = worker_controller.lock() {
                    controller.refresh();
                }
                thread::sleep(Duration::from_millis(25));
            }
        });
        Self {
            controller,
            stop,
            worker: Some(worker),
        }
    }
}

impl DemoState {
    pub fn shutdown(&self) {
        self.stop.store(true, Ordering::Release);
        if let Ok(mut controller) = self.controller.lock() {
            controller.cancel();
        }
    }
}

impl Drop for DemoState {
    fn drop(&mut self) {
        self.shutdown();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn caller(window: &tauri::WebviewWindow) -> Result<(), &'static str> {
    if window.label() != "main"
        || !window
            .url()
            .is_ok_and(|url| security::allows_navigation(&url, true))
    {
        return Err("forbidden");
    }
    Ok(())
}

#[tauri::command]
pub fn pairing_demo_start(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DemoState>,
) -> Result<&'static str, &'static str> {
    caller(&window)?;
    state
        .controller
        .lock()
        .map_err(|_| "unavailable")?
        .start(Duration::from_secs(120), open_browser)
}

#[tauri::command]
pub fn pairing_demo_status(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DemoState>,
) -> Result<&'static str, &'static str> {
    caller(&window)?;
    let mut controller = state.controller.lock().map_err(|_| "unavailable")?;
    controller.refresh();
    Ok(controller.status)
}

#[tauri::command]
pub fn pairing_demo_approve(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DemoState>,
) -> Result<&'static str, &'static str> {
    caller(&window)?;
    state
        .controller
        .lock()
        .map_err(|_| "unavailable")?
        .approve()
}

#[tauri::command]
pub fn pairing_demo_cancel(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DemoState>,
) -> Result<&'static str, &'static str> {
    caller(&window)?;
    Ok(state.controller.lock().map_err(|_| "unavailable")?.cancel())
}

fn open_browser(url: &str) -> Result<(), ()> {
    // Accept ONLY the internally generated start URL; no URL/argv is accepted by IPC.
    let parsed = tauri::Url::parse(url).map_err(|_| ())?;
    if parsed.scheme() != "http"
        || parsed.host_str() != Some("127.0.0.1")
        || parsed.port().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.path() != "/start"
        || parsed.fragment().is_some()
        || !parsed
            .query()
            .and_then(|q| q.strip_prefix("state="))
            .is_some_and(canonical)
    {
        return Err(());
    }
    open_windows_url(url)
}

fn open_windows_url(url: &str) -> Result<(), ()> {
    use std::{ffi::c_void, ptr};
    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: *mut c_void,
            operation: *const u16,
            file: *const u16,
            parameters: *const u16,
            directory: *const u16,
            show: i32,
        ) -> *mut c_void;
    }
    let operation: Vec<u16> = "open\0".encode_utf16().collect();
    let file: Vec<u16> = url.encode_utf16().chain(Some(0)).collect();
    // SAFETY: valid NUL-terminated UTF-16 buffers live through this synchronous API call.
    // No parameters, executable path, shell interpreter, elevation or arbitrary URL.
    let result = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            ptr::null(),
            ptr::null(),
            1,
        )
    };
    if result as isize > 32 {
        Ok(())
    } else {
        Err(())
    }
}

#[cfg(test)]
mod tests;

//! System tray: keeps SwitchYard one click away and lets you switch a provider
//! without opening the window.

use crate::{adapters, store};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub const TRAY_ID: &str = "switchyard-tray";
const APPLY_PREFIX: &str = "apply|";

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            _ => {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
    }
}

fn open_data_dir(app: &AppHandle) -> Result<(), String> {
    let dir = store::data_dir();
    std::fs::create_dir_all(&dir).ok();
    std::process::Command::new("explorer")
        .arg(dir.display().to_string())
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
        .inspect_err(|_| {
            let _ = app;
        })
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let data = store::load();
    let menu = Menu::new(app)?;

    menu.append(&MenuItem::with_id(app, "show", "開啟 SwitchYard", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let mut any = false;
    for spec in adapters::TOOLS {
        let providers = data.providers.get(spec.id).cloned().unwrap_or_default();
        if providers.is_empty() {
            continue;
        }
        any = true;
        let current = adapters::read_current(spec);
        let submenu = Submenu::new(app, spec.name, true)?;
        for provider in providers {
            let active = !current.base_url.is_empty()
                && provider.base_url.trim_end_matches('/') == current.base_url.trim_end_matches('/');
            let label = if active {
                format!("✓ {}", provider.name)
            } else {
                provider.name.clone()
            };
            let id = format!("{APPLY_PREFIX}{}|{}", spec.id, provider.id);
            submenu.append(&MenuItem::with_id(app, id, label, true, None::<&str>)?)?;
        }
        menu.append(&submenu)?;
    }

    if !any {
        menu.append(&MenuItem::with_id(
            app,
            "empty",
            "尚未新增供應商",
            false,
            None::<&str>,
        )?)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "data", "開啟資料資料夾", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "結束 SwitchYard", true, None::<&str>)?)?;
    Ok(menu)
}

pub fn refresh(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = build_menu(app) {
        let _ = tray.set_menu(Some(menu));
    }
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("SwitchYard — AI CLI 供應商切換器")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref().to_string();
            match id.as_str() {
                "show" => show_main(app),
                "data" => {
                    let _ = open_data_dir(app);
                }
                "quit" => app.exit(0),
                _ => {
                    if let Some(rest) = id.strip_prefix(APPLY_PREFIX) {
                        let mut parts = rest.splitn(2, '|');
                        let tool = parts.next().unwrap_or("");
                        let provider = parts.next().unwrap_or("");
                        let result = crate::apply_from_tray(tool, provider);
                        let payload = match result {
                            Ok(message) => serde_json::json!({ "text": message, "kind": "ok" }),
                            Err(err) => serde_json::json!({ "text": err, "kind": "err" }),
                        };
                        let _ = app.emit("switchyard://toast", payload);
                        let _ = app.emit("switchyard://changed", ());
                        refresh(app);
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

use tauri::Emitter as _;

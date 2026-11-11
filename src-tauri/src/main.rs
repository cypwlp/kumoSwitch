#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod adapters;
mod backup;
mod crypto;
mod history;
#[cfg(test)]
mod e2e_tests;
mod jsonc;
mod net;
mod presets;
mod proxy;
mod store;
mod usage;
mod tray;
mod yamlpatch;

use adapters::{CurrentState, Fmt, Provider, ToolSpec, TOOLS};
use serde::Serialize;

#[derive(Serialize)]
struct ToolView {
    id: &'static str,
    name: &'static str,
    blurb: &'static str,
    path: String,
    format: &'static str,
    verified: bool,
    restart: &'static str,
    detected: bool,
    takeover: bool,
    provider_count: usize,
    active_id: Option<String>,
    current: CurrentState,
    kind_choices: Vec<&'static str>,
    importable: usize,
}

#[derive(Serialize)]
struct FileDiff {
    file: String,
    fmt: &'static str,
    existed: bool,
    diff: String,
    added: usize,
    removed: usize,
}

#[derive(Serialize)]
struct Preview {
    files: Vec<FileDiff>,
    warnings: Vec<String>,
}

#[derive(Serialize)]
struct ApplyResult {
    changed: bool,
    backup_id: Option<String>,
    written: Vec<String>,
    message: String,
}

#[derive(Serialize)]
struct ImportResult {
    imported: Vec<Provider>,
    skipped: usize,
}

#[derive(Serialize)]
struct ExportResult {
    path: String,
    count: usize,
}

#[derive(Serialize)]
struct JsonImportResult {
    imported: usize,
    skipped: usize,
}

fn takeover_state(tool: &str) -> bool {
    let key = match tool {
        "grok" => "grokbuild",
        other => other,
    };
    let path = adapters::home().join(".cc-switch").join("live-state.json");
    let Ok(text) = std::fs::read_to_string(path) else {
        return false;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        return false;
    };
    json.get("apps")
        .and_then(|apps| apps.get(key))
        .and_then(|app| app.get("attached"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn spec(tool: &str) -> Result<&'static ToolSpec, String> {
    adapters::find(tool).ok_or_else(|| format!("未知的工具：{tool}"))
}

fn configured_kind(spec: &ToolSpec, provider: &mut Provider) {
    if provider.kind.trim().is_empty() {
        provider.kind = spec.kind_choices.first().copied().unwrap_or("").to_string();
    }
}

fn same_endpoint(a: &str, b: &str) -> bool {
    !a.is_empty() && a.trim_end_matches('/') == b.trim_end_matches('/')
}

#[tauri::command]
fn tool_list() -> Vec<ToolView> {
    let data = store::load();
    TOOLS
        .iter()
        .map(|spec| {
            let providers = data.providers.get(spec.id).cloned().unwrap_or_default();
            let current = adapters::read_current(spec);
            // Prefer what the config file actually says over our own bookkeeping.
            let active_id = providers
                .iter()
                .find(|p| {
                    same_endpoint(&p.base_url, &current.base_url)
                        && (p.model.is_empty() || current.model.is_empty() || p.model == current.model)
                })
                .map(|p| p.id.clone())
                .or_else(|| data.active.get(spec.id).cloned());
            let path = adapters::resolve_file(spec, spec.default_file);
            ToolView {
                id: spec.id,
                name: spec.name,
                blurb: spec.blurb,
                path: adapters::display_path(&path),
                format: match spec.steps.first().map(|s| s.fmt) {
                    Some(Fmt::Toml) => "TOML",
                    Some(Fmt::Json) => "JSON",
                    Some(Fmt::Yaml) => "YAML",
                    Some(Fmt::Env) => "ENV",
                    None => "—",
                },
                verified: spec.verified,
                restart: spec.restart,
                detected: adapters::tool_dir(spec).exists(),
                takeover: takeover_state(spec.id),
                provider_count: providers.len(),
                active_id,
                current,
                kind_choices: spec.kind_choices.to_vec(),
                importable: adapters::discover(spec).len(),
            }
        })
        .collect()
}

#[tauri::command]
fn provider_list(tool: String) -> Vec<Provider> {
    store::list(&tool)
}

#[tauri::command]
fn provider_save(
    tool: String,
    provider: Provider,
    app: tauri::AppHandle,
) -> Result<Provider, String> {
    let spec = spec(&tool)?;
    if provider.name.trim().is_empty() {
        return Err("請填寫供應商名稱".into());
    }
    if provider.base_url.trim().is_empty() {
        return Err("請填寫 Base URL".into());
    }
    let mut provider = provider;
    configured_kind(spec, &mut provider);
    let saved = store::upsert(&tool, provider)?;
    tray::refresh(&app);
    Ok(saved)
}

#[tauri::command]
fn provider_delete(tool: String, id: String, app: tauri::AppHandle) -> Result<(), String> {
    store::remove(&tool, &id)?;
    tray::refresh(&app);
    Ok(())
}

fn load_provider(tool: &str, provider_id: &str) -> Result<(&'static ToolSpec, Provider), String> {
    let spec = spec(tool)?;
    let mut provider = store::list(tool)
        .into_iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| "找不到這個供應商".to_string())?;
    configured_kind(spec, &mut provider);
    Ok((spec, provider))
}

fn build_diffs(spec: &ToolSpec, provider: &Provider) -> Result<Vec<FileDiff>, String> {
    let changes = adapters::plan(spec, provider)?;
    let mut out = Vec::new();
    for change in changes {
        if change.before == change.after {
            continue;
        }
        let diff = similar::TextDiff::from_lines(&change.before, &change.after);
        let mut added = 0;
        let mut removed = 0;
        for op in diff.ops() {
            match op {
                similar::DiffOp::Insert { new_len, .. } => added += new_len,
                similar::DiffOp::Delete { old_len, .. } => removed += old_len,
                similar::DiffOp::Replace { old_len, new_len, .. } => {
                    removed += old_len;
                    added += new_len;
                }
                similar::DiffOp::Equal { .. } => {}
            }
        }
        let body = diff
            .unified_diff()
            .context_radius(3)
            .header("目前", "套用後")
            .to_string();
        out.push(FileDiff {
            file: change.file,
            fmt: change.fmt,
            existed: change.existed,
            diff: body,
            added,
            removed,
        });
    }
    Ok(out)
}

fn build_warnings(spec: &ToolSpec, provider: &Provider) -> Vec<String> {
    let mut warnings = Vec::new();
    let current = adapters::read_current(spec);
    if provider.model.trim().is_empty() && !current.model.is_empty() {
        warnings.push(format!(
            "此供應商未填模型，將沿用目前的「{}」。要一併切換請先補上模型名稱。",
            current.model
        ));
    }
    if !spec.verified {
        warnings.push(format!(
            "{} 的設定格式尚未在真實安裝上驗證，請仔細核對下方 diff 再套用。",
            spec.name
        ));
    }
    if takeover_state(spec.id) {
        warnings.push("cc-switch 正以代理模式接管此工具，套用後可能被它覆蓋。".into());
    }
    warnings
}

#[tauri::command]
fn preview(tool: String, provider_id: String) -> Result<Preview, String> {
    let (spec, provider) = load_provider(&tool, &provider_id)?;
    Ok(Preview {
        files: build_diffs(spec, &provider)?,
        warnings: build_warnings(spec, &provider),
    })
}

/// Write via a sibling temp file so an interrupted write can never leave the
/// user's config truncated.
fn write_atomic(path: &std::path::Path, text: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("switchyard-tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)
}

fn apply_core(tool: &str, provider_id: &str) -> Result<ApplyResult, String> {
    let (spec, provider) = load_provider(tool, provider_id)?;
    let changes = adapters::plan(spec, &provider)?;
    let pending: Vec<_> = changes.iter().filter(|c| c.before != c.after).collect();

    if pending.is_empty() {
        store::touch(tool, provider_id);
        return Ok(ApplyResult {
            changed: false,
            backup_id: None,
            written: Vec::new(),
            message: "設定已是最新，沒有需要寫入的變更".into(),
        });
    }

    let files: Vec<_> = pending.iter().map(|c| (c.path.clone(), c.file.clone())).collect();
    let (backup_id, _) = backup::snapshot(&tool, &files)?;

    let mut written = Vec::new();
    for change in &pending {
        if let Some(parent) = change.path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("無法建立目錄 {}：{e}", parent.display()))?;
        }
        write_atomic(&change.path, &change.after)
            .map_err(|e| format!("寫入 {} 失敗：{e}", change.file))?;
        written.push(change.file.clone());
    }

    store::touch(tool, provider_id);
    Ok(ApplyResult {
        changed: true,
        backup_id: Some(backup_id),
        written,
        message: format!("已套用「{}」", provider.name),
    })
}

#[tauri::command]
fn apply_provider(
    tool: String,
    provider_id: String,
    app: tauri::AppHandle,
) -> Result<ApplyResult, String> {
    let result = apply_core(&tool, &provider_id)?;
    tray::refresh(&app);
    Ok(result)
}

/// Entry point used by the tray menu, where there is no window to reply to.
pub fn apply_from_tray(tool: &str, provider_id: &str) -> Result<String, String> {
    apply_core(tool, provider_id).map(|r| r.message)
}

#[tauri::command]
fn import_from_config(tool: String, app: tauri::AppHandle) -> Result<ImportResult, String> {
    let spec = spec(&tool)?;
    let existing = store::list(&tool);
    let mut imported = Vec::new();
    let mut skipped = 0usize;
    for mut provider in adapters::discover(spec) {
        if existing.iter().any(|p| p.config_id == provider.config_id) {
            skipped += 1;
            continue;
        }
        configured_kind(spec, &mut provider);
        imported.push(store::upsert(&tool, provider)?);
    }
    tray::refresh(&app);
    Ok(ImportResult { imported, skipped })
}

#[tauri::command]
fn test_provider(tool: String, provider_id: String) -> Result<net::TestResult, String> {
    let (_, provider) = load_provider(&tool, &provider_id)?;
    let result = net::probe(&provider.base_url, &provider.api_key, tool == "claude");
    let _ = history::record(&tool, &provider_id, result.ok, result.ms as u64, result.status);
    Ok(result)
}

#[tauri::command]
fn test_history(tool: String) -> std::collections::BTreeMap<String, history::Summary> {
    history::summaries(&tool)
}

#[tauri::command]
fn export_providers() -> Result<ExportResult, String> {
    let data = store::load();
    let count = data.providers.values().map(|v| v.len()).sum();
    let dir = store::data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("switchyard-export-{}.json", store::stamp()));
    let text = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("匯出失敗：{e}"))?;
    Ok(ExportResult { path: adapters::display_path(&path), count })
}

#[tauri::command]
fn import_providers_json(
    text: String,
    app: tauri::AppHandle,
) -> Result<JsonImportResult, String> {
    let incoming: store::Store =
        serde_json::from_str(&text).map_err(|e| format!("檔案格式不符：{e}"))?;
    let mut current = store::load();
    let mut imported = 0usize;
    let mut skipped = 0usize;
    for (tool, list) in incoming.providers {
        if adapters::find(&tool).is_none() {
            skipped += list.len();
            continue;
        }
        let entry = current.providers.entry(tool).or_default();
        for provider in list {
            if entry.iter().any(|p| p.config_id == provider.config_id) {
                skipped += 1;
                continue;
            }
            let mut provider = provider;
            provider.id = format!("p{}", store::stamp() + imported as u128);
            entry.push(provider);
            imported += 1;
        }
    }
    store::save(&current)?;
    tray::refresh(&app);
    Ok(JsonImportResult { imported, skipped })
}

#[tauri::command]
fn export_diagnostics() -> Result<ExportResult, String> {
    let data = store::load();
    let mut report = String::new();
    report.push_str(&format!("SwitchYard {}
", env!("CARGO_PKG_VERSION")));
    report.push_str(&format!("OS: {} {}
", std::env::consts::OS, std::env::consts::ARCH));
    report.push_str(&format!("資料目錄: {}
", adapters::display_path(&store::data_dir())));
    report.push_str(&format!("金鑰加密: {}
", if crypto::available() { "DPAPI" } else { "無（明文）" }));
    report.push_str(&format!("cc-switch 設定存在: {}
", adapters::home().join(".cc-switch").exists()));
    report.push_str("
--- 工具 ---
");
    let mut count = 0;
    for spec in TOOLS {
        let providers = data.providers.get(spec.id).cloned().unwrap_or_default();
        count += providers.len();
        let current = adapters::read_current(spec);
        report.push_str(&format!(
            "{:<14} 偵測={:<5} 驗證={:<5} 供應商={}  接管={}  來源={}
",
            spec.id,
            adapters::tool_dir(spec).exists(),
            spec.verified,
            providers.len(),
            takeover_state(spec.id),
            if current.source.is_empty() { "-" } else { &current.source },
        ));
        report.push_str(&format!("{:<14} 路徑={}
", "", adapters::display_path(&adapters::resolve_file(spec, spec.default_file))));
        for provider in providers {
            let tail = if provider.api_key.is_empty() { "金鑰=無".to_string() } else { format!("金鑰尾={}", &provider.api_key[provider.api_key.len().saturating_sub(4)..]) };
            report.push_str(&format!("{:<14}   - {} | {} | {} | {}
", "", provider.name, provider.base_url, provider.model, tail));
        }
    }
    let dir = store::data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("switchyard-diagnostics-{}.txt", store::stamp()));
    std::fs::write(&path, report).map_err(|e| format!("寫入失敗：{e}"))?;
    Ok(ExportResult { path: adapters::display_path(&path), count })
}

#[tauri::command]
fn proxy_status() -> proxy::ProxyConfig {
    store::load().proxy
}

#[tauri::command]
fn proxy_save(config: proxy::ProxyConfig) -> Result<proxy::ProxyConfig, String> {
    let mut data = store::load();
    data.proxy = config.clone();
    store::save(&data)?;
    proxy::start();
    Ok(config)
}

/// Point a tool at the local proxy by applying a dedicated provider entry.
#[tauri::command]
fn proxy_attach(tool: String, app: tauri::AppHandle) -> Result<ApplyResult, String> {
    let config = store::load().proxy;
    let provider = Provider {
        id: String::new(),
        config_id: "switchyard-proxy".into(),
        name: "SwitchYard 代理".into(),
        base_url: format!("http://127.0.0.1:{}/v1", config.port),
        api_key: "switchyard-proxy".into(),
        api_key_enc: String::new(),
        model: String::new(),
        kind: String::new(),
        note: "經本地代理＋故障轉移".into(),
        last_used: 0,
    };
    let saved = store::upsert(&tool, provider)?;
    let result = apply_core(&tool, &saved.id)?;
    tray::refresh(&app);
    Ok(result)
}

#[tauri::command]
fn usage_report(days: u32) -> usage::UsageReport {
    usage::report(days.clamp(1, 365))
}

#[tauri::command]
fn health_overview() -> history::HealthOverview {
    history::overview()
}

#[tauri::command]
fn provider_presets() -> Vec<presets::Preset> {
    presets::list().to_vec()
}

#[tauri::command]
fn set_auto_health(enabled: bool) -> Result<bool, String> {
    let mut data = store::load();
    data.auto_health = enabled;
    store::save(&data)?;
    Ok(enabled)
}

/// Periodically re-test providers that already have history, so the health
/// column stays meaningful without manual clicks. Off by default.
fn spawn_health_loop(app: tauri::AppHandle) {
    use tauri::Emitter as _;
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(600));
        let data = store::load();
        if !data.auto_health {
            continue;
        }
        let mut any = false;
        for (tool, list) in &data.providers {
            let summaries = history::summaries(tool);
            for provider in list {
                if !summaries.get(&provider.id).map(|s| s.total > 0).unwrap_or(false) {
                    continue;
                }
                let result = net::probe(&provider.base_url, &provider.api_key, tool == "claude");
                let _ = history::record(tool, &provider.id, result.ok, result.ms as u64, result.status);
                any = true;
            }
        }
        if any {
            let _ = app.emit("switchyard://changed", ());
        }
    });
}

#[tauri::command]
fn backup_list(tool: String) -> Vec<backup::BackupInfo> {
    backup::list(&tool)
}

#[tauri::command]
fn backup_restore(tool: String, id: String) -> Result<Vec<String>, String> {
    backup::restore(&tool, &id)
}

#[tauri::command]
fn reveal_config(tool: String) -> Result<(), String> {
    let spec = spec(&tool)?;
    let path = adapters::resolve_file(spec, spec.default_file);
    let target = if path.exists() { path } else { adapters::tool_dir(spec) };
    reveal_path(target.to_string_lossy().to_string())
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let expanded = if let Some(rest) = path.strip_prefix("~/") {
        adapters::home().join(rest)
    } else {
        std::path::PathBuf::from(&path)
    };
    let target = if expanded.is_file() {
        expanded
    } else if expanded.is_dir() {
        expanded
    } else {
        expanded.parent().map(|p| p.to_path_buf()).unwrap_or(expanded)
    };
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", target.display()))
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("無法開啟檔案總管：{e}"))
}

#[tauri::command]
fn app_info() -> serde_json::Value {
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "dataDir": adapters::display_path(&store::data_dir()),
        "encrypted": crypto::available(),
        "autoHealth": store::load().auto_health,
    })
}

fn main() {
    if store::needs_migration() {
        let _ = store::migrate();
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main(app);
        }))
        .setup(|app| {
            tray::install(app.handle())?;
            spawn_health_loop(app.handle().clone());
            proxy::start();
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Keep running in the tray; quit lives in the tray menu.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            tool_list,
            provider_list,
            provider_save,
            provider_delete,
            preview,
            apply_provider,
            import_from_config,
            test_provider,
            test_history,
            set_auto_health,
            usage_report,
            provider_presets,
            health_overview,
            proxy_status,
            proxy_save,
            proxy_attach,
            export_providers,
            export_diagnostics,
            import_providers_json,
            backup_list,
            backup_restore,
            reveal_config,
            reveal_path,
            app_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod write_path_tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("switchyard-{tag}-{}", store::stamp()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn atomic_write_replaces_content_and_leaves_no_temp_file() {
        let dir = temp_dir("atomic");
        let file = dir.join("config.toml");
        std::fs::write(&file, "model = \"old\"\n").unwrap();
        write_atomic(&file, "model = \"new\"\n").unwrap();

        assert_eq!(std::fs::read_to_string(&file).unwrap(), "model = \"new\"\n");
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains("switchyard-tmp"))
            .collect();
        assert!(leftovers.is_empty(), "暫存檔沒有被清掉");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn snapshot_records_the_files_it_copied() {
        let dir = temp_dir("snapshot");
        let file = dir.join("config.toml");
        std::fs::write(&file, "before = true\n").unwrap();
        let tool = format!("testtool{}", store::stamp());

        let (id, created) = backup::snapshot(&tool, &[(file.clone(), file.display().to_string())]).unwrap();
        assert!(!created.is_empty());
        let listed = backup::list(&tool);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, id);

        std::fs::remove_dir_all(store::data_dir().join("backups").join(&tool)).ok();
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restore_rejects_path_traversal_ids() {
        assert!(backup::restore("codex", "../../etc").is_err());
    }

    #[test]
    fn endpoint_comparison_ignores_trailing_slash() {
        assert!(same_endpoint("https://a/v1/", "https://a/v1"));
        assert!(!same_endpoint("", ""));
    }
}

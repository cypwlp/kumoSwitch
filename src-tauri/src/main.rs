#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod adapters;
mod audit;
mod backup;
mod ccswitch;
mod compat;
mod crypto;
mod export_crypto;
mod guardian;
mod harness_manager;
mod history;
mod keys;
mod profiles;
#[cfg(test)]
mod e2e_tests;
mod jsonc;
mod net;
mod presets;
mod proxy;
mod secure_fs;
mod store;
mod usage;
mod tray;
mod yamlpatch;

use adapters::{CurrentState, Fmt, ModelCheck, ModelProfile, Provider, ToolSpec, TOOLS};
use tauri::Emitter as _;
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

#[derive(Serialize)]
struct ToolView {
    id: &'static str,
    name: &'static str,
    blurb: &'static str,
    path: String,
    format: &'static str,
    verified: bool,
    surface: &'static str,
    reasoning_levels: Vec<&'static str>,
    reasoning_target: &'static str,
    restart: &'static str,
    detected: bool,
    takeover: bool,
    provider_count: usize,
    active_id: Option<String>,
    previous_id: Option<String>,
    current: CurrentState,
    kind_choices: Vec<&'static str>,
    importable: usize,
    cc_switch: Option<ccswitch::CcSwitchSource>,
}

#[derive(Serialize)]
struct DriftReport {
    tool: String,
    tool_name: String,
    status: String,
    active_id: Option<String>,
    expected_name: Option<String>,
    current_base_url: String,
    current_model: String,
    current_key_tail: String,
    expected_base_url: String,
    expected_model: String,
    expected_key_tail: String,
    changed_fields: Vec<String>,
    unmanaged_providers: Vec<String>,
    message: String,
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
    changed_fields: Vec<String>,
}

#[derive(Serialize)]
struct ApplyResult {
    changed: bool,
    backup_id: Option<String>,
    written: Vec<String>,
    message: String,
}

#[derive(Serialize)]
struct ModelTestResult {
    model: ModelProfile,
    result: net::TestResult,
}

#[derive(Clone, Debug, Serialize)]
struct LiveTestPolicy {
    daily_limit: u32,
    used_24h: u32,
    remaining_24h: u32,
    max_output_tokens: u32,
}

const LIVE_TEST_WINDOW_MS: u64 = 24 * 60 * 60 * 1000;
static LIVE_TEST_QUOTA: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn live_test_used_24h(data: &store::Store, now: u64) -> u32 {
    data.live_test_runs
        .iter()
        .filter(|ts| now.saturating_sub(**ts) < LIVE_TEST_WINDOW_MS)
        .count() as u32
}

fn live_test_policy_for(data: &store::Store, now: u64) -> LiveTestPolicy {
    let used = live_test_used_24h(data, now);
    let daily_limit = data.live_test_daily_limit.clamp(1, 200);
    LiveTestPolicy {
        daily_limit,
        used_24h: used,
        remaining_24h: daily_limit.saturating_sub(used),
        max_output_tokens: data.live_test_max_output_tokens.clamp(1, 128),
    }
}

#[derive(Serialize)]
struct ProviderSearchRow {
    tool: String,
    tool_name: String,
    provider: ProviderView,
}

#[derive(Serialize)]
struct ModelReasoningView {
    levels: Vec<String>,
    default_level: String,
    source: &'static str,
    supported: bool,
    target: &'static str,
    context_window: Option<u64>,
    max_output: Option<u64>,
    message: String,
}

#[derive(Serialize)]
struct ModelDiscoveryView {
    models: Vec<ModelProfile>,
    missing: Vec<String>,
    endpoint: String,
    message: String,
}

#[derive(Serialize)]
struct ProviderView {
    id: String,
    config_id: String,
    name: String,
    base_url: String,
    /// Always empty on the IPC boundary; use `reveal_provider_key` explicitly.
    api_key: String,
    api_key_masked: String,
    has_api_key: bool,
    model: String,
    models: Vec<ModelProfile>,
    kind: String,
    note: String,
    profile_id: String,
    api_keys: Vec<keys::ApiKeyView>,
    last_used: u64,
    model_synced_at: u64,
    previous_model: String,
    model_sync_interval_secs: u64,
    model_sync_jitter_secs: u64,
    model_sync_next_at: u64,
    model_sync_retry_at: u64,
    model_sync_failures: u32,
    model_sync_last_error: String,
}

impl From<Provider> for ProviderView {
    fn from(mut provider: Provider) -> Self {
        adapters::normalize_provider_models(&mut provider);
        let has_api_key = !provider.api_key.is_empty();
        let api_key_masked = mask_key(&provider.api_key);
        let api_keys = keys::views(&provider);
        ProviderView {
            id: provider.id,
            config_id: provider.config_id,
            name: provider.name,
            base_url: provider.base_url,
            api_key: String::new(),
            api_key_masked,
            has_api_key,
            model: provider.model,
            models: provider.models,
            kind: provider.kind,
            note: provider.note,
            profile_id: provider.profile_id,
            api_keys,
            last_used: provider.last_used,
            model_synced_at: provider.model_synced_at,
            previous_model: provider.previous_model,
            model_sync_interval_secs: provider.model_sync_interval_secs,
            model_sync_jitter_secs: provider.model_sync_jitter_secs,
            model_sync_next_at: provider.model_sync_next_at,
            model_sync_retry_at: provider.model_sync_retry_at,
            model_sync_failures: provider.model_sync_failures,
            model_sync_last_error: provider.model_sync_last_error,
        }
    }
}

#[derive(Deserialize)]
struct ProviderInput {
    #[serde(default)]
    id: String,
    #[serde(default)]
    config_id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    base_url: String,
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    clear_api_key: bool,
    #[serde(default)]
    model: String,
    #[serde(default)]
    models: Vec<ModelProfile>,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    note: String,
    #[serde(default)]
    profile_id: String,
    #[serde(default)]
    last_used: u64,
    #[serde(default)]
    model_synced_at: u64,
    #[serde(default)]
    previous_model: String,
    #[serde(default = "adapters::default_model_sync_interval_secs")]
    model_sync_interval_secs: u64,
    #[serde(default = "adapters::default_model_sync_jitter_secs")]
    model_sync_jitter_secs: u64,
    #[serde(default)]
    model_sync_next_at: u64,
    #[serde(default)]
    model_sync_retry_at: u64,
    #[serde(default)]
    model_sync_failures: u32,
    #[serde(default)]
    model_sync_last_error: String,
}

impl From<ProviderInput> for Provider {
    fn from(provider: ProviderInput) -> Self {
        let mut provider = Provider {
            id: provider.id,
            config_id: provider.config_id,
            name: provider.name,
            base_url: provider.base_url,
            api_key: provider.api_key,
            api_key_enc: String::new(),
            model: provider.model,
            models: provider.models,
            kind: provider.kind,
            note: provider.note,
            profile_id: provider.profile_id,
            api_keys: Vec::new(),
            last_used: provider.last_used,
            model_synced_at: provider.model_synced_at,
            previous_model: provider.previous_model,
            model_sync_interval_secs: provider.model_sync_interval_secs,
            model_sync_jitter_secs: provider.model_sync_jitter_secs,
            model_sync_next_at: provider.model_sync_next_at,
            model_sync_retry_at: provider.model_sync_retry_at,
            model_sync_failures: provider.model_sync_failures,
            model_sync_last_error: provider.model_sync_last_error,
        };
        adapters::normalize_provider_models(&mut provider);
        provider
    }
}

fn mask_key(key: &str) -> String {
    let count = key.chars().count();
    if count == 0 {
        return String::new();
    }
    let tail: String = key.chars().skip(count.saturating_sub(4)).collect();
    format!("••••{tail}")
}

fn redaction_keys(provider: &Provider) -> Vec<String> {
    let mut keys: Vec<String> = store::load()
        .providers
        .values()
        .flatten()
        .flat_map(|item| std::iter::once(item.api_key.clone()).chain(item.api_keys.iter().map(|key| key.secret.clone())))
        .filter(|key| key.chars().count() >= 4)
        .collect();
    if provider.api_key.chars().count() >= 4 {
        keys.push(provider.api_key.clone());
    }
    keys.extend(provider.api_keys.iter().map(|key| key.secret.clone()).filter(|key| key.chars().count() >= 4));
    keys.sort();
    keys.dedup();
    keys.sort_by(|left, right| right.len().cmp(&left.len()));
    keys
}

fn redact_keys(text: &str, keys: &[String]) -> String {
    let mut redacted = text.to_string();
    for key in keys {
        if redacted.contains(key) {
            redacted = redacted.replace(key, &mask_key(key));
        }
    }
    redacted
}

#[derive(Serialize)]
struct ImportResult {
    imported: Vec<ProviderView>,
    skipped: usize,
}

#[derive(Serialize)]
struct CcSwitchImportResult {
    provider: ProviderView,
    already_imported: bool,
}

#[derive(Serialize)]
struct CcSwitchBatchResult {
    imported: usize,
    skipped: usize,
    providers: Vec<ProviderView>,
}

#[derive(Serialize)]
struct CcSwitchRouteResult {
    imported: usize,
    stack: Vec<String>,
    providers: Vec<ProviderView>,
}

#[derive(Serialize)]
struct PreUpdateBackupResult {
    snapshots: usize,
    tools: usize,
}

#[derive(Serialize)]
struct ExportResult {
    path: String,
    count: usize,
    sha256: Option<String>,
}

#[derive(Serialize)]
struct JsonImportResult {
    imported: usize,
    skipped: usize,
}

#[derive(Serialize)]
struct ProviderConfigPreview {
    file: String,
    fmt: &'static str,
    content: String,
}

#[derive(Serialize)]
struct ImportCandidate {
    tool: String,
    tool_name: String,
    config_id: String,
    name: String,
    base_url: String,
    model: String,
    models: Vec<ModelProfile>,
    kind: String,
    conflict: bool,
    differences: Vec<String>,
}

#[derive(Deserialize)]
struct ImportDecision {
    tool: String,
    config_id: String,
    action: String,
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

fn uses_anthropic_wire(tool: &str, kind: &str) -> bool {
    tool == "claude" || kind.to_ascii_lowercase().contains("anthropic")
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
    let cc_switch = ccswitch::read_snapshot();
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
            let previous_id = data
                .previous_active
                .get(spec.id)
                .filter(|id| providers.iter().any(|provider| &provider.id == *id))
                .cloned();
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
                surface: harness_manager::surface_for(spec.id).as_str(),
                reasoning_levels: adapters::reasoning_levels_for_tool(spec.id).to_vec(),
                reasoning_target: adapters::reasoning_target_for_tool(spec.id),
                restart: spec.restart,
                detected: adapters::tool_dir(spec).exists(),
                takeover: takeover_state(spec.id),
                provider_count: providers.len(),
                active_id,
                previous_id,
                current,
                kind_choices: spec.kind_choices.to_vec(),
                importable: adapters::discover(spec).len(),
                cc_switch: cc_switch.view_for(spec.id, &providers),
            }
        })
        .collect()
}

#[tauri::command]
fn drift_overview() -> Vec<DriftReport> {
    let data = store::load();
    TOOLS
        .iter()
        .map(|spec| {
            let providers = data.providers.get(spec.id).cloned().unwrap_or_default();
            let current = adapters::read_current(spec);
            let matched = providers.iter().find(|provider| {
                same_endpoint(&provider.base_url, &current.base_url)
                    && (provider.model.is_empty()
                        || current.model.is_empty()
                        || provider.model == current.model)
            });
            let endpoint_match = providers
                .iter()
                .find(|provider| same_endpoint(&provider.base_url, &current.base_url));
            let expected = data
                .active
                .get(spec.id)
                .and_then(|id| providers.iter().find(|provider| &provider.id == id))
                .or_else(|| endpoint_match)
                .or(matched);
            let discovered = adapters::discover(spec);
            let unmanaged_providers = discovered
                .iter()
                .filter(|provider| {
                    !providers
                        .iter()
                        .any(|known| known.config_id == provider.config_id)
                })
                .map(|provider| provider.config_id.clone())
                .collect::<Vec<_>>();

            let mut changed_fields = Vec::new();
            if let Some(expected) = expected {
                if !current.base_url.is_empty() && !same_endpoint(&expected.base_url, &current.base_url) {
                    changed_fields.push("Base URL".to_string());
                }
                if !current.model.is_empty() && !expected.model.is_empty() && current.model != expected.model {
                    changed_fields.push("模型".to_string());
                }
                let expected_tail = mask_key(&expected.api_key);
                if !current.api_key_tail.is_empty()
                    && !expected_tail.is_empty()
                    && current.api_key_tail != expected_tail
                {
                    changed_fields.push("API Key".to_string());
                }
            }
            if endpoint_match.is_none() && !current.base_url.is_empty() {
                changed_fields.push("供應商".to_string());
            }
            if !unmanaged_providers.is_empty() {
                changed_fields.push("未納管供應商".to_string());
            }
            changed_fields.sort();
            changed_fields.dedup();

            let has_current = !current.base_url.is_empty() || !current.model.is_empty();
            let status = if !has_current && unmanaged_providers.is_empty() {
                "empty"
            } else if matched.is_some() && changed_fields.is_empty() {
                "clean"
            } else if expected.is_some() && (matched.is_some() || endpoint_match.is_some()) {
                "drifted"
            } else if has_current {
                "unmanaged"
            } else {
                "drifted"
            };
            let message = match status {
                "empty" => "尚未偵測到目前套用的供應商",
                "clean" => "kumoSwitch 與實際設定一致",
                "unmanaged" => "目前設定不在 kumoSwitch 清單中",
                _ if !unmanaged_providers.is_empty() => "設定檔中存在尚未納管的供應商",
                _ => "實際設定與 kumoSwitch 紀錄不同",
            };
            DriftReport {
                tool: spec.id.to_string(),
                tool_name: spec.name.to_string(),
                status: status.to_string(),
                active_id: matched
                    .map(|provider| provider.id.clone())
                    .or_else(|| data.active.get(spec.id).cloned()),
                expected_name: expected.map(|provider| provider.name.clone()),
                current_base_url: current.base_url,
                current_model: current.model,
                current_key_tail: current.api_key_tail,
                expected_base_url: expected.map(|provider| provider.base_url.clone()).unwrap_or_default(),
                expected_model: expected.map(|provider| provider.model.clone()).unwrap_or_default(),
                expected_key_tail: expected.map(|provider| mask_key(&provider.api_key)).unwrap_or_default(),
                changed_fields,
                unmanaged_providers,
                message: message.to_string(),
            }
        })
        .collect()
}

#[tauri::command]
fn provider_search_index() -> Vec<ProviderSearchRow> {
    let data = store::load();
    let mut rows = Vec::new();
    for spec in TOOLS {
        for provider in data.providers.get(spec.id).cloned().unwrap_or_default() {
            rows.push(ProviderSearchRow {
                tool: spec.id.to_string(),
                tool_name: spec.name.to_string(),
                provider: ProviderView::from(provider),
            });
        }
    }
    rows
}

#[tauri::command]
fn provider_list(tool: String) -> Vec<ProviderView> {
    store::list(&tool)
        .into_iter()
        .map(ProviderView::from)
        .collect()
}

#[tauri::command]
fn provider_save(
    tool: String,
    provider: ProviderInput,
    app: tauri::AppHandle,
) -> Result<ProviderView, String> {
    let spec = spec(&tool)?;
    if provider.name.trim().is_empty() {
        return Err("請填寫供應商名稱".into());
    }
    if provider.base_url.trim().is_empty() {
        return Err("請填寫 Base URL".into());
    }
    let clear_key = provider.clear_api_key;
    let mut provider: Provider = provider.into();
    configured_kind(spec, &mut provider);
    if provider.model_synced_at > 0 && provider.model_sync_interval_secs > 0 {
        let now = store::stamp() as u64;
        provider.model_sync_next_at = provider
            .model_synced_at
            .saturating_add(provider.model_sync_interval_secs.saturating_mul(1000))
            .saturating_add(
                sync_jitter_secs(
                    &tool,
                    if provider.id.is_empty() { &provider.config_id } else { &provider.id },
                    now,
                    provider.model_sync_jitter_secs,
                )
                .saturating_mul(1000),
            );
    }
    let saved = store::upsert_with_key_action(&tool, provider, clear_key)?;
    audit::record("provider.save", format!("{tool}:{}", saved.id));
    tray::refresh(&app);
    Ok(saved.into())
}

#[tauri::command]
fn provider_clone(
    tool: String,
    id: String,
    app: tauri::AppHandle,
) -> Result<ProviderView, String> {
    let (_, mut provider) = load_provider(&tool, &id)?;
    provider.id.clear();
    provider.config_id.clear();
    provider.name = format!("{} 副本", provider.name);
    provider.last_used = 0;
    let saved = store::upsert(&tool, provider)?;
    tray::refresh(&app);
    Ok(saved.into())
}

#[tauri::command]
fn import_cc_switch_provider(
    tool: String,
    provider_id: String,
    app: tauri::AppHandle,
) -> Result<CcSwitchImportResult, String> {
    let snapshot = ccswitch::read_snapshot();
    let candidate = snapshot.provider_for_import(&tool, &provider_id)?;
    let existing = store::list(&tool);
    if let Some(provider) = existing.into_iter().find(|provider| {
        provider.name.eq_ignore_ascii_case(&candidate.name)
            || same_endpoint(&provider.base_url, &candidate.base_url)
    }) {
        return Ok(CcSwitchImportResult {
            provider: ProviderView::from(provider),
            already_imported: true,
        });
    }
    let name = candidate.name.clone();
    let saved = store::upsert(&tool, candidate)?;
    audit::record("import.cc_switch", format!("{tool}:{provider_id}:{name}"));
    tray::refresh(&app);
    Ok(CcSwitchImportResult {
        provider: ProviderView::from(saved),
        already_imported: false,
    })
}

#[tauri::command]
fn reveal_provider_key(tool: String, id: String) -> Result<String, String> {
    let (_, provider) = load_provider(&tool, &id)?;
    if provider.api_key.is_empty() {
        return Err("這個供應商沒有可用的 API Key".into());
    }
    audit::record("provider.reveal_key", format!("{tool}:{id}"));
    Ok(provider.api_key)
}

#[tauri::command]
fn provider_select_model(
    tool: String,
    id: String,
    model: String,
    app: tauri::AppHandle,
) -> Result<ProviderView, String> {
    let saved = store::select_model(&tool, &id, &model)?;
    audit::record("provider.select_model", format!("{tool}:{id}:{model}"));
    tray::refresh(&app);
    Ok(saved.into())
}

#[tauri::command]
fn discover_provider_models(
    tool: String,
    provider_id: String,
) -> Result<ModelDiscoveryView, String> {
    let (_, mut provider) = load_provider(&tool, &provider_id)?;
    let discovered = net::discover_models_styled(
        &provider.base_url,
        &provider.api_key,
        uses_anthropic_wire(&tool, &provider.kind),
        &tool,
        &provider.kind,
    );
    provider.api_key.zeroize();
    let discovered = discovered?;
    let existing: std::collections::BTreeSet<String> = provider
        .models
        .iter()
        .map(|model| model.id.clone())
        .collect();
    let returned: std::collections::BTreeSet<String> = discovered
        .models
        .iter()
        .map(|model| model.id.clone())
        .collect();
    let missing = existing
        .iter()
        .filter(|id| !returned.contains(*id))
        .cloned()
        .collect::<Vec<_>>();
    let new_count = returned.difference(&existing).count();
    audit::record(
        "model.discover",
        format!(
            "{tool}:{provider_id};returned={};new={new_count};missing={}",
            returned.len(),
            missing.len()
        ),
    );
    Ok(ModelDiscoveryView {
        models: discovered.models,
        missing,
        endpoint: discovered.endpoint,
        message: discovered.message,
    })
}

#[tauri::command]
fn discover_model_reasoning(
    tool: String,
    provider_id: String,
    model_id: String,
) -> Result<ModelReasoningView, String> {
    let (spec, mut provider) = load_provider(&tool, &provider_id)?;
    let outcome = (|| -> Result<ModelReasoningView, String> {
        let model = provider
            .models
            .iter()
            .find(|model| model.id == model_id)
            .ok_or_else(|| format!("找不到模型：{model_id}"))?;
        let selected_level = model.reasoning_level.trim().to_string();
        let metadata_default = adapters::default_reasoning_level_from_metadata(&model.metadata);
        let reasoning_supported = model.reasoning != Some(false);
        let mut levels = model.reasoning_levels.clone();
        let mut context_window = model.context_window;
        let mut max_output = model.max_output;
        let mut source = if levels.is_empty() && context_window.is_none() && max_output.is_none() {
            "none"
        } else {
            "saved"
        };
        let mut catalog_message = String::new();
        // Model metadata can change when a provider publishes a new context
        // window or output limit, so an explicit refresh always checks the
        // catalogue when an endpoint is available.
        let needs_catalog = !provider.base_url.trim().is_empty();

        if needs_catalog {
            match net::discover_models_styled(
                &provider.base_url,
                &provider.api_key,
                uses_anthropic_wire(&tool, &provider.kind),
                &tool,
                &provider.kind,
            ) {
                Ok(discovered) => {
                    if let Some(remote) = discovered.models.into_iter().find(|model| model.id == model_id) {
                        if remote.context_window.is_some() {
                            context_window = remote.context_window;
                        }
                        if remote.max_output.is_some() {
                            max_output = remote.max_output;
                        }
                        if reasoning_supported && !remote.reasoning_levels.is_empty() {
                            levels = remote.reasoning_levels;
                        }
                        source = "catalog";
                    }
                }
                Err(error) => {
                    catalog_message = format!("模型目錄查詢失敗：{error}");
                }
            }
        }

        if reasoning_supported && levels.is_empty() {
            let defaults = adapters::reasoning_levels_for_tool(spec.id);
            if !defaults.is_empty() {
                levels = defaults.iter().map(|level| level.to_string()).collect();
                if source != "catalog" {
                    source = "harness";
                }
            }
        }

        levels.sort_by_key(|level| {
            ["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra", "auto", "inherit"]
                .iter()
                .position(|candidate| candidate == level)
                .unwrap_or(usize::MAX)
        });
        levels.dedup();
        if levels.is_empty() && context_window.is_none() && max_output.is_none() {
            return Err(format!(
                "找不到 {model_id} 的模型資訊；供應商目錄未公開 context／max output，且這個 Harness 沒有思考等級可補"
            ));
        }
        let default_level = if levels.contains(&selected_level) {
            selected_level
        } else if let Some(level) = metadata_default.filter(|level| levels.contains(level)) {
            level
        } else {
            levels.first().cloned().unwrap_or_default()
        };
        let target = adapters::reasoning_target_for_tool(spec.id);
        let mut parts = Vec::new();
        if let Some(context) = context_window {
            parts.push(format!("Context {context}"));
        }
        if let Some(output) = max_output {
            parts.push(format!("Max output {output}"));
        }
        if !levels.is_empty() {
            parts.push(format!("{} 個思考等級", levels.len()));
        }
        let prefix = if source == "catalog" {
            "已從供應商模型目錄取得"
        } else if source == "harness" {
            "使用已保存的模型資訊；思考等級採用 Harness 候選"
        } else {
            "使用 kumoSwitch 已保存的模型資訊"
        };
        let message = if parts.is_empty() {
            catalog_message
        } else if catalog_message.is_empty() {
            format!("{prefix}：{}", parts.join(" · "))
        } else {
            format!("{prefix}：{}（{catalog_message}）", parts.join(" · "))
        };
        audit::record(
            "model.capability_discover",
            format!(
                "{tool}:{provider_id}:{model_id};source={source};levels={};context={context_window:?};max_output={max_output:?}",
                levels.len()
            ),
        );
        Ok(ModelReasoningView {
            levels,
            default_level,
            source,
            supported: !target.is_empty(),
            target,
            context_window,
            max_output,
            message,
        })
    })();
    provider.api_key.zeroize();
    outcome
}

#[tauri::command]
fn toggle_model_favorite(
    tool: String,
    id: String,
    model_id: String,
    favorite: bool,
) -> Result<ModelProfile, String> {
    store::set_model_favorite(&tool, &id, &model_id, favorite)
}

#[tauri::command]
fn archive_model(
    tool: String,
    id: String,
    model_id: String,
    archived: bool,
) -> Result<ModelProfile, String> {
    store::set_model_archived(&tool, &id, &model_id, archived)
}

#[tauri::command]
fn test_model(tool: String, provider_id: String, model_id: String) -> Result<ModelTestResult, String> {
    let (_, mut provider) = load_provider(&tool, &provider_id)?;
    if !provider.models.iter().any(|model| model.id == model_id) {
        provider.api_key.zeroize();
        return Err(format!("這個供應商沒有模型「{model_id}」"));
    }
    let result = net::probe_model(
        &provider.base_url,
        &provider.api_key,
        uses_anthropic_wire(&tool, &provider.kind),
        &model_id,
    );
    let recorded = store::record_model_check(
        &tool,
        &provider_id,
        &model_id,
        ModelCheck {
            ts: store::stamp() as u64,
            ok: result.ok,
            ms: result.ms as u64,
            status: result.status,
        },
    );
    provider.api_key.zeroize();
    let model = recorded?;
    audit::record(
        "model.test",
        format!("{tool}:{provider_id}:{model_id}:{}:{}ms", result.status, result.ms),
    );
    Ok(ModelTestResult { model, result })
}

#[tauri::command]
fn live_test_model(tool: String, provider_id: String, model_id: String) -> Result<ModelTestResult, String> {
    let now = store::stamp() as u64;
    let guard = LIVE_TEST_QUOTA.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut data = store::load();
    data.live_test_runs.retain(|ts| now.saturating_sub(*ts) < LIVE_TEST_WINDOW_MS);
    let policy = live_test_policy_for(&data, now);
    if policy.remaining_24h == 0 {
        return Err(format!(
            "近 24 小時實測配額已用完（{}／{}）。請稍後再試或調整配額。",
            policy.used_24h, policy.daily_limit
        ));
    }
    let provider = data
        .providers
        .get(&tool)
        .and_then(|providers| providers.iter().find(|provider| provider.id == provider_id))
        .cloned()
        .ok_or_else(|| format!("找不到供應商：{provider_id}"))?;
    if !provider.models.iter().any(|model| model.id == model_id) {
        return Err(format!("這個供應商沒有模型「{model_id}」"));
    }
    data.live_test_runs.push(now);
    store::save(&data)?;
    drop(guard);

    let mut provider = provider;
    let result = net::probe_live_model(
        &provider.base_url,
        &provider.api_key,
        &model_id,
        uses_anthropic_wire(&tool, &provider.kind),
        &tool,
        &provider.kind,
        policy.max_output_tokens,
    );
    let recorded = store::record_model_check(
        &tool,
        &provider_id,
        &model_id,
        ModelCheck {
            ts: store::stamp() as u64,
            ok: result.ok,
            ms: result.ms as u64,
            status: result.status,
        },
    );
    provider.api_key.zeroize();
    let model = recorded?;
    audit::record(
        "model.live_test",
        format!(
            "{tool}:{provider_id}:{model_id}:{}:{}ms:max_tokens={}:quota={}/{}",
            result.status, result.ms, policy.max_output_tokens, policy.used_24h + 1, policy.daily_limit
        ),
    );
    Ok(ModelTestResult { model, result })
}

#[tauri::command]
fn live_test_policy() -> LiveTestPolicy {
    let now = store::stamp() as u64;
    live_test_policy_for(&store::load(), now)
}

#[tauri::command]
fn set_live_test_policy(daily_limit: u32, max_output_tokens: u32) -> Result<LiveTestPolicy, String> {
    let mut data = store::load();
    data.live_test_daily_limit = daily_limit.clamp(1, 200);
    data.live_test_max_output_tokens = max_output_tokens.clamp(1, 128);
    store::save(&data)?;
    let now = store::stamp() as u64;
    Ok(live_test_policy_for(&data, now))
}

#[tauri::command]
fn provider_reorder(tool: String, ids: Vec<String>, app: tauri::AppHandle) -> Result<Vec<ProviderView>, String> {
    let ordered = store::reorder(&tool, &ids)?;
    tray::refresh(&app);
    Ok(ordered.into_iter().map(ProviderView::from).collect())
}

#[tauri::command]
fn provider_config_preview(tool: String, id: String) -> Result<Vec<ProviderConfigPreview>, String> {
    let (spec, provider) = load_provider(&tool, &id)?;
    let keys = redaction_keys(&provider);
    Ok(adapters::plan(spec, &provider)?
        .into_iter()
        .map(|change| ProviderConfigPreview {
            file: change.file,
            fmt: change.fmt,
            content: redact_keys(&change.after, &keys),
        })
        .collect())
}

#[tauri::command]
fn provider_delete(tool: String, id: String, app: tauri::AppHandle) -> Result<(), String> {
    store::remove(&tool, &id)?;
    history::forget(&tool, &id)?;
    audit::record("provider.delete", format!("{tool}:{id}"));
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
    let keys = redaction_keys(provider);
    let mut out = Vec::new();
    for change in changes {
        if change.before == change.after {
            continue;
        }
        let before = redact_keys(&change.before, &keys);
        let after = redact_keys(&change.after, &keys);
        let diff = similar::TextDiff::from_lines(&before, &after);
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

fn changed_field_labels(files: &[FileDiff]) -> Vec<String> {
    let mut labels = Vec::new();
    for file in files {
        for line in file.diff.lines() {
            let trimmed = line.trim_start_matches(['+', '-']).trim().to_ascii_lowercase();
            if trimmed.is_empty() || trimmed.starts_with("+++") || trimmed.starts_with("---") {
                continue;
            }
            let label = if trimmed.contains("base_url") || trimmed.contains("baseurl") || trimmed.contains("base url") {
                Some("Base URL")
            } else if trimmed.contains("api_key") || trimmed.contains("apikey") || trimmed.contains("auth_token") || trimmed.contains("bearer_token") || trimmed.starts_with("key =") {
                Some("API Key")
            } else if trimmed.contains("wire_api") || trimmed.contains("protocol") || trimmed.contains("transport") {
                Some("協議")
            } else if trimmed.contains("model") {
                Some("模型")
            } else if trimmed.contains("provider") {
                Some("供應商")
            } else {
                None
            };
            if let Some(label) = label {
                if !labels.iter().any(|existing| existing == label) {
                    labels.push(label.to_string());
                }
            }
        }
    }
    if labels.is_empty() {
        labels.push("設定檔".into());
    }
    labels
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
    warnings.extend(compat::preview_messages(spec.id, provider));
    warnings
}

#[tauri::command]
fn model_compatibility(tool: String, provider_id: String) -> Result<Vec<compat::ModelCompatibility>, String> {
    let (_, provider) = load_provider(&tool, &provider_id)?;
    Ok(compat::evaluate_provider(&tool, &provider))
}

#[tauri::command]
fn api_key_add(tool: String, input: keys::ApiKeyInput) -> Result<keys::ApiKeyView, String> {
    let view = keys::add(&tool, input)?;
    audit::record("api_key.add", format!("{tool}:{}:{}", view.id, view.fingerprint));
    Ok(view)
}

#[tauri::command]
fn api_key_update(tool: String, input: keys::ApiKeyInput) -> Result<keys::ApiKeyView, String> {
    let view = keys::update(&tool, input)?;
    audit::record("api_key.update", format!("{tool}:{}", view.id));
    Ok(view)
}

#[tauri::command]
fn api_key_activate(tool: String, provider_id: String, key_id: String) -> Result<keys::ApiKeyView, String> {
    let view = keys::activate(&tool, &provider_id, &key_id)?;
    audit::record("api_key.activate", format!("{tool}:{provider_id}:{key_id}"));
    Ok(view)
}

#[tauri::command]
fn api_key_remove(tool: String, provider_id: String, key_id: String) -> Result<(), String> {
    keys::remove(&tool, &provider_id, &key_id)?;
    audit::record("api_key.remove", format!("{tool}:{provider_id}:{key_id}"));
    Ok(())
}

#[tauri::command]
fn api_key_test(tool: String, provider_id: String, key_id: String) -> Result<keys::KeyTestResult, String> {
    let result = keys::test(&tool, &provider_id, &key_id)?;
    audit::record("api_key.test", format!("{tool}:{provider_id}:{key_id}:{}:{}ms", result.result.status, result.result.ms));
    Ok(result)
}

#[tauri::command]
fn preview(tool: String, provider_id: String) -> Result<Preview, String> {
    let (spec, provider) = load_provider(&tool, &provider_id)?;
    let files = build_diffs(spec, &provider)?;
    let changed_fields = changed_field_labels(&files);
    Ok(Preview {
        files,
        warnings: build_warnings(spec, &provider),
        changed_fields,
    })
}

/// Write via a sibling temp file so an interrupted write can never leave the
/// user's config truncated.
fn write_atomic(path: &std::path::Path, text: &str) -> std::io::Result<()> {
    secure_fs::write_preserving(path, text)
}

fn apply_core(tool: &str, provider_id: &str) -> Result<ApplyResult, String> {
    let (spec, provider) = load_provider(tool, provider_id)?;
    if compat::has_blocking(tool, &provider) {
        return Err("模型相容性檢查未通過；請修正能力或協議，或在模型 metadata 加入 compatibility_override: true 後再套用".into());
    }
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
    let (backup_id, _) = backup::snapshot_with_reason(&tool, &files, "provider-apply")?;

    guardian::mark_self_write();
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
    guardian::mark_self_write();
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
    audit::record("provider.apply", format!("{tool}:{provider_id}"));
    tray::refresh(&app);
    Ok(result)
}

/// Entry point used by the tray menu, where there is no window to reply to.
pub fn apply_from_tray(tool: &str, provider_id: &str) -> Result<String, String> {
    apply_core(tool, provider_id).map(|r| r.message)
}

/// Switch only the selected model from the tray and apply its targeted diff.
pub fn switch_model_from_tray(tool: &str, provider_id: &str, model_id: &str) -> Result<String, String> {
    let provider = store::select_model(tool, provider_id, model_id)?;
    let result = apply_core(tool, provider_id)?;
    audit::record("model.apply_from_tray", format!("{tool}:{provider_id}:{model_id}"));
    Ok(if result.changed {
        format!("已切換「{}」→ {model_id}", provider.name)
    } else {
        format!("「{}」已經是 {model_id}", provider.name)
    })
}

fn provider_differences(existing: &Provider, incoming: &Provider) -> Vec<String> {
    let mut out = Vec::new();
    if existing.name != incoming.name {
        out.push("名稱".into());
    }
    if existing.base_url.trim_end_matches('/') != incoming.base_url.trim_end_matches('/') {
        out.push("Base URL".into());
    }
    if existing.model != incoming.model {
        out.push("目前模型".into());
    }
    if existing.kind != incoming.kind {
        out.push("協議".into());
    }
    let existing_models: std::collections::BTreeSet<_> = existing.models.iter().map(|model| model.id.as_str()).collect();
    let incoming_models: std::collections::BTreeSet<_> = incoming.models.iter().map(|model| model.id.as_str()).collect();
    if existing_models != incoming_models {
        out.push("模型清單".into());
    }
    out
}

#[tauri::command]
fn import_scan() -> Vec<ImportCandidate> {
    let current = store::load();
    let mut out = Vec::new();
    for spec in TOOLS {
        let existing = current.providers.get(spec.id).cloned().unwrap_or_default();
        for mut provider in adapters::discover(spec) {
            adapters::normalize_provider_models(&mut provider);
            let found = existing.iter().find(|item| item.config_id == provider.config_id);
            out.push(ImportCandidate {
                tool: spec.id.into(),
                tool_name: spec.name.into(),
                config_id: provider.config_id.clone(),
                name: provider.name.clone(),
                base_url: provider.base_url.clone(),
                model: provider.model.clone(),
                models: provider.models.clone(),
                kind: provider.kind.clone(),
                conflict: found.is_some(),
                differences: found.map(|item| provider_differences(item, &provider)).unwrap_or_default(),
            });
        }
    }
    out
}

fn merge_import_provider(existing: &Provider, mut incoming: Provider) -> Provider {
    let mut models = existing.models.clone();
    for model in incoming.models.drain(..) {
        if let Some(current) = models.iter_mut().find(|item| item.id == model.id) {
            if current.name.trim().is_empty() {
                current.name = model.name;
            }
        } else {
            models.push(model);
        }
    }
    incoming.id = existing.id.clone();
    incoming.config_id = existing.config_id.clone();
    incoming.name = if incoming.name.trim().is_empty() { existing.name.clone() } else { incoming.name };
    incoming.base_url = if incoming.base_url.trim().is_empty() { existing.base_url.clone() } else { incoming.base_url };
    incoming.model = if incoming.model.trim().is_empty() { existing.model.clone() } else { incoming.model };
    incoming.kind = if incoming.kind.trim().is_empty() { existing.kind.clone() } else { incoming.kind };
    incoming.api_key = existing.api_key.clone();
    incoming.api_key_enc = existing.api_key_enc.clone();
    incoming.last_used = existing.last_used;
    incoming.models = models;
    adapters::normalize_provider_models(&mut incoming);
    incoming
}

#[tauri::command]
fn import_apply(decisions: Vec<ImportDecision>, app: tauri::AppHandle) -> Result<JsonImportResult, String> {
    let decisions: std::collections::BTreeMap<(String, String), String> = decisions
        .into_iter()
        .map(|decision| ((decision.tool, decision.config_id), decision.action))
        .collect();
    let mut imported = 0usize;
    let mut skipped = 0usize;
    for spec in TOOLS {
        let existing = store::list(spec.id);
        for mut provider in adapters::discover(spec) {
            adapters::normalize_provider_models(&mut provider);
            let key = (spec.id.to_string(), provider.config_id.clone());
            let action = decisions.get(&key).map(String::as_str).unwrap_or("skip");
            if action == "skip" {
                skipped += 1;
                continue;
            }
            let found = existing.iter().find(|item| item.config_id == provider.config_id).cloned();
            match (action, found) {
                ("merge", Some(current)) => {
                    provider = merge_import_provider(&current, provider);
                }
                ("overwrite", Some(current)) => {
                    provider.id = current.id;
                }
                ("copy", Some(_)) => {
                    provider.id.clear();
                    provider.config_id.clear();
                    provider.name = format!("{} 副本", provider.name);
                }
                (_, Some(current)) if action != "overwrite" => {
                    provider.id = current.id;
                }
                _ => {}
            }
            store::upsert(spec.id, provider)?;
            imported += 1;
        }
    }
    audit::record("import.apply", format!("imported={imported};skipped={skipped}"));
    tray::refresh(&app);
    Ok(JsonImportResult { imported, skipped })
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
        let saved = store::upsert(&tool, provider)?;
        imported.push(ProviderView::from(saved));
    }
    tray::refresh(&app);
    Ok(ImportResult { imported, skipped })
}

#[tauri::command]
fn test_provider(tool: String, provider_id: String) -> Result<net::TestResult, String> {
    let (_, mut provider) = load_provider(&tool, &provider_id)?;
    let result = net::probe(&provider.base_url, &provider.api_key, uses_anthropic_wire(&tool, &provider.kind));
    provider.api_key.zeroize();
    let _ = history::record(&tool, &provider_id, result.ok, result.ms as u64, result.status);
    Ok(result)
}

#[tauri::command]
fn test_history(tool: String) -> std::collections::BTreeMap<String, history::Summary> {
    history::summaries(&tool)
}

fn exportable_store() -> Result<(store::Store, usize), String> {
    let mut data = store::load();
    let missing = data
        .providers
        .values()
        .flatten()
        .filter(|provider| {
            (!provider.api_key_enc.is_empty() && provider.api_key.is_empty())
                || provider.api_keys.iter().any(|key| !key.secret_enc.is_empty() && key.secret.is_empty())
        })
        .count()
        + data.shared_profiles.iter().filter(|profile| profile.keys.iter().any(|key| !key.secret_enc.is_empty() && key.secret.is_empty())).count();
    if missing > 0 {
        return Err(format!(
            "有 {missing} 個 API Key 無法從系統安全儲存解密，為避免備份缺漏，已取消匯出"
        ));
    }
    let count = data.providers.values().map(Vec::len).sum();
    for provider in data.providers.values_mut().flatten() {
        // The encrypted archive carries the decrypted value; keeping ciphertext
        // here would only tie the backup to the current machine.
        provider.api_key_enc.clear();
        for key in &mut provider.api_keys { key.secret_enc.clear(); }
    }
    for profile in &mut data.shared_profiles {
        for key in &mut profile.keys { key.secret_enc.clear(); }
    }
    Ok((data, count))
}

#[tauri::command]
fn export_providers_encrypted(mut password: String, destination: Option<String>) -> Result<ExportResult, String> {
    let (mut data, count) = exportable_store()?;
    let mut plaintext = serde_json::to_string(&data).map_err(|error| error.to_string())?;
    let encrypted = export_crypto::encrypt(&password, &plaintext, count);
    plaintext.zeroize();
    for provider in data.providers.values_mut().flatten() {
        provider.api_key.zeroize();
    }
    password.zeroize();
    let encrypted = encrypted?;
    let dir = store::data_dir();
    let path = destination
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| dir.join(format!("kumoswitch-backup-{}.kumoswitch", store::stamp())));
    secure_fs::write_private(&path, &encrypted)
        .map_err(|error| format!("匯出加密備份失敗：{error}"))?;
    audit::record("backup.export", format!("providers={count}"));
    Ok(ExportResult {
        path: adapters::display_path(&path),
        count,
        sha256: Some(export_crypto::checksum(&encrypted)),
    })
}

fn merge_providers(current: &mut store::Store, incoming: store::Store) -> (usize, usize) {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    for (tool, list) in incoming.providers {
        if adapters::find(&tool).is_none() {
            skipped += list.len();
            continue;
        }
        let entry = current.providers.entry(tool).or_default();
        for mut provider in list {
            if entry.iter().any(|existing| existing.config_id == provider.config_id) {
                skipped += 1;
                continue;
            }
            provider.id = format!("p{}", store::stamp() + imported as u128);
            crate::keys::ensure_active_version(&mut provider);
            entry.push(provider);
            imported += 1;
        }
    }
    for mut profile in incoming.shared_profiles {
        if current.shared_profiles.iter().any(|existing| existing.id == profile.id || (existing.name.eq_ignore_ascii_case(&profile.name) && existing.base_url == profile.base_url)) {
            skipped += 1;
            continue;
        }
        if profile.id.is_empty() { profile.id = format!("sp{}", store::stamp()); }
        current.shared_profiles.push(profile);
        imported += 1;
    }
    (imported, skipped)
}

#[tauri::command]
fn import_providers_json(
    mut text: String,
    app: tauri::AppHandle,
) -> Result<JsonImportResult, String> {
    if text.len() > 64 * 1024 * 1024 {
        text.zeroize();
        return Err("匯入檔過大，已拒絕載入".into());
    }
    let parsed = serde_json::from_str::<store::Store>(&text);
    text.zeroize();
    let incoming = parsed.map_err(|error| format!("檔案格式不符：{error}"))?;
    let mut current = store::load();
    let (imported, skipped) = merge_providers(&mut current, incoming);
    store::save(&current)?;
    audit::record("import.json", format!("imported={imported};skipped={skipped}"));
    tray::refresh(&app);
    Ok(JsonImportResult { imported, skipped })
}

#[tauri::command]
fn inspect_encrypted_backup(text: String) -> Result<export_crypto::ExportInfo, String> {
    if text.len() > 64 * 1024 * 1024 {
        return Err("備份檔過大，已拒絕載入".into());
    }
    export_crypto::inspect(&text)
}

#[tauri::command]
fn import_providers_encrypted(
    text: String,
    mut password: String,
    app: tauri::AppHandle,
) -> Result<JsonImportResult, String> {
    if text.len() > 64 * 1024 * 1024 {
        return Err("備份檔過大，已拒絕匯入".into());
    }
    let decrypted = export_crypto::decrypt(&password, &text);
    password.zeroize();
    let mut plaintext = decrypted?;
    let parsed = serde_json::from_str::<store::Store>(&plaintext);
    plaintext.zeroize();
    let incoming = parsed.map_err(|_| "解密後的備份內容格式錯誤".to_string())?;
    let mut current = store::load();
    let (imported, skipped) = merge_providers(&mut current, incoming);
    store::save(&current)?;
    audit::record("import.encrypted", format!("imported={imported};skipped={skipped}"));
    tray::refresh(&app);
    Ok(JsonImportResult { imported, skipped })
}

#[tauri::command]
fn export_diagnostics(destination: Option<String>) -> Result<ExportResult, String> {
    let data = store::load();
    let mut report = String::new();
    report.push_str(&format!("kumoSwitch {}
", env!("CARGO_PKG_VERSION")));
    report.push_str(&format!("OS: {} {}
", std::env::consts::OS, std::env::consts::ARCH));
    report.push_str(&format!("資料目錄: {}
", adapters::display_path(&store::data_dir())));
    report.push_str(&format!("金鑰加密: {}
", if crypto::available() { crypto::label() } else { "不可用（拒絕寫入明文）" }));
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
            let tail = if provider.api_key.is_empty() {
                "金鑰=無".to_string()
            } else {
                format!("金鑰={}", mask_key(&provider.api_key))
            };
            report.push_str(&format!("{:<14}   - {} | {} | {} | {}
", "", provider.name, provider.base_url, provider.model, tail));
        }
    }
    let dir = store::data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = destination
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| dir.join(format!("kumoswitch-diagnostics-{}.txt", store::stamp())));
    secure_fs::write_private(&path, &report).map_err(|e| format!("寫入失敗：{e}"))?;
    Ok(ExportResult {
        path: adapters::display_path(&path),
        count,
        sha256: Some(export_crypto::checksum(&report)),
    })
}

#[tauri::command]
fn proxy_status() -> proxy::ProxyConfig {
    store::load().proxy
}

#[tauri::command]
fn proxy_metrics() -> proxy::ProxyMetrics {
    proxy::metrics()
}

#[tauri::command]
fn proxy_reset_metrics() {
    proxy::reset_metrics();
}

#[tauri::command]
fn proxy_export_diagnostics(destination: Option<String>) -> Result<ExportResult, String> {
    let config = store::load().proxy;
    let metrics = proxy::metrics();
    let payload = serde_json::json!({
        "exported_at": store::stamp() as u64,
        "version": env!("CARGO_PKG_VERSION"),
        "config": config,
        "metrics": metrics,
        "note": "Contains routing metadata, status codes, latency and failure reasons. Prompts and API keys are never recorded."
    });
    let text = serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?;
    let path = destination
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| store::data_dir().join(format!("proxy-diagnostics-{}.json", store::stamp())));
    secure_fs::write_private(&path, &text).map_err(|error| format!("匯出代理診斷失敗：{error}"))?;
    audit::record("proxy.export", adapters::display_path(&path));
    Ok(ExportResult {
        path: adapters::display_path(&path),
        count: metrics.traces.len(),
        sha256: Some(export_crypto::checksum(&text)),
    })
}

#[tauri::command]
fn proxy_save(mut config: proxy::ProxyConfig) -> Result<proxy::ProxyConfig, String> {
    config.alerts.min_requests = config.alerts.min_requests.max(1);
    config.alerts.success_rate_below_pct = config.alerts.success_rate_below_pct.clamp(1, 100);
    config.alerts.slow_ttfb_ms = config.alerts.slow_ttfb_ms.max(100);
    config.alerts.cooldown_secs = config.alerts.cooldown_secs.max(30);
    let mut data = store::load();
    data.proxy = config.clone();
    store::save(&data)?;
    proxy::start().map_err(|error| format!("代理啟動失敗：{error}"))?;
    audit::record("proxy.save", format!("enabled={};targets={}", config.enabled, config.stack.len()));
    Ok(config)
}

/// Point a tool at the local proxy by applying a dedicated provider entry.
#[tauri::command]
fn proxy_attach(tool: String, app: tauri::AppHandle) -> Result<ApplyResult, String> {
    let config = store::load().proxy;
    let provider = Provider {
        id: String::new(),
        config_id: "kumoswitch-proxy".into(),
        name: "kumoSwitch 代理".into(),
        base_url: format!("http://127.0.0.1:{}/v1", config.port),
        api_key: "kumoswitch-proxy".into(),
        api_key_enc: String::new(),
        model: String::new(),
        models: Vec::new(),
        kind: String::new(),
        note: "經本地代理＋故障轉移".into(),
        profile_id: String::new(),
        api_keys: Vec::new(),
        last_used: 0,
            model_synced_at: 0,
            previous_model: String::new(),
            model_sync_interval_secs: adapters::default_model_sync_interval_secs(),
            model_sync_jitter_secs: adapters::default_model_sync_jitter_secs(),
            model_sync_next_at: 0,
            model_sync_retry_at: 0,
            model_sync_failures: 0,
            model_sync_last_error: String::new(),
    };
    let saved = store::upsert(&tool, provider)?;
    let result = apply_core(&tool, &saved.id)?;
    tray::refresh(&app);
    Ok(result)
}

#[tauri::command]
async fn usage_report(days: u32) -> Result<usage::UsageReport, String> {
    tauri::async_runtime::spawn_blocking(move || usage::report(days.clamp(1, 365)))
        .await
        .map_err(|error| format!("session log 掃描失敗：{error}"))
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
fn harness_manager_list() -> Vec<harness_manager::HarnessManagerEntry> {
    harness_manager::manager_entries()
}

#[tauri::command]
async fn harness_install(
    id: String,
    app: tauri::AppHandle,
) -> Result<harness_manager::HarnessInstallResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || harness_manager::install(&id))
        .await
        .map_err(|error| format!("Harness 安裝工作失敗：{error}"))?;
    let _ = app.emit("kumoswitch://changed", ());
    result
}

#[tauri::command]
fn set_auto_health(enabled: bool) -> Result<bool, String> {
    let mut data = store::load();
    data.auto_health = enabled;
    store::save(&data)?;
    Ok(enabled)
}

#[tauri::command]
fn set_auto_model_sync(enabled: bool, app: tauri::AppHandle) -> Result<bool, String> {
    let mut data = store::load();
    data.auto_model_sync = enabled;
    store::save(&data)?;
    if enabled {
        std::thread::spawn(move || {
            use tauri::Emitter as _;
            let updated = auto_sync_models_once();
            if updated > 0 {
                let _ = app.emit("kumoswitch://changed", ());
                tray::refresh(&app);
            }
        });
    }
    Ok(enabled)
}

fn sync_hash(tool: &str, provider_id: &str, nonce: u64) -> u64 {
    let mut hash = 14_695_981_039_346_656_037u64;
    for byte in tool.bytes().chain(provider_id.bytes()).chain(nonce.to_le_bytes()) {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    hash
}

fn sync_jitter_secs(tool: &str, provider_id: &str, nonce: u64, max_secs: u64) -> u64 {
    if max_secs == 0 {
        return 0;
    }
    sync_hash(tool, provider_id, nonce) % (max_secs.saturating_add(1))
}

fn model_sync_backoff_secs(failures: u32) -> u64 {
    match failures {
        0 | 1 => 5 * 60,
        2 => 15 * 60,
        3 => 60 * 60,
        4 => 3 * 60 * 60,
        _ => 6 * 60 * 60,
    }
}

fn model_sync_due(
    now: u64,
    synced_at: u64,
    next_at: u64,
    retry_at: u64,
    interval_secs: u64,
) -> bool {
    if interval_secs == 0 {
        return false;
    }
    if retry_at > 0 {
        return now >= retry_at;
    }
    if next_at > 0 {
        return now >= next_at;
    }
    if synced_at > 0 {
        return now >= synced_at.saturating_add(interval_secs.saturating_mul(1000));
    }
    true
}

fn auto_sync_models_once() -> usize {
    let mut data = store::load();
    let now = store::stamp() as u64;
    let mut updated = 0usize;
    let mut failed = 0usize;
    let mut changed = false;
    for (tool, providers) in data.providers.iter_mut() {
        for provider in providers.iter_mut() {
            if !model_sync_due(
                now,
                provider.model_synced_at,
                provider.model_sync_next_at,
                provider.model_sync_retry_at,
                provider.model_sync_interval_secs,
            ) {
                continue;
            }
            match net::discover_models_styled(
                &provider.base_url,
                &provider.api_key,
                uses_anthropic_wire(tool, &provider.kind),
                tool,
                &provider.kind,
            ) {
                Ok(discovery) => {
                    for discovered in discovery.models {
                        if let Some(existing) = provider
                            .models
                            .iter_mut()
                            .find(|model| model.id == discovered.id)
                        {
                            existing.last_seen_at = now;
                        } else {
                            let mut model = discovered;
                            model.last_seen_at = now;
                            provider.models.push(model);
                        }
                    }
                    provider.model_synced_at = now;
                    provider.model_sync_failures = 0;
                    provider.model_sync_last_error.clear();
                    provider.model_sync_retry_at = 0;
                    provider.model_sync_next_at = now
                        .saturating_add(provider.model_sync_interval_secs.saturating_mul(1000))
                        .saturating_add(
                            sync_jitter_secs(
                                tool,
                                &provider.id,
                                now,
                                provider.model_sync_jitter_secs,
                            )
                            .saturating_mul(1000),
                        );
                    if provider.model.is_empty()
                        || !provider.models.iter().any(|model| model.id == provider.model)
                    {
                        provider.model = provider
                            .models
                            .iter()
                            .find(|model| !model.archived)
                            .map(|model| model.id.clone())
                            .unwrap_or_default();
                    }
                    updated += 1;
                    changed = true;
                }
                Err(error) => {
                    provider.model_sync_failures = provider.model_sync_failures.saturating_add(1);
                    provider.model_sync_last_error = error.chars().take(280).collect();
                    let backoff = model_sync_backoff_secs(provider.model_sync_failures);
                    provider.model_sync_retry_at = now
                        .saturating_add(backoff.saturating_mul(1000))
                        .saturating_add(
                            sync_jitter_secs(
                                tool,
                                &provider.id,
                                now ^ u64::from(provider.model_sync_failures),
                                provider.model_sync_jitter_secs,
                            )
                            .saturating_mul(1000),
                        );
                    failed += 1;
                    changed = true;
                }
            }
        }
    }
    if changed {
        data.last_auto_model_sync = now;
        let _ = store::save(&data);
        audit::record(
            "model.auto_sync",
            format!("providers={updated};failed={failed};per_provider_schedule=true"),
        );
    }
    updated + failed
}

fn spawn_model_sync_loop(app: tauri::AppHandle) {
    use tauri::Emitter as _;
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(60));
        let enabled = store::load().auto_model_sync;
        if !enabled {
            continue;
        }
        if auto_sync_models_once() > 0 {
            let _ = app.emit("kumoswitch://changed", ());
            tray::refresh(&app);
        }
    });
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
                let result = net::probe(&provider.base_url, &provider.api_key, uses_anthropic_wire(tool, &provider.kind));
                let _ = history::record(tool, &provider.id, result.ok, result.ms as u64, result.status);
                any = true;
            }
        }
        if any {
            let _ = app.emit("kumoswitch://changed", ());
        }
    });
}

#[tauri::command]
fn guardian_status() -> guardian::GuardianOverview {
    let data = store::load();
    let _ = guardian::observe(&data);
    guardian::overview()
}

#[tauri::command]
fn guardian_set_policy(policy: guardian::GuardianPolicy) -> Result<guardian::GuardianPolicy, String> {
    let saved = guardian::set_policy(policy)?;
    audit::record("guardian.policy", format!("enabled={};auto_repair={};notify={}", saved.enabled, saved.auto_repair, saved.notify));
    Ok(saved)
}

#[tauri::command]
fn guardian_repair(tool: String, provider_id: String, app: tauri::AppHandle) -> Result<ApplyResult, String> {
    let result = apply_core(&tool, &provider_id);
    match &result {
        Ok(value) => guardian::record_repair(&tool, &provider_id, true, &value.message),
        Err(error) => guardian::record_repair(&tool, &provider_id, false, error),
    }
    let result = result?;
    audit::record("guardian.repair", format!("{tool}:{provider_id}"));
    let _ = app.emit("kumoswitch://changed", ());
    tray::refresh(&app);
    Ok(result)
}

#[tauri::command]
fn guardian_clear_events() -> Result<(), String> {
    guardian::clear_events()
}

#[tauri::command]
fn profile_list() -> Vec<profiles::SharedProfileView> {
    profiles::list()
}

#[tauri::command]
fn profile_save(input: profiles::SharedProfileInput, app: tauri::AppHandle) -> Result<profiles::SharedProfileView, String> {
    let saved = profiles::save(input)?;
    audit::record("profile.save", format!("{}:{}", saved.id, saved.name));
    let _ = app.emit("kumoswitch://changed", ());
    Ok(saved)
}

#[tauri::command]
fn profile_delete(id: String, app: tauri::AppHandle) -> Result<(), String> {
    profiles::remove(&id)?;
    audit::record("profile.delete", id);
    let _ = app.emit("kumoswitch://changed", ());
    Ok(())
}

#[tauri::command]
fn profile_import_provider(tool: String, provider_id: String, app: tauri::AppHandle) -> Result<profiles::SharedProfileView, String> {
    let saved = profiles::import_provider(&tool, &provider_id)?;
    audit::record("profile.import_provider", format!("{tool}:{provider_id}:{}", saved.id));
    let _ = app.emit("kumoswitch://changed", ());
    Ok(saved)
}

#[tauri::command]
fn profile_sync(profile_id: String, tools: Vec<String>, app: tauri::AppHandle) -> Result<profiles::ProfileSyncResult, String> {
    let result = profiles::sync(&profile_id, &tools)?;
    audit::record("profile.sync", format!("{}:{}", profile_id, result.synced.len()));
    let _ = app.emit("kumoswitch://changed", ());
    tray::refresh(&app);
    Ok(result)
}

#[tauri::command]
fn cc_switch_refresh() -> bool {
    let snapshot = ccswitch::refresh_snapshot();
    snapshot.public_error().is_none()
}

fn cc_import_candidate(
    tool: &str,
    provider_id: &str,
    snapshot: &ccswitch::Snapshot,
) -> Result<(ProviderView, bool), String> {
    let candidate = snapshot.provider_for_import(tool, provider_id)?;
    let existing = store::list(tool);
    if let Some(provider) = existing.into_iter().find(|provider| {
        provider.name.eq_ignore_ascii_case(&candidate.name)
            || same_endpoint(&provider.base_url, &candidate.base_url)
            || provider.config_id == candidate.config_id
    }) {
        return Ok((ProviderView::from(provider), true));
    }
    let saved = store::upsert(tool, candidate)?;
    Ok((ProviderView::from(saved), false))
}

#[tauri::command]
fn import_cc_switch_batch(
    tool: String,
    provider_ids: Vec<String>,
    app: tauri::AppHandle,
) -> Result<CcSwitchBatchResult, String> {
    let snapshot = ccswitch::refresh_snapshot();
    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut providers = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for id in provider_ids {
        if !seen.insert(id.clone()) { continue; }
        match cc_import_candidate(&tool, &id, &snapshot) {
            Ok((provider, existed)) => {
                if existed { skipped += 1; } else { imported += 1; }
                providers.push(provider);
            }
            Err(error) => {
                skipped += 1;
                audit::record("import.cc_switch_skip", format!("{tool}:{id}:{error}"));
            }
        }
    }
    audit::record("import.cc_switch_batch", format!("{tool}:imported={imported};skipped={skipped}"));
    let _ = app.emit("kumoswitch://changed", ());
    tray::refresh(&app);
    Ok(CcSwitchBatchResult { imported, skipped, providers })
}

#[tauri::command]
fn cc_switch_import_route_stack(tool: String, app: tauri::AppHandle) -> Result<CcSwitchRouteResult, String> {
    let snapshot = ccswitch::refresh_snapshot();
    let route_ids = snapshot.route_provider_ids(&tool);
    if route_ids.is_empty() {
        return Err("CC Switch 沒有可匯入的路由供應商".into());
    }
    let mut imported = 0usize;
    let mut providers = Vec::new();
    let mut stack = Vec::new();
    for id in route_ids {
        let (provider, existed) = cc_import_candidate(&tool, &id, &snapshot)?;
        if !existed { imported += 1; }
        stack.push(format!("{tool}:{}", provider.id));
        providers.push(provider);
    }
    let mut data = store::load();
    data.proxy.stack.retain(|reference| !reference.starts_with(&format!("{tool}:")));
    data.proxy.stack.extend(stack.clone());
    store::save(&data)?;
    let _ = proxy::start();
    audit::record("import.cc_switch_route", format!("{tool}:targets={}", stack.len()));
    let _ = app.emit("kumoswitch://changed", ());
    tray::refresh(&app);
    Ok(CcSwitchRouteResult { imported, stack, providers })
}

fn backup_files_for(spec: &ToolSpec) -> Vec<(std::path::PathBuf, String)> {
    let mut seen = std::collections::BTreeSet::new();
    let mut files = Vec::new();
    for step in spec.steps {
        if !seen.insert(step.file) { continue; }
        let path = adapters::resolve_file(spec, step.file);
        if path.exists() {
            files.push((path.clone(), adapters::display_path(&path)));
        }
    }
    files
}

fn backup_all_tools(reason: &str) -> (usize, usize) {
    let mut snapshots = 0usize;
    let mut tools = 0usize;
    for spec in TOOLS {
        if !adapters::tool_dir(spec).exists() { continue; }
        let files = backup_files_for(spec);
        if files.is_empty() { continue; }
        if backup::snapshot_with_reason(spec.id, &files, reason).is_ok() {
            snapshots += 1;
            tools += 1;
        }
    }
    (snapshots, tools)
}

#[tauri::command]
fn backup_center() -> backup::BackupCenter {
    backup::center()
}

#[tauri::command]
fn backup_create(tool: String) -> Result<backup::BackupInfo, String> {
    let spec = spec(&tool)?;
    let files = backup_files_for(spec);
    if files.is_empty() {
        return Err("這個 Harness 目前沒有可備份的設定檔".into());
    }
    let (id, _) = backup::snapshot_with_reason(&tool, &files, "manual")?;
    audit::record("backup.manual", format!("{tool}:{id}"));
    backup::list(&tool).into_iter().find(|backup| backup.id == id).ok_or_else(|| "備份已建立但找不到清單項目".into())
}

#[tauri::command]
fn backup_delete(tool: String, id: String) -> Result<(), String> {
    backup::remove(&tool, &id)?;
    audit::record("backup.delete", format!("{tool}:{id}"));
    Ok(())
}

#[tauri::command]
fn backup_set_policy(policy: backup::BackupPolicy) -> Result<backup::BackupPolicy, String> {
    let saved = backup::set_policy(policy)?;
    audit::record("backup.policy", format!("scheduled={};hours={};keep={}", saved.scheduled, saved.interval_hours, saved.keep));
    Ok(saved)
}

#[tauri::command]
fn prepare_update_backup() -> Result<PreUpdateBackupResult, String> {
    let data = store::load();
    if !data.pre_update_backup {
        return Ok(PreUpdateBackupResult { snapshots: 0, tools: 0 });
    }
    let (snapshots, tools) = backup_all_tools("pre-update");
    audit::record("backup.pre_update", format!("snapshots={snapshots};tools={tools}"));
    Ok(PreUpdateBackupResult { snapshots, tools })
}

#[tauri::command]
fn set_update_preferences(channel: String, pre_update_backup: bool) -> Result<serde_json::Value, String> {
    let channel = if channel == "beta" { "beta" } else { "stable" };
    let mut data = store::load();
    data.update_channel = channel.into();
    data.pre_update_backup = pre_update_backup;
    store::save(&data)?;
    Ok(serde_json::json!({ "channel": channel, "preUpdateBackup": pre_update_backup }))
}

fn spawn_backup_loop(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(15 * 60));
        let data = store::load();
        let policy = data.backup.clone();
        if !policy.scheduled { continue; }
        let now = store::stamp() as u64;
        let due = policy.last_run == 0 || now.saturating_sub(policy.last_run) >= u64::from(policy.interval_hours) * 3_600_000;
        if !due { continue; }
        let (snapshots, tools) = backup_all_tools("scheduled");
        if snapshots > 0 {
            let mut latest = store::load();
            latest.backup.last_run = now;
            let _ = store::save(&latest);
            audit::record("backup.scheduled", format!("snapshots={snapshots};tools={tools}"));
            let _ = app.emit("kumoswitch://changed", ());
        }
    });
}

fn spawn_guardian_loop(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut pending = std::collections::BTreeMap::<String, u32>::new();
        let mut last_repair = std::collections::BTreeMap::<String, u64>::new();
        loop {
            let data = store::load();
            let policy = data.guardian.clone();
            if !policy.enabled {
                pending.clear();
                std::thread::sleep(std::time::Duration::from_secs(policy.poll_secs.clamp(2, 60)));
                continue;
            }
            let transitions = guardian::observe(&data);
            if !transitions.is_empty() && policy.notify {
                let _ = app.emit("kumoswitch://guardian", &transitions);
            }
            if policy.auto_repair {
                let overview = guardian::overview();
                let now = store::stamp() as u64;
                for status in overview.statuses.iter().filter(|status| status.status == "drifted") {
                    let Some(provider_id) = status.active_id.clone() else { continue };
                    let count = pending.entry(status.tool.clone()).or_default();
                    *count = count.saturating_add(1);
                    let cooled = last_repair.get(&status.tool).is_none_or(|at| now.saturating_sub(*at) >= 60_000);
                    if *count >= 2 && cooled {
                        match apply_core(&status.tool, &provider_id) {
                            Ok(result) => guardian::record_repair(&status.tool, &provider_id, true, &result.message),
                            Err(error) => guardian::record_repair(&status.tool, &provider_id, false, &error),
                        }
                        last_repair.insert(status.tool.clone(), now);
                        pending.insert(status.tool.clone(), 0);
                        let _ = app.emit("kumoswitch://changed", ());
                        tray::refresh(&app);
                    }
                }
                for tool in pending.keys().cloned().collect::<Vec<_>>() {
                    if !overview.statuses.iter().any(|status| status.tool == tool && status.status == "drifted") {
                        pending.remove(&tool);
                    }
                }
            } else {
                pending.clear();
            }
            std::thread::sleep(std::time::Duration::from_secs(policy.poll_secs.clamp(2, 60)));
        }
    });
}

fn spawn_cc_switch_refresh_loop(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last_modified = ccswitch::database_modified_ms();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(20));
            let modified = ccswitch::database_modified_ms();
            if modified == 0 || modified == last_modified { continue; }
            last_modified = modified;
            let snapshot = ccswitch::refresh_snapshot();
            if snapshot.public_error().is_none() {
                audit::record("cc_switch.auto_refresh", format!("modified={modified}"));
                let _ = app.emit("kumoswitch://changed", ());
            }
        }
    });
}

fn spawn_proxy_alert_loop(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(10));
        let notify = store::load().proxy.alerts.notify;
        if !notify { continue; }
        for alert in proxy::evaluate_alerts_now() {
            let _ = app.emit("kumoswitch://proxy-alert", alert);
        }
    });
}

#[tauri::command]
fn backup_list(tool: String) -> Vec<backup::BackupInfo> {
    backup::list(&tool)
}

#[tauri::command]
fn backup_restore(tool: String, id: String) -> Result<Vec<String>, String> {
    let restored = backup::restore(&tool, &id)?;
    guardian::mark_self_write();
    audit::record("backup.restore", format!("{tool}:{id};files={}", restored.len()));
    Ok(restored)
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
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("explorer")
        .arg(format!("/select,{}", target.display()))
        .spawn();

    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg("-R").arg(&target).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let spawned = {
        let parent = if target.is_dir() {
            target.as_path()
        } else {
            target.parent().unwrap_or(target.as_path())
        };
        std::process::Command::new("xdg-open").arg(parent).spawn()
    };

    spawned
        .map(|_| ())
        .map_err(|error| format!("無法開啟檔案位置：{error}"))
}

#[tauri::command]
fn audit_log(limit: usize) -> Vec<audit::AuditEntry> {
    audit::tail(limit.clamp(1, 200))
}

fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn();
    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let spawned = std::process::Command::new("xdg-open").arg(url).spawn();
    spawned.map(|_| ()).map_err(|error| format!("無法開啟連結：{error}"))
}

fn validate_external_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.len() > 2048 {
        return Err("連結過長".into());
    }
    let parsed = reqwest::Url::parse(trimmed).map_err(|_| "連結格式不正確".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("只允許開啟 HTTP／HTTPS 連結".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("連結不可包含帳號或密碼".into());
    }
    Ok(parsed.to_string())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open_browser(&validate_external_url(&url)?)
}

#[tauri::command]
fn open_install_page(channel: Option<String>) -> Result<(), String> {
    let channel = if channel.as_deref() == Some("beta") { "beta" } else { "stable" };
    let url = format!("https://cypwlp.github.io/kumoSwitch/install.html?v={}&channel={channel}", env!("CARGO_PKG_VERSION"));
    open_browser(&url)
}

#[tauri::command]
fn app_info() -> serde_json::Value {
    let data = store::load();
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "dataDir": adapters::display_path(&store::data_dir()),
        "encrypted": crypto::available(),
        "autoHealth": data.auto_health,
        "autoModelSync": data.auto_model_sync,
        "guardian": data.guardian,
        "backup": data.backup,
        "updateChannel": data.update_channel,
        "preUpdateBackup": data.pre_update_backup,
        "releaseChannel": option_env!("KUMOSWITCH_RELEASE_CHANNEL").unwrap_or("stable"),
        "buildCommit": option_env!("KUMOSWITCH_BUILD_COMMIT").unwrap_or(""),
        "signing": if cfg!(windows) { option_env!("KUMOSWITCH_SIGNED").unwrap_or("optional") } else { "optional" },
    })
}

fn main() {
    if store::needs_migration() {
        let _ = store::migrate();
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main(app);
        }))
        .setup(|app| {
            use tauri::Manager as _;
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            tray::install(app.handle())?;
            spawn_health_loop(app.handle().clone());
            spawn_model_sync_loop(app.handle().clone());
            spawn_guardian_loop(app.handle().clone());
            spawn_backup_loop(app.handle().clone());
            spawn_cc_switch_refresh_loop(app.handle().clone());
            spawn_proxy_alert_loop(app.handle().clone());
            let _ = proxy::start();
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
            drift_overview,
            provider_search_index,
            provider_list,
            provider_save,
            provider_clone,
            import_cc_switch_provider,
            import_cc_switch_batch,
            cc_switch_import_route_stack,
            cc_switch_refresh,
            reveal_provider_key,
            provider_config_preview,
            provider_select_model,
            toggle_model_favorite,
            archive_model,
            discover_provider_models,
            discover_model_reasoning,
            model_compatibility,
            api_key_add,
            api_key_update,
            api_key_activate,
            api_key_remove,
            api_key_test,
            test_model,
            live_test_model,
            live_test_policy,
            set_live_test_policy,
            provider_reorder,
            provider_delete,
            preview,
            apply_provider,
            import_from_config,
            import_scan,
            import_apply,
            test_provider,
            test_history,
            set_auto_health,
            set_auto_model_sync,
            usage_report,
            provider_presets,
            harness_manager_list,
            harness_install,
            health_overview,
            proxy_status,
            proxy_metrics,
            proxy_reset_metrics,
            proxy_export_diagnostics,
            proxy_save,
            proxy_attach,
            export_providers_encrypted,
            export_diagnostics,
            import_providers_json,
            inspect_encrypted_backup,
            import_providers_encrypted,
            backup_list,
            backup_center,
            backup_create,
            backup_delete,
            backup_restore,
            backup_set_policy,
            guardian_status,
            guardian_set_policy,
            guardian_repair,
            guardian_clear_events,
            profile_list,
            profile_save,
            profile_delete,
            profile_import_provider,
            profile_sync,
            prepare_update_backup,
            set_update_preferences,
            reveal_config,
            reveal_path,
            audit_log,
            open_install_page,
            open_external_url,
            app_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod write_path_tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("kumoswitch-{tag}-{}", store::stamp()));
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
            .filter(|e| e.file_name().to_string_lossy().contains("kumoswitch-tmp"))
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
    fn external_links_are_limited_to_http_and_https() {
        assert!(validate_external_url("https://opencode.ai/download").is_ok());
        assert!(validate_external_url("http://127.0.0.1:11434").is_ok());
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("file:///C:/Windows/System32/calc.exe").is_err());
        assert!(validate_external_url("https://user:secret@example.com/").is_err());
    }

    #[test]
    fn endpoint_comparison_ignores_trailing_slash() {
        assert!(same_endpoint("https://a/v1/", "https://a/v1"));
        assert!(!same_endpoint("", ""));
    }
}

#[cfg(test)]
mod redaction_tests {
    use super::*;

    #[test]
    fn provider_view_never_serializes_the_full_key() {
        let provider = Provider {
            id: "p1".into(),
            config_id: "demo".into(),
            name: "Demo".into(),
            base_url: "https://example.com/v1".into(),
            api_key: "sk-very-secret-9876".into(),
            api_key_enc: String::new(),
            model: "demo".into(),
            models: vec![ModelProfile::new("demo")],
            kind: "openai".into(),
            note: String::new(),
            profile_id: String::new(),
            api_keys: vec![adapters::ApiKeyVersion {
                id: "key1".into(),
                label: "Rotated".into(),
                secret: "sk-key-version-secret-1111".into(),
                fingerprint: "0011223344556677".into(),
                status: "active".into(),
                ..adapters::ApiKeyVersion::default()
            }],
            last_used: 0,
            model_synced_at: 0,
            previous_model: String::new(),
            model_sync_interval_secs: adapters::default_model_sync_interval_secs(),
            model_sync_jitter_secs: adapters::default_model_sync_jitter_secs(),
            model_sync_next_at: 0,
            model_sync_retry_at: 0,
            model_sync_failures: 0,
            model_sync_last_error: String::new(),
        };
        let view = ProviderView::from(provider);
        assert_eq!(view.api_key, "");
        assert_eq!(view.api_key_masked, "••••9876");
        let serialized = serde_json::to_string(&view).unwrap();
        assert!(!serialized.contains("sk-very-secret-9876"));
        assert!(!serialized.contains("sk-key-version-secret-1111"));
        assert!(serialized.contains("••••9876"));
        assert!(serialized.contains("0011223344556677"));
    }

    #[test]
    fn provider_keys_are_masked_in_preview_text() {
        let keys = vec!["sk-short-1234".to_string(), "sk-a-much-longer-secret-9876".to_string()];
        let preview = "api_key = \"sk-short-1234\"\nold = \"sk-a-much-longer-secret-9876\"\n";
        let redacted = redact_keys(preview, &keys);

        assert!(!redacted.contains("sk-short-1234"));
        assert!(!redacted.contains("sk-a-much-longer-secret-9876"));
        assert!(redacted.contains("••••1234"));
        assert!(redacted.contains("••••9876"));
    }
}


#[cfg(test)]
mod import_merge_tests {
    use super::*;

    fn sample(id: &str, model: &str) -> Provider {
        Provider {
            id: id.into(),
            config_id: "shared".into(),
            name: "Same".into(),
            base_url: "https://example.invalid/v1".into(),
            api_key: "existing-secret".into(),
            model: model.into(),
            models: vec![ModelProfile::new(model)],
            kind: "responses".into(),
            ..Provider::default()
        }
    }

    #[test]
    fn merge_import_keeps_existing_key_and_unions_models() {
        let existing = sample("local", "model-a");
        let mut incoming = sample("remote", "model-b");
        incoming.api_key = "remote-secret".into();
        let merged = merge_import_provider(&existing, incoming);
        assert_eq!(merged.id, "local");
        assert_eq!(merged.api_key, "existing-secret");
        assert_eq!(merged.models.len(), 2);
        assert!(merged.models.iter().any(|model| model.id == "model-a"));
        assert!(merged.models.iter().any(|model| model.id == "model-b"));
    }

    #[test]
    fn import_differences_are_human_readable() {
        let existing = sample("one", "model-a");
        let mut incoming = sample("two", "model-b");
        incoming.name = "Different".into();
        incoming.base_url = "https://different.invalid/v1".into();
        let differences = provider_differences(&existing, &incoming);
        assert!(differences.iter().any(|field| field == "名稱"));
        assert!(differences.iter().any(|field| field == "Base URL"));
        assert!(differences.iter().any(|field| field == "目前模型"));
        assert!(differences.iter().any(|field| field == "模型清單"));
    }
}

#[cfg(test)]
mod v014_tests {
    use super::*;

    #[test]
    fn model_sync_schedule_honors_interval_retry_and_manual_mode() {
        let day = 24 * 60 * 60 * 1000;
        assert!(!model_sync_due(day, 0, day + 1, 0, 86_400));
        assert!(model_sync_due(day + 2, 0, day + 1, 0, 86_400));
        assert!(!model_sync_due(day, day, 0, day + 1, 86_400));
        assert!(model_sync_due(day + 2, day, 0, day + 1, 86_400));
        assert!(!model_sync_due(day * 2, 0, 0, 0, 0));
        assert_eq!(model_sync_backoff_secs(1), 300);
        assert!(model_sync_backoff_secs(5) > model_sync_backoff_secs(2));
        assert!(sync_jitter_secs("codex", "provider-a", day, 300) <= 300);
    }

    #[test]
    fn live_test_policy_counts_only_the_recent_window() {
        let now = 10 * LIVE_TEST_WINDOW_MS;
        let mut data = store::Store::default();
        data.live_test_daily_limit = 2;
        data.live_test_max_output_tokens = 16;
        data.live_test_runs = vec![now - 1000, now - LIVE_TEST_WINDOW_MS - 1, now - 2000];
        let policy = live_test_policy_for(&data, now);
        assert_eq!(policy.used_24h, 2);
        assert_eq!(policy.remaining_24h, 0);
        assert_eq!(policy.max_output_tokens, 16);
    }
}

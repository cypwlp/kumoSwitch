//! Read-only bridge to CC Switch's local provider database.
//!
//! CC Switch and kumoSwitch intentionally own different data. CC Switch keeps
//! its provider catalogue in `cc-switch.db`; kumoSwitch reads the actual Codex
//! config file. When CC Switch proxy/route mode is active, the real config only
//! contains a local proxy endpoint, so we expose CC Switch's catalogue as a
//! clearly labelled external source instead of pretending they are the same.

use crate::adapters::{default_model_sync_interval_secs, default_model_sync_jitter_secs, ModelProfile, Provider};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize)]
pub struct CcSwitchProviderView {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub models: Vec<ModelProfile>,
    pub kind: String,
    pub website_url: String,
    pub category: String,
    pub icon: String,
    pub icon_color: String,
    pub is_current: bool,
    pub in_failover_queue: bool,
    pub has_api_key: bool,
    pub already_imported: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct CcSwitchSource {
    pub available: bool,
    pub mode: String,
    pub attached: bool,
    pub db_path: String,
    pub providers: Vec<CcSwitchProviderView>,
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
struct RawCcProvider {
    app_type: String,
    id: String,
    name: String,
    website_url: String,
    category: String,
    icon: String,
    icon_color: String,
    is_current: bool,
    in_failover_queue: bool,
    base_url: String,
    model: String,
    models: Vec<ModelProfile>,
    kind: String,
    api_key: String,
}

#[derive(Default)]
pub struct Snapshot {
    db_path: PathBuf,
    installed: bool,
    apps: BTreeMap<String, LiveApp>,
    stack_ids: BTreeMap<String, BTreeSet<String>>,
    providers: Vec<RawCcProvider>,
    error: Option<String>,
}

pub fn tool_app_type(tool: &str) -> Option<&'static str> {
    match tool {
        "codex" => Some("codex"),
        "claude" => Some("claude"),
        "gemini" => Some("gemini"),
        "grok" => Some("grokbuild"),
        _ => None,
    }
}

fn db_path() -> PathBuf {
    crate::adapters::home().join(".cc-switch").join("cc-switch.db")
}

fn live_state_path() -> PathBuf {
    crate::adapters::home().join(".cc-switch").join("live-state.json")
}

#[derive(Default, Deserialize)]
struct LiveState {
    #[serde(default)]
    apps: BTreeMap<String, LiveApp>,
}

#[derive(Default, Deserialize)]
struct LiveApp {
    #[serde(default)]
    mode: String,
    #[serde(default)]
    attached: bool,
    #[serde(default)]
    proxy_route: String,
    stack: Option<LiveStack>,
}

#[derive(Default, Deserialize)]
struct LiveStack {
    #[serde(default)]
    members: Vec<String>,
    #[serde(default)]
    keys: BTreeMap<String, String>,
}

fn read_live_state(path: &Path) -> LiveState {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn open_readonly(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("無法讀取 CC Switch 資料庫：{error}"))?;
    connection
        .busy_timeout(std::time::Duration::from_secs(2))
        .map_err(|error| format!("CC Switch 資料庫忙碌：{error}"))?;
    let _ = connection.execute_batch("PRAGMA query_only = ON;");
    Ok(connection)
}

fn parse_models(settings: &Value, model: &str) -> Vec<ModelProfile> {
    let mut models = Vec::new();
    if let Some(items) = settings
        .get("modelCatalog")
        .and_then(|value| value.get("models"))
        .and_then(Value::as_array)
    {
        for item in items {
            let Some(id) = item.get("model").and_then(Value::as_str).map(str::trim).filter(|id| !id.is_empty()) else {
                continue;
            };
            let name = item
                .get("displayName")
                .and_then(Value::as_str)
                .unwrap_or(id)
                .to_string();
            let reasoning = item
                .get("reasoningLevels")
                .and_then(Value::as_array)
                .is_some_and(|levels| !levels.is_empty());
            let vision = item
                .get("inputModalities")
                .and_then(Value::as_array)
                .is_some_and(|modalities| modalities.iter().any(|value| value.as_str() == Some("image")));
            models.push(ModelProfile {
                id: id.to_string(),
                name,
                context_window: item.get("contextWindow").and_then(Value::as_u64),
                max_output: item
                    .get("maxOutputTokens")
                    .or_else(|| item.get("max_output_tokens"))
                    .and_then(Value::as_u64),
                reasoning: Some(reasoning),
                vision: Some(vision),
                tools: None,
                metadata: item.clone(),
                checks: Vec::new(),
                favorite: false,
                last_used_at: 0,
                last_seen_at: 0,
                archived: false,
            });
        }
    }
    if models.is_empty() && !model.is_empty() {
        models.push(ModelProfile::new(model));
    }
    models
}

fn parse_settings(settings_config: &str) -> (String, String, Vec<ModelProfile>, String, String) {
    let Ok(settings) = serde_json::from_str::<Value>(settings_config) else {
        return (String::new(), String::new(), Vec::new(), String::new(), String::new());
    };
    let api_key = settings
        .get("auth")
        .and_then(Value::as_object)
        .and_then(|auth| auth.values().find_map(Value::as_str))
        .unwrap_or("")
        .to_string();
    let config = settings.get("config").and_then(Value::as_str).unwrap_or("");
    let doc = config.parse::<toml_edit::DocumentMut>().ok();
    let model = doc
        .as_ref()
        .and_then(|doc| doc.get("model"))
        .and_then(toml_edit::Item::as_str)
        .unwrap_or("")
        .to_string();
    let mut base_url = String::new();
    let mut kind = String::new();
    if let Some(providers) = doc
        .as_ref()
        .and_then(|doc| doc.get("model_providers"))
        .and_then(toml_edit::Item::as_table_like)
    {
        for (_, item) in providers.iter() {
            let Some(table) = item.as_table_like() else {
                continue;
            };
            if let Some(url) = table.get("base_url").and_then(toml_edit::Item::as_str) {
                base_url = url.to_string();
                kind = table
                    .get("wire_api")
                    .and_then(toml_edit::Item::as_str)
                    .unwrap_or("")
                    .to_string();
                break;
            }
        }
    }
    let models = parse_models(&settings, &model);
    (api_key, model, models, base_url, kind)
}

pub fn read_snapshot() -> Snapshot {
    let path = db_path();
    if !path.exists() {
        return Snapshot {
            db_path: path,
            installed: false,
            ..Snapshot::default()
        };
    }
    let mut snapshot = Snapshot {
        db_path: path.clone(),
        installed: true,
        ..Snapshot::default()
    };
    let live = read_live_state(&live_state_path());
    for (app_type, app) in &live.apps {
        let ids = snapshot.stack_ids.entry(app_type.clone()).or_default();
        if !app.proxy_route.is_empty() {
            ids.insert(app.proxy_route.clone());
        }
        if let Some(stack) = &app.stack {
            ids.extend(stack.members.iter().cloned());
            ids.extend(stack.keys.values().cloned());
        }
    }
    snapshot.apps = live.apps;

    let result = (|| -> Result<Vec<RawCcProvider>, String> {
        let connection = open_readonly(&path)?;
        let mut statement = connection
            .prepare(
                "SELECT id, app_type, name, settings_config, website_url, category, icon, icon_color,
                        is_current, in_failover_queue
                 FROM providers
                 WHERE app_type IN ('codex', 'claude', 'gemini', 'grokbuild')
                 ORDER BY sort_index, name",
            )
            .map_err(|error| format!("CC Switch provider schema 不相容：{error}"))?;
        let rows = statement
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let app_type: String = row.get(1)?;
                let name: String = row.get(2)?;
                let settings_config: String = row.get(3)?;
                Ok((id, app_type, name, settings_config, row.get::<_, String>(4).unwrap_or_default(), row.get::<_, String>(5).unwrap_or_default(), row.get::<_, String>(6).unwrap_or_default(), row.get::<_, String>(7).unwrap_or_default(), row.get::<_, i64>(8).unwrap_or(0) != 0, row.get::<_, i64>(9).unwrap_or(0) != 0))
            })
            .map_err(|error| format!("讀取 CC Switch providers 失敗：{error}"))?;
        let mut providers = Vec::new();
        for row in rows.flatten() {
            let (id, app_type, name, settings_config, website_url, category, icon, icon_color, is_current, in_failover_queue) = row;
            let (api_key, model, models, base_url, kind) = parse_settings(&settings_config);
            if base_url.is_empty() && model.is_empty() && models.is_empty() {
                continue;
            }
            providers.push(RawCcProvider {
                app_type,
                id,
                name,
                website_url,
                category,
                icon,
                icon_color,
                is_current,
                in_failover_queue,
                base_url,
                model,
                models,
                kind,
                api_key,
            });
        }
        Ok(providers)
    })();
    match result {
        Ok(providers) => snapshot.providers = providers,
        Err(error) => snapshot.error = Some(error),
    }
    snapshot
}

impl Snapshot {
    pub fn view_for(&self, tool: &str, existing: &[Provider]) -> Option<CcSwitchSource> {
        if !self.installed {
            return None;
        }
        let app_type = tool_app_type(tool)?;
        let app = self.apps.get(app_type);
        let stack_ids = self.stack_ids.get(app_type);
        let mut providers = self
            .providers
            .iter()
            .filter(|provider| provider.app_type == app_type)
            .map(|provider| CcSwitchProviderView {
                id: provider.id.clone(),
                name: provider.name.clone(),
                base_url: provider.base_url.clone(),
                model: provider.model.clone(),
                models: provider.models.clone(),
                kind: provider.kind.clone(),
                website_url: provider.website_url.clone(),
                category: provider.category.clone(),
                icon: provider.icon.clone(),
                icon_color: provider.icon_color.clone(),
                is_current: provider.is_current || stack_ids.is_some_and(|ids| ids.contains(&provider.id)),
                in_failover_queue: provider.in_failover_queue || stack_ids.is_some_and(|ids| ids.contains(&provider.id)),
                has_api_key: !provider.api_key.is_empty(),
                already_imported: existing.iter().any(|item| {
                    item.name.eq_ignore_ascii_case(&provider.name)
                        || (!item.base_url.is_empty()
                            && item.base_url.trim_end_matches('/') == provider.base_url.trim_end_matches('/'))
                }),
            })
            .collect::<Vec<_>>();
        providers.sort_by(|left, right| {
            right
                .is_current
                .cmp(&left.is_current)
                .then_with(|| right.in_failover_queue.cmp(&left.in_failover_queue))
                .then_with(|| left.name.cmp(&right.name))
        });
        Some(CcSwitchSource {
            available: true,
            mode: app.map(|item| item.mode.clone()).unwrap_or_default(),
            attached: app.map(|item| item.attached).unwrap_or(false),
            db_path: crate::adapters::display_path(&self.db_path),
            providers,
            error: self.error.clone(),
        })
    }

    pub fn provider_for_import(&self, tool: &str, provider_id: &str) -> Result<Provider, String> {
        if !self.installed {
            return Err("找不到 CC Switch 資料庫".into());
        }
        let app_type = tool_app_type(tool).ok_or_else(|| "這個 Harness 尚未支援 CC Switch 匯入".to_string())?;
        let raw = self
            .providers
            .iter()
            .find(|provider| provider.app_type == app_type && provider.id == provider_id)
            .ok_or_else(|| "CC Switch 已找不到這個供應商".to_string())?;
        let mut slug = raw
            .name
            .chars()
            .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
            .collect::<String>();
        while slug.contains("--") {
            slug = slug.replace("--", "-");
        }
        let slug = slug.trim_matches('-');
        let prefix = raw.id.get(..8).unwrap_or(&raw.id);
        let config_id = format!("cc-switch-{}-{prefix}", if slug.is_empty() { "provider" } else { slug });
        let mut provider = Provider {
            id: String::new(),
            config_id,
            name: raw.name.clone(),
            base_url: raw.base_url.clone(),
            api_key: raw.api_key.clone(),
            api_key_enc: String::new(),
            model: raw.model.clone(),
            models: raw.models.clone(),
            kind: raw.kind.clone(),
            note: "從 CC Switch 匯入".into(),
            last_used: 0,
            model_synced_at: 0,
            previous_model: String::new(),
            model_sync_interval_secs: default_model_sync_interval_secs(),
            model_sync_jitter_secs: default_model_sync_jitter_secs(),
            model_sync_next_at: 0,
            model_sync_retry_at: 0,
            model_sync_failures: 0,
            model_sync_last_error: String::new(),
        };
        crate::adapters::normalize_provider_models(&mut provider);
        Ok(provider)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_real_cc_switch_database_if_present() {
        let snapshot = read_snapshot();
        if !snapshot.installed {
            return;
        }
        assert!(snapshot.error.is_none(), "{:?}", snapshot.error);
        let provider = snapshot.providers.iter().find(|provider| provider.app_type == "codex").expect("codex provider");
        let imported = snapshot.provider_for_import("codex", &provider.id).expect("import mapping");
        assert!(!imported.base_url.is_empty());
        assert!(imported.config_id.starts_with("cc-switch-"));
    }

    #[test]
    fn parses_cc_switch_codex_settings() {
        let settings = serde_json::json!({
            "auth": {"OPENAI_API_KEY": "sk-test"},
            "config": "model = \"deepseek-v4.1\"\n[model_providers.custom]\nbase_url = \"https://example.com/v1\"\nwire_api = \"responses\"\n",
            "modelCatalog": {"models": [{"model": "deepseek-v4.1", "displayName": "DeepSeek", "contextWindow": 1048576, "reasoningLevels": ["high"], "inputModalities": ["text", "image"]}]}
        }).to_string();
        let (key, model, models, base_url, kind) = parse_settings(&settings);
        assert_eq!(key, "sk-test");
        assert_eq!(model, "deepseek-v4.1");
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].context_window, Some(1_048_576));
        assert_eq!(models[0].vision, Some(true));
        assert_eq!(base_url, "https://example.com/v1");
        assert_eq!(kind, "responses");
    }
}
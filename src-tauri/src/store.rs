use crate::adapters::Provider;
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;
use std::collections::BTreeMap;
use std::path::PathBuf;

fn data_root() -> PathBuf {
    if let Ok(path) = std::env::var("APPDATA") {
        if !path.is_empty() {
            return PathBuf::from(path);
        }
    }
    crate::adapters::home().join(".config")
}

fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn migrate_legacy_dir(legacy: &std::path::Path, current: &std::path::Path) {
    if current.exists() || !legacy.exists() {
        return;
    }
    if std::fs::rename(legacy, current).is_err() {
        let _ = copy_dir_all(legacy, current);
    }
}

pub fn data_dir() -> PathBuf {
    let root = data_root();
    let current = root.join("kumoSwitch");
    if !current.exists() {
        // Prefer the most recent legacy brand when both directories exist.
        for legacy in ["SwitchTower", "SwitchYard"] {
            let legacy = root.join(legacy);
            if legacy.exists() {
                migrate_legacy_dir(&legacy, &current);
                break;
            }
        }
    }
    let _ = crate::secure_fs::ensure_private_dir(&current);
    current
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct Store {
    #[serde(default)]
    pub providers: BTreeMap<String, Vec<Provider>>,
    #[serde(default)]
    pub active: BTreeMap<String, String>,
    /// Previous active provider per tool, for one-click rollback.
    #[serde(default)]
    pub previous_active: BTreeMap<String, String>,
    /// Re-test providers that already have history, on a timer.
    #[serde(default)]
    pub auto_health: bool,
    #[serde(default)]
    pub proxy: crate::proxy::ProxyConfig,
}

fn store_path() -> PathBuf {
    data_dir().join("providers.json")
}

pub fn load() -> Store {
    let path = store_path();
    let mut store: Store = std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    for list in store.providers.values_mut() {
        for provider in list.iter_mut() {
            if !provider.api_key_enc.is_empty() {
                if let Ok(key) = crate::crypto::open(&provider.api_key_enc) {
                    provider.api_key = key;
                }
            }
            crate::adapters::normalize_provider_models(provider);
        }
    }
    store
}

pub fn save(store: &Store) -> Result<(), String> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("無法建立資料目錄：{e}"))?;
    let mut outgoing = store.clone();
    for list in outgoing.providers.values_mut() {
        for provider in list.iter_mut() {
            crate::adapters::normalize_provider_models(provider);
            if provider.api_key.is_empty() {
                continue;
            }
            // An unreadable ciphertext must survive a metadata-only save.
            // Deleting the provider is the explicit way to remove its key.
            let blob = crate::crypto::seal(&provider.api_key)
                .map_err(|error| format!("無法加密 API Key：{error}"))?;
            provider.api_key_enc = blob;
            provider.api_key.zeroize();
        }
    }
    let text = serde_json::to_string_pretty(&outgoing).map_err(|e| e.to_string())?;
    crate::secure_fs::write_private(&store_path(), &text).map_err(|e| format!("無法寫入供應商清單：{e}"))
}

/// True when any stored key is still plaintext and can be protected.
pub fn needs_migration() -> bool {
    if !crate::crypto::available() {
        return false;
    }
    let raw: Store = std::fs::read_to_string(store_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    raw.providers
        .values()
        .flatten()
        .any(|p| !p.api_key.is_empty() && p.api_key_enc.is_empty())
}

pub fn migrate() -> Result<usize, String> {
    let store = load();
    let count = store.providers.values().flatten().filter(|p| !p.api_key.is_empty()).count();
    save(&store)?;
    Ok(count)
}

pub fn list(tool: &str) -> Vec<Provider> {
    load().providers.get(tool).cloned().unwrap_or_default()
}

pub fn upsert(tool: &str, provider: Provider) -> Result<Provider, String> {
    upsert_with_key_action(tool, provider, false)
}

pub fn upsert_with_key_action(
    tool: &str,
    mut provider: Provider,
    clear_key: bool,
) -> Result<Provider, String> {
    let mut store = load();
    if provider.id.is_empty() {
        provider.id = format!("p{}", stamp());
    }
    if provider.config_id.is_empty() {
        provider.config_id = make_config_id(tool, &provider.name);
    }
    crate::adapters::normalize_provider_models(&mut provider);
    // Two providers sharing a config_id would overwrite each other inside the
    // tool's own config file, so keep the identifiers distinct.
    let entry = store.providers.entry(tool.to_string()).or_default();
    if entry
        .iter()
        .any(|p| p.config_id == provider.config_id && p.id != provider.id)
    {
        provider.config_id = make_config_id(tool, &format!("{}-{}", provider.name, entry.len() + 1));
    }
    match entry.iter_mut().find(|p| p.id == provider.id) {
        Some(existing) => {
            if clear_key {
                provider.api_key.zeroize();
                provider.api_key_enc.zeroize();
            } else if provider.api_key.is_empty() && !existing.api_key_enc.is_empty() {
                provider.api_key = existing.api_key.clone();
                provider.api_key_enc = existing.api_key_enc.clone();
            }
            *existing = provider.clone();
        }
        None => entry.push(provider.clone()),
    }
    save(&store)?;
    Ok(provider)
}

pub fn remove(tool: &str, id: &str) -> Result<(), String> {
    let mut store = load();
    if let Some(entry) = store.providers.get_mut(tool) {
        entry.retain(|p| p.id != id);
    }
    if store.active.get(tool).map(|a| a == id).unwrap_or(false) {
        store.active.remove(tool);
    }
    if store.previous_active.get(tool).map(|a| a == id).unwrap_or(false) {
        store.previous_active.remove(tool);
    }
    save(&store)
}

/// Persist the provider card order. Unknown ids are ignored and any item not
/// named by the UI is appended in its previous relative order.
pub fn reorder(tool: &str, ids: &[String]) -> Result<Vec<Provider>, String> {
    let mut store = load();
    let entry = store.providers.entry(tool.to_string()).or_default();
    entry.sort_by_key(|provider| {
        ids.iter()
            .position(|id| id == &provider.id)
            .unwrap_or(usize::MAX)
    });
    let ordered = entry.clone();
    save(&store)?;
    Ok(ordered)
}

/// Change only the provider's selected model. The caller can then preview the
/// targeted config diff without rewriting the provider metadata by hand.
pub fn select_model(tool: &str, id: &str, model_id: &str) -> Result<Provider, String> {
    let mut store = load();
    let provider = store
        .providers
        .get_mut(tool)
        .and_then(|list| list.iter_mut().find(|provider| provider.id == id))
        .ok_or_else(|| "找不到這個供應商".to_string())?;
    crate::adapters::normalize_provider_models(provider);
    if !provider.models.iter().any(|model| model.id == model_id) {
        return Err(format!("這個供應商沒有模型「{model_id}」"));
    }
    provider.model = model_id.to_string();
    let selected = provider.clone();
    save(&store)?;
    Ok(selected)
}

/// Append a model-specific endpoint check while retaining a short local trend.
pub fn record_model_check(
    tool: &str,
    id: &str,
    model_id: &str,
    check: crate::adapters::ModelCheck,
) -> Result<crate::adapters::ModelProfile, String> {
    let mut store = load();
    let provider = store
        .providers
        .get_mut(tool)
        .and_then(|list| list.iter_mut().find(|provider| provider.id == id))
        .ok_or_else(|| "找不到這個供應商".to_string())?;
    crate::adapters::normalize_provider_models(provider);
    let model = provider
        .models
        .iter_mut()
        .find(|model| model.id == model_id)
        .ok_or_else(|| format!("這個供應商沒有模型「{model_id}」"))?;
    model.checks.push(check);
    if model.checks.len() > 20 {
        let cut = model.checks.len() - 20;
        model.checks.drain(..cut);
    }
    let updated = model.clone();
    save(&store)?;
    Ok(updated)
}

/// Mark a provider as applied: remembers it as active and stamps the time.
pub fn touch(tool: &str, id: &str) {
    let mut store = load();
    let now = stamp() as u64;
    if let Some(list) = store.providers.get_mut(tool) {
        for provider in list.iter_mut() {
            if provider.id == id {
                provider.last_used = now;
            }
        }
    }
    if let Some(previous) = store.active.insert(tool.to_string(), id.to_string()) {
        if previous != id {
            store.previous_active.insert(tool.to_string(), previous);
        }
    }
    let _ = save(&store);
}

pub fn stamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn slug(text: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

pub fn make_config_id(tool: &str, name: &str) -> String {
    let base = slug(name);
    let base = if base.is_empty() { "custom".to_string() } else { base };
    match tool {
        "qoder" => format!("qoder-custom-{:08x}", (stamp() as u32) ^ 0x5f3a),
        _ => base,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_legacy_migration(legacy_name: &str) {
        let base = std::env::temp_dir().join(format!("kumoswitch-store-{legacy_name}-{}", stamp()));
        let legacy = base.join(legacy_name);
        let current = base.join("kumoSwitch");
        std::fs::create_dir_all(legacy.join("backups")).unwrap();
        std::fs::write(legacy.join("providers.json"), "{\"providers\":{}}").unwrap();
        std::fs::write(legacy.join("backups").join("one.json"), "backup").unwrap();

        migrate_legacy_dir(&legacy, &current);

        assert!(current.join("providers.json").exists());
        assert!(current.join("backups").join("one.json").exists());
        assert!(!legacy.exists());
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn migrates_legacy_switchtower_directory() {
        assert_legacy_migration("SwitchTower");
    }

    #[test]
    fn migrates_legacy_switchyard_directory() {
        assert_legacy_migration("SwitchYard");
    }
}

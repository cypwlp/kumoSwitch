use crate::adapters::Provider;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    if let Ok(p) = std::env::var("APPDATA") {
        if !p.is_empty() {
            return PathBuf::from(p).join("SwitchYard");
        }
    }
    crate::adapters::home().join(".config").join("SwitchYard")
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct Store {
    #[serde(default)]
    pub providers: BTreeMap<String, Vec<Provider>>,
    #[serde(default)]
    pub active: BTreeMap<String, String>,
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
                if let Some(key) = crate::crypto::open(&provider.api_key_enc) {
                    provider.api_key = key;
                }
            }
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
            if provider.api_key.is_empty() {
                continue;
            }
            match crate::crypto::seal(&provider.api_key) {
                Some(blob) if !blob.is_empty() => {
                    provider.api_key_enc = blob;
                    provider.api_key.clear();
                }
                _ => provider.api_key_enc.clear(),
            }
        }
    }
    let text = serde_json::to_string_pretty(&outgoing).map_err(|e| e.to_string())?;
    std::fs::write(store_path(), text).map_err(|e| format!("無法寫入供應商清單：{e}"))
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

pub fn upsert(tool: &str, mut provider: Provider) -> Result<Provider, String> {
    let mut store = load();
    if provider.id.is_empty() {
        provider.id = format!("p{}", stamp());
    }
    if provider.config_id.is_empty() {
        provider.config_id = make_config_id(tool, &provider.name);
    }
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
        Some(existing) => *existing = provider.clone(),
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
    save(&store)
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
    store.active.insert(tool.to_string(), id.to_string());
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

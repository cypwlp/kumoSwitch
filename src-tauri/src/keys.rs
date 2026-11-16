//! API-key lifecycle: rotation, activation, expiry metadata, low-cost checks and
//! redacted projections for the UI. Plaintext exists in memory only while the
//! operation is running; `store::save` seals every version before persisting.

use crate::adapters::{ApiKeyVersion, Provider};
use crate::net;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Serialize)]
pub struct ApiKeyView {
    pub id: String,
    pub label: String,
    pub fingerprint: String,
    pub created_at: u64,
    pub expires_at: u64,
    pub last_tested_at: u64,
    pub last_ok_at: u64,
    pub last_status: u16,
    pub status: String,
    pub note: String,
    pub active: bool,
    pub expired: bool,
}

#[derive(Deserialize)]
pub struct ApiKeyInput {
    pub provider_id: String,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub secret: String,
    #[serde(default)]
    pub expires_at: u64,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub activate: bool,
}

#[derive(Serialize)]
pub struct KeyTestResult {
    pub key: ApiKeyView,
    pub result: net::TestResult,
}

pub fn fingerprint(secret: &str) -> String {
    let digest = Sha256::digest(secret.as_bytes());
    digest[..8].iter().map(|byte| format!("{byte:02x}")).collect()
}

fn now_ms() -> u64 {
    crate::store::stamp() as u64
}

fn status_for(key: &ApiKeyVersion, active: bool, now: u64) -> String {
    if key.expires_at > 0 && now >= key.expires_at {
        "expired".into()
    } else if active {
        "active".into()
    } else if key.status == "retired" {
        "retired".into()
    } else {
        "standby".into()
    }
}

pub fn view(key: &ApiKeyVersion, active_id: &str) -> ApiKeyView {
    let active = key.id == active_id;
    ApiKeyView {
        id: key.id.clone(),
        label: if key.label.is_empty() { "未命名金鑰".into() } else { key.label.clone() },
        fingerprint: key.fingerprint.clone(),
        created_at: key.created_at,
        expires_at: key.expires_at,
        last_tested_at: key.last_tested_at,
        last_ok_at: key.last_ok_at,
        last_status: key.last_status,
        status: status_for(key, active, now_ms()),
        note: key.note.clone(),
        active,
        expired: key.expires_at > 0 && now_ms() >= key.expires_at,
    }
}

pub fn views(provider: &Provider) -> Vec<ApiKeyView> {
    let active_id = active_id(provider);
    provider.api_keys.iter().map(|key| view(key, &active_id)).collect()
}

pub fn active_id(provider: &Provider) -> String {
    if provider.api_key.is_empty() {
        return String::new();
    }
    let digest = fingerprint(&provider.api_key);
    provider
        .api_keys
        .iter()
        .find(|key| key.fingerprint == digest)
        .or_else(|| provider.api_keys.iter().find(|key| !key.secret.is_empty() && key.secret == provider.api_key))
        .map(|key| key.id.clone())
        .unwrap_or_default()
}

pub fn ensure_active_version(provider: &mut Provider) {
    let now = now_ms();
    if provider.api_key.is_empty() {
        return;
    }
    let digest = fingerprint(&provider.api_key);
    for key in &mut provider.api_keys {
        key.status = if key.expires_at > 0 && now >= key.expires_at {
            "expired".to_string()
        } else if key.fingerprint == digest {
            "active".to_string()
        } else if key.status == "active" {
            "standby".to_string()
        } else {
            key.status.clone()
        };
    }
    if !provider.api_keys.iter().any(|key| key.fingerprint == digest) {
        provider.api_keys.push(ApiKeyVersion {
            id: format!("key{}", now),
            label: "目前金鑰".into(),
            secret: provider.api_key.clone(),
            fingerprint: digest,
            created_at: now,
            status: "active".into(),
            ..ApiKeyVersion::default()
        });
    }
}

fn load_provider(tool: &str, provider_id: &str) -> Result<Provider, String> {
    crate::store::list(tool)
        .into_iter()
        .find(|provider| provider.id == provider_id)
        .ok_or_else(|| "找不到這個供應商".to_string())
}

fn save_provider(tool: &str, provider: Provider) -> Result<Provider, String> {
    crate::store::upsert(tool, provider)
}

pub fn add(tool: &str, input: ApiKeyInput) -> Result<ApiKeyView, String> {
    let mut provider = load_provider(tool, &input.provider_id)?;
    let secret = input.secret.trim().to_string();
    if secret.chars().count() < 4 {
        return Err("API Key 至少需要 4 個字元".into());
    }
    let now = now_ms();
    let digest = fingerprint(&secret);
    if let Some(existing) = provider.api_keys.iter().find(|key| key.fingerprint == digest) {
        return Err(format!("這把金鑰已存在（{}）", existing.label));
    }
    let id = format!("key{}", crate::store::stamp());
    let activate = input.activate || provider.api_key.is_empty();
    if activate {
        for key in &mut provider.api_keys {
            if key.status == "active" {
                key.status = "standby".into();
            }
        }
        provider.api_key = secret.clone();
    }
    let version = ApiKeyVersion {
        id: id.clone(),
        label: if input.label.trim().is_empty() { "輪替金鑰".into() } else { input.label.trim().to_string() },
        secret,
        fingerprint: digest,
        created_at: now,
        expires_at: input.expires_at,
        status: if activate { "active".into() } else { "standby".into() },
        note: input.note.trim().to_string(),
        ..ApiKeyVersion::default()
    };
    provider.api_keys.push(version.clone());
    ensure_active_version(&mut provider);
    save_provider(tool, provider)?;
    Ok(view(&version, &id))
}

pub fn update(tool: &str, input: ApiKeyInput) -> Result<ApiKeyView, String> {
    let mut provider = load_provider(tool, &input.provider_id)?;
    ensure_active_version(&mut provider);
    let active = active_id(&provider);
    let key = provider
        .api_keys
        .iter_mut()
        .find(|key| key.id == input.id)
        .ok_or_else(|| "找不到這把金鑰".to_string())?;
    if !input.label.trim().is_empty() {
        key.label = input.label.trim().to_string();
    }
    key.expires_at = input.expires_at;
    key.note = input.note.trim().to_string();
    let snapshot = key.clone();
    save_provider(tool, provider)?;
    Ok(view(&snapshot, &active))
}

pub fn activate(tool: &str, provider_id: &str, key_id: &str) -> Result<ApiKeyView, String> {
    let mut provider = load_provider(tool, provider_id)?;
    ensure_active_version(&mut provider);
    let selected = provider
        .api_keys
        .iter()
        .find(|key| key.id == key_id)
        .cloned()
        .ok_or_else(|| "找不到這把金鑰".to_string())?;
    if selected.expires_at > 0 && now_ms() >= selected.expires_at {
        return Err("這把金鑰已過期，請先更新到期日或改用其他金鑰".into());
    }
    if selected.secret.is_empty() {
        return Err("這把金鑰無法解密；為避免中斷，未切換".into());
    }
    provider.api_key = selected.secret.clone();
    for key in &mut provider.api_keys {
        key.status = if key.id == key_id { "active".into() } else if key.status == "active" { "standby".into() } else { key.status.clone() };
    }
    save_provider(tool, provider)?;
    Ok(view(&selected, key_id))
}

pub fn remove(tool: &str, provider_id: &str, key_id: &str) -> Result<(), String> {
    let mut provider = load_provider(tool, provider_id)?;
    ensure_active_version(&mut provider);
    if active_id(&provider) == key_id {
        return Err("使用中的金鑰不能刪除；請先切換到另一把".into());
    }
    let before = provider.api_keys.len();
    provider.api_keys.retain(|key| key.id != key_id);
    if provider.api_keys.len() == before {
        return Err("找不到這把金鑰".into());
    }
    save_provider(tool, provider)?;
    Ok(())
}

pub fn test(tool: &str, provider_id: &str, key_id: &str) -> Result<KeyTestResult, String> {
    let mut provider = load_provider(tool, provider_id)?;
    ensure_active_version(&mut provider);
    let active = active_id(&provider);
    let key = provider
        .api_keys
        .iter()
        .find(|key| key.id == key_id)
        .cloned()
        .ok_or_else(|| "找不到這把金鑰".to_string())?;
    if key.secret.is_empty() {
        return Err("這把金鑰無法解密；請重新輸入".into());
    }
    let mut probe = provider.clone();
    probe.api_key = key.secret.clone();
    let result = net::probe(&probe.base_url, &probe.api_key, tool == "claude");
    if let Some(saved) = provider.api_keys.iter_mut().find(|item| item.id == key_id) {
        saved.last_tested_at = now_ms();
        saved.last_status = result.status;
        if result.ok {
            saved.last_ok_at = saved.last_tested_at;
        }
    }
    let saved = save_provider(tool, provider)?;
    let updated = saved.api_keys.iter().find(|item| item.id == key_id).cloned().unwrap_or(key);
    Ok(KeyTestResult {
        key: view(&updated, &active),
        result,
    })
}

pub fn migrate_legacy(provider: &mut Provider) {
    ensure_active_version(provider);
    let now = now_ms();
    for key in &mut provider.api_keys {
        if key.fingerprint.is_empty() && !key.secret.is_empty() {
            key.fingerprint = fingerprint(&key.secret);
        }
        if key.id.is_empty() {
            key.id = format!("key{}", now + key.created_at.min(999));
        }
        if key.created_at == 0 {
            key.created_at = now;
        }
        key.status = status_for(key, key.fingerprint == fingerprint(&provider.api_key), now);
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_is_stable_and_does_not_contain_the_secret() {
        let one = fingerprint("sk-super-secret-value");
        let two = fingerprint("sk-super-secret-value");
        assert_eq!(one, two);
        assert_eq!(one.len(), 16);
        assert!(!one.contains("secret"));
    }

    #[test]
    fn legacy_provider_gets_an_active_version() {
        let mut provider = Provider {
            api_key: "sk-test-1234".into(),
            ..Provider::default()
        };
        migrate_legacy(&mut provider);
        assert_eq!(provider.api_keys.len(), 1);
        assert_eq!(provider.api_keys[0].status, "active");
        assert_eq!(active_id(&provider), provider.api_keys[0].id);
    }
}

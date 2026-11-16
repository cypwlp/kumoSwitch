//! Cross-Harness provider profiles. One encrypted endpoint/key/model bundle can
//! be bound to any number of adapters, while each Harness keeps a stable local
//! provider row and config id.

use crate::adapters::{ApiKeyVersion, ModelProfile, Provider};
use crate::keys;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SharedProfileTarget {
    #[serde(default)]
    pub tool: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub provider_id: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub model: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub kind: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub last_synced_at: u64,
}

fn default_true() -> bool { true }

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SharedProfile {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub models: Vec<ModelProfile>,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub keys: Vec<ApiKeyVersion>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub active_key_id: String,
    #[serde(default)]
    pub targets: Vec<SharedProfileTarget>,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub updated_at: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct SharedProfileView {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub kind: String,
    pub model: String,
    pub models: Vec<ModelProfile>,
    pub note: String,
    pub tags: Vec<String>,
    pub targets: Vec<SharedProfileTarget>,
    pub key_count: usize,
    pub active_key_label: String,
    pub api_key_masked: String,
    pub has_api_key: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Deserialize)]
pub struct SharedProfileInput {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub models: Vec<ModelProfile>,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub targets: Vec<SharedProfileTarget>,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub clear_api_key: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProfileSyncItem {
    pub tool: String,
    pub provider_id: String,
    pub provider_name: String,
    pub model: String,
    pub created: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProfileSyncResult {
    pub profile_id: String,
    pub synced: Vec<ProfileSyncItem>,
    pub skipped: Vec<String>,
}

fn now_ms() -> u64 { crate::store::stamp() as u64 }

fn mask_key(key: &str) -> String {
    let count = key.chars().count();
    if count == 0 { return String::new(); }
    let tail: String = key.chars().skip(count.saturating_sub(4)).collect();
    format!("••••{tail}")
}

fn active_secret(profile: &SharedProfile) -> String {
    if !profile.active_key_id.is_empty() {
        if let Some(key) = profile.keys.iter().find(|key| key.id == profile.active_key_id && !key.secret.is_empty()) {
            return key.secret.clone();
        }
    }
    profile.keys.iter().find(|key| !key.secret.is_empty()).map(|key| key.secret.clone()).unwrap_or_default()
}

fn ensure_models(profile: &mut SharedProfile) {
    if profile.models.is_empty() && !profile.model.trim().is_empty() {
        profile.models.push(ModelProfile::new(profile.model.trim()));
    }
    if profile.model.trim().is_empty() {
        profile.model = profile.models.iter().find(|model| !model.archived).map(|model| model.id.clone()).unwrap_or_default();
    } else if !profile.models.iter().any(|model| model.id == profile.model) {
        profile.models.push(ModelProfile::new(profile.model.clone()));
    }
}

fn ensure_key(profile: &mut SharedProfile, secret: Option<String>, clear: bool) {
    let now = now_ms();
    if clear {
        for key in &mut profile.keys {
            key.status = "retired".into();
        }
        profile.active_key_id.clear();
        return;
    }
    let Some(secret) = secret.map(|value| value.trim().to_string()).filter(|value| value.chars().count() >= 4) else {
        if profile.active_key_id.is_empty() {
            profile.active_key_id = profile.keys.iter().find(|key| !key.secret.is_empty()).map(|key| key.id.clone()).unwrap_or_default();
        }
        return;
    };
    let digest = keys::fingerprint(&secret);
    if let Some(existing) = profile.keys.iter().find(|key| key.fingerprint == digest) {
        profile.active_key_id = existing.id.clone();
        return;
    }
    let id = format!("spkey{}", crate::store::stamp());
    for key in &mut profile.keys {
        if key.status == "active" { key.status = "standby".into(); }
    }
    profile.keys.push(ApiKeyVersion {
        id: id.clone(),
        label: "Profile 金鑰".into(),
        secret,
        fingerprint: digest,
        created_at: now,
        status: "active".into(),
        ..ApiKeyVersion::default()
    });
    profile.active_key_id = id;
}

pub fn view(profile: &SharedProfile) -> SharedProfileView {
    let secret = active_secret(profile);
    let active_key_label = profile
        .keys
        .iter()
        .find(|key| key.id == profile.active_key_id)
        .map(|key| key.label.clone())
        .filter(|label| !label.is_empty())
        .unwrap_or_default();
    SharedProfileView {
        id: profile.id.clone(),
        name: profile.name.clone(),
        base_url: profile.base_url.clone(),
        kind: profile.kind.clone(),
        model: profile.model.clone(),
        models: profile.models.clone(),
        note: profile.note.clone(),
        tags: profile.tags.clone(),
        targets: profile.targets.clone(),
        key_count: profile.keys.len(),
        active_key_label,
        api_key_masked: mask_key(&secret),
        has_api_key: !secret.is_empty(),
        created_at: profile.created_at,
        updated_at: profile.updated_at,
    }
}

pub fn list() -> Vec<SharedProfileView> {
    let mut profiles = crate::store::load().shared_profiles;
    profiles.sort_by(|left, right| right.updated_at.cmp(&left.updated_at).then_with(|| left.name.cmp(&right.name)));
    profiles.iter().map(view).collect()
}

pub fn save(input: SharedProfileInput) -> Result<SharedProfileView, String> {
    let name = input.name.trim();
    let base_url = input.base_url.trim();
    if name.is_empty() { return Err("請填寫 Profile 名稱".into()); }
    if base_url.is_empty() { return Err("請填寫 Profile Base URL".into()); }
    let mut data = crate::store::load();
    let now = now_ms();
    let existing = if input.id.is_empty() { None } else {
        data.shared_profiles.iter().find(|profile| profile.id == input.id).cloned()
    };
    if !input.id.is_empty() && existing.is_none() {
        return Err("找不到這個共用 Profile".into());
    }
    let mut profile = existing.unwrap_or_else(|| SharedProfile {
        id: format!("sp{}", crate::store::stamp()),
        created_at: now,
        ..SharedProfile::default()
    });
    profile.name = name.to_string();
    profile.base_url = base_url.to_string();
    profile.kind = input.kind.trim().to_string();
    profile.model = input.model.trim().to_string();
    profile.models = input.models;
    profile.note = input.note.trim().to_string();
    profile.tags = input.tags.into_iter().map(|tag| tag.trim().to_string()).filter(|tag| !tag.is_empty()).collect();
    profile.tags.sort();
    profile.tags.dedup();
    profile.targets = input.targets.into_iter()
        .filter(|target| crate::adapters::find(&target.tool).is_some())
        .map(|mut target| {
            target.tool = target.tool.trim().to_string();
            target.model = target.model.trim().to_string();
            target.kind = target.kind.trim().to_string();
            target
        })
        .collect();
    profile.targets.sort_by(|left, right| left.tool.cmp(&right.tool));
    profile.targets.dedup_by(|left, right| left.tool == right.tool);
    profile.updated_at = now;
    ensure_models(&mut profile);
    ensure_key(&mut profile, Some(input.api_key), input.clear_api_key);

    if let Some(slot) = data.shared_profiles.iter_mut().find(|item| item.id == profile.id) {
        *slot = profile.clone();
    } else {
        data.shared_profiles.push(profile.clone());
    }
    crate::store::save(&data)?;
    Ok(view(&profile))
}

pub fn remove(id: &str) -> Result<(), String> {
    let mut data = crate::store::load();
    let before = data.shared_profiles.len();
    data.shared_profiles.retain(|profile| profile.id != id);
    if before == data.shared_profiles.len() {
        return Err("找不到這個共用 Profile".into());
    }
    crate::store::save(&data)
}

pub fn import_provider(tool: &str, provider_id: &str) -> Result<SharedProfileView, String> {
    let provider = crate::store::list(tool)
        .into_iter()
        .find(|provider| provider.id == provider_id)
        .ok_or_else(|| "找不到這個供應商".to_string())?;
    let mut data = crate::store::load();
    let now = now_ms();
    let active_key_id = keys::active_id(&provider);
    let mut profile = SharedProfile {
        id: format!("sp{}", crate::store::stamp()),
        name: provider.name.clone(),
        base_url: provider.base_url.clone(),
        kind: provider.kind.clone(),
        model: provider.model.clone(),
        models: provider.models.clone(),
        note: provider.note.clone(),
        tags: vec!["imported".into()],
        keys: provider.api_keys.clone(),
        active_key_id,
        targets: vec![SharedProfileTarget {
            tool: tool.into(),
            provider_id: provider.id.clone(),
            model: provider.model.clone(),
            kind: provider.kind.clone(),
            enabled: true,
            last_synced_at: now,
        }],
        created_at: now,
        updated_at: now,
    };
    ensure_models(&mut profile);
    if profile.keys.is_empty() && !provider.api_key.is_empty() {
        ensure_key(&mut profile, Some(provider.api_key.clone()), false);
    }
    if let Some(slot) = data.shared_profiles.iter_mut().find(|item| item.name.eq_ignore_ascii_case(&profile.name) && item.base_url == profile.base_url) {
        *slot = profile.clone();
    } else {
        data.shared_profiles.push(profile.clone());
    }
    crate::store::save(&data)?;
    Ok(view(&profile))
}

pub fn sync(profile_id: &str, requested_tools: &[String]) -> Result<ProfileSyncResult, String> {
    let mut data = crate::store::load();
    let profile = data
        .shared_profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .cloned()
        .ok_or_else(|| "找不到這個共用 Profile".to_string())?;
    let key = active_secret(&profile);
    if key.is_empty() {
        return Err("這個 Profile 沒有可用的 API Key".into());
    }
    let requested: std::collections::BTreeSet<&str> = requested_tools.iter().map(String::as_str).collect();
    let mut results = Vec::new();
    let mut skipped = Vec::new();
    for mut target in profile.targets.clone() {
        if !target.enabled || (!requested.is_empty() && !requested.contains(target.tool.as_str())) {
            continue;
        }
        let Some(spec) = crate::adapters::find(&target.tool) else {
            skipped.push(format!("{}: 未知 Harness", target.tool));
            continue;
        };
        let model = if target.model.is_empty() { profile.model.clone() } else { target.model.clone() };
        let kind = if target.kind.is_empty() { profile.kind.clone() } else { target.kind.clone() };
        let entries = data.providers.entry(target.tool.clone()).or_default();
        let found_index = entries.iter().position(|provider| {
            (!target.provider_id.is_empty() && provider.id == target.provider_id) || provider.profile_id == profile.id
        });
        let created = found_index.is_none();
        let index = match found_index {
            Some(index) => index,
            None => {
                entries.push(Provider {
                    id: format!("p{}", now_ms()),
                    config_id: crate::store::make_config_id(&target.tool, &profile.name),
                    name: profile.name.clone(),
                    base_url: profile.base_url.clone(),
                    api_key: key.clone(),
                    api_key_enc: String::new(),
                    model: model.clone(),
                    models: profile.models.clone(),
                    kind: kind.clone(),
                    note: profile.note.clone(),
                    profile_id: profile.id.clone(),
                    api_keys: profile.keys.clone(),
                    ..Provider::default()
                });
                entries.len() - 1
            }
        };
        let provider = &mut entries[index];
        if provider.config_id.is_empty() {
            provider.config_id = crate::store::make_config_id(&target.tool, &profile.name);
        }
        if provider.name.trim().is_empty() { provider.name = profile.name.clone(); }
        provider.base_url = profile.base_url.clone();
        provider.api_key = key.clone();
        provider.model = model.clone();
        provider.models = profile.models.clone();
        provider.kind = if kind.is_empty() { spec.kind_choices.first().copied().unwrap_or("").to_string() } else { kind };
        provider.profile_id = profile.id.clone();
        provider.api_keys = profile.keys.clone();
        provider.note = if provider.note.trim().is_empty() { profile.note.clone() } else { provider.note.clone() };
        crate::adapters::normalize_provider_models(provider);
        target.provider_id = provider.id.clone();
        target.last_synced_at = now_ms();
        results.push(ProfileSyncItem {
            tool: target.tool.clone(),
            provider_id: provider.id.clone(),
            provider_name: provider.name.clone(),
            model: provider.model.clone(),
            created,
        });
    }
    if let Some(saved) = data.shared_profiles.iter_mut().find(|item| item.id == profile_id) {
        for target in &mut saved.targets {
            if let Some(result) = results.iter().find(|result| result.tool == target.tool) {
                target.provider_id = result.provider_id.clone();
                target.last_synced_at = now_ms();
            }
        }
        saved.updated_at = now_ms();
    }
    crate::store::save(&data)?;
    Ok(ProfileSyncResult { profile_id: profile_id.into(), synced: results, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_view_never_exposes_the_key() {
        let mut profile = SharedProfile { name: "Demo".into(), ..SharedProfile::default() };
        ensure_key(&mut profile, Some("sk-profile-secret-9876".into()), false);
        let value = serde_json::to_string(&view(&profile)).unwrap();
        assert!(!value.contains("sk-profile-secret-9876"));
        assert!(value.contains("9876"));
    }
}

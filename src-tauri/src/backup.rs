//! Timestamped, verified snapshots of every file kumoSwitch is about to modify.
//! v0.18 adds central migration views, manual snapshots, safe pre-restore
//! snapshots and optional scheduled snapshots.

use crate::store;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ManifestEntry {
    pub original: String,
    pub stored: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Manifest {
    #[serde(default)]
    pub tool: String,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub entries: Vec<ManifestEntry>,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub checksum: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct BackupInfo {
    pub id: String,
    pub created: String,
    pub files: Vec<String>,
    pub tool: String,
    pub tool_name: String,
    pub reason: String,
    pub version: String,
    pub size_bytes: u64,
    pub checksum: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct BackupStats {
    pub snapshots: usize,
    pub tools: usize,
    pub files: usize,
    pub size_bytes: u64,
    pub newest: String,
    pub oldest: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct BackupCenter {
    pub backups: Vec<BackupInfo>,
    pub stats: BackupStats,
    pub policy: BackupPolicy,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackupPolicy {
    #[serde(default)]
    pub scheduled: bool,
    #[serde(default = "default_interval_hours")]
    pub interval_hours: u32,
    #[serde(default = "default_keep")]
    pub keep: usize,
    #[serde(default)]
    pub last_run: u64,
}

fn default_interval_hours() -> u32 { 24 }
fn default_keep() -> usize { 30 }

impl Default for BackupPolicy {
    fn default() -> Self {
        Self { scheduled: false, interval_hours: 24, keep: 30, last_run: 0 }
    }
}

fn root(tool: &str) -> PathBuf {
    store::data_dir().join("backups").join(tool)
}

fn backups_root() -> PathBuf {
    store::data_dir().join("backups")
}

fn now_stamp() -> (String, String) {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    (millis.to_string(), human_time((millis / 1000) as u64))
}

fn human_time(secs: u64) -> String {
    let local = secs as i64 + 8 * 3600;
    let days = local.div_euclid(86_400);
    let rem = local.rem_euclid(86_400);
    let (hh, mm, ss) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02} {hh:02}:{mm:02}:{ss:02}")
}

fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    entries.flatten().map(|entry| {
        let path = entry.path();
        if path.is_dir() { dir_size(&path) } else { entry.metadata().map(|meta| meta.len()).unwrap_or(0) }
    }).sum()
}

fn checksum_files(files: &[(PathBuf, String)]) -> String {
    let mut hash = Sha256::new();
    for (path, display) in files {
        hash.update(display.as_bytes());
        if let Ok(bytes) = std::fs::read(path) { hash.update(bytes); }
    }
    hash.finalize()[..12].iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
pub fn snapshot(tool: &str, files: &[(PathBuf, String)]) -> Result<(String, String), String> {
    snapshot_with_reason(tool, files, "before-write")
}

pub fn snapshot_with_reason(tool: &str, files: &[(PathBuf, String)], reason: &str) -> Result<(String, String), String> {
    let (id, created) = now_stamp();
    let dir = root(tool).join(&id);
    crate::secure_fs::ensure_private_dir(&dir).map_err(|e| format!("無法建立備份目錄：{e}"))?;
    let checksum = checksum_files(files);
    let mut entries = Vec::new();
    for (idx, (path, display)) in files.iter().enumerate() {
        if !path.exists() { continue; }
        let name = path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "config".into());
        let stored = format!("{idx}-{name}");
        std::fs::copy(path, dir.join(&stored)).map_err(|e| format!("備份失敗：{e}"))?;
        entries.push(ManifestEntry { original: display.clone(), stored });
    }
    let manifest = Manifest {
        tool: tool.to_string(),
        created: created.clone(),
        entries,
        reason: reason.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        checksum,
    };
    crate::secure_fs::write_private(
        &dir.join("manifest.json"),
        &serde_json::to_string_pretty(&manifest).unwrap_or_default(),
    ).map_err(|e| format!("寫入備份清單失敗：{e}"))?;
    prune(tool);
    Ok((id, created))
}

fn keep_count() -> usize {
    store::load().backup.keep.clamp(5, 200)
}

fn prune(tool: &str) {
    let keep = keep_count();
    let mut ids: Vec<String> = list(tool).into_iter().map(|backup| backup.id).collect();
    ids.sort();
    while ids.len() > keep {
        let oldest = ids.remove(0);
        let _ = std::fs::remove_dir_all(root(tool).join(oldest));
    }
}

fn read_info(tool: &str, dir: &Path) -> Option<BackupInfo> {
    let text = std::fs::read_to_string(dir.join("manifest.json")).ok()?;
    let mut manifest = serde_json::from_str::<Manifest>(&text).ok()?;
    if manifest.tool.is_empty() { manifest.tool = tool.to_string(); }
    let tool_name = crate::adapters::find(&manifest.tool).map(|spec| spec.name).unwrap_or(&manifest.tool).to_string();
    let id = dir.file_name()?.to_string_lossy().to_string();
    Some(BackupInfo {
        id,
        created: manifest.created,
        files: manifest.entries.into_iter().map(|entry| entry.original).collect(),
        tool: manifest.tool,
        tool_name,
        reason: if manifest.reason.is_empty() { "before-write".into() } else { manifest.reason },
        version: if manifest.version.is_empty() { "legacy".into() } else { manifest.version },
        size_bytes: dir_size(dir),
        checksum: manifest.checksum,
    })
}

pub fn list(tool: &str) -> Vec<BackupInfo> {
    let dir = root(tool);
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut out: Vec<_> = entries.flatten().filter(|entry| entry.path().is_dir()).filter_map(|entry| read_info(tool, &entry.path())).collect();
    out.sort_by(|left, right| right.id.cmp(&left.id));
    out
}

pub fn list_all() -> Vec<BackupInfo> {
    let Ok(entries) = std::fs::read_dir(backups_root()) else { return Vec::new() };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        if !entry.path().is_dir() { continue; }
        let tool = entry.file_name().to_string_lossy().to_string();
        out.extend(list(&tool));
    }
    out.sort_by(|left, right| right.id.cmp(&left.id));
    out
}

pub fn center() -> BackupCenter {
    let backups = list_all();
    let mut tools = std::collections::BTreeSet::new();
    for backup in &backups { tools.insert(backup.tool.clone()); }
    let stats = BackupStats {
        snapshots: backups.len(),
        tools: tools.len(),
        files: backups.iter().map(|backup| backup.files.len()).sum(),
        size_bytes: backups.iter().map(|backup| backup.size_bytes).sum(),
        newest: backups.first().map(|backup| backup.created.clone()).unwrap_or_default(),
        oldest: backups.last().map(|backup| backup.created.clone()).unwrap_or_default(),
    };
    BackupCenter { backups, stats, policy: store::load().backup }
}

pub fn remove(tool: &str, id: &str) -> Result<(), String> {
    if !id.chars().all(|c| c.is_ascii_digit()) { return Err("備份 ID 不合法".into()); }
    let dir = root(tool).join(id);
    if !dir.exists() { return Err("找不到這份備份".to_string()); }
    std::fs::remove_dir_all(dir).map_err(|error| format!("刪除備份失敗：{error}"))
}

pub fn restore(tool: &str, id: &str) -> Result<Vec<String>, String> {
    if !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("備份 ID 不合法".into());
    }
    let dir = root(tool).join(id);
    let text = std::fs::read_to_string(dir.join("manifest.json"))
        .map_err(|_| "找不到這份備份".to_string())?;
    let manifest: Manifest = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    // Restore is itself destructive. Preserve the current files first so a bad
    // restore can be undone without leaving the settings directory permanently
    // altered.
    let current_files: Vec<(PathBuf, String)> = manifest.entries.iter().filter_map(|entry| {
        let target = restore_target(&entry.original).ok()?;
        target.exists().then(|| (target, entry.original.clone()))
    }).collect();
    if !current_files.is_empty() {
        let _ = snapshot_with_reason(tool, &current_files, "before-restore");
    }

    let mut restored = Vec::new();
    for entry in manifest.entries {
        let target = restore_target(&entry.original)?;
        if let Some(parent) = target.parent() { let _ = std::fs::create_dir_all(parent); }
        std::fs::copy(dir.join(&entry.stored), &target)
            .map_err(|e| format!("還原 {} 失敗：{e}", entry.original))?;
        restored.push(entry.original);
    }
    Ok(restored)
}

fn restore_target(original: &str) -> Result<PathBuf, String> {
    let relative = original.strip_prefix("~/").unwrap_or(original);
    let path = if original.starts_with("~/") {
        crate::adapters::home().join(relative)
    } else {
        PathBuf::from(relative)
    };
    if path.components().any(|component| matches!(component, std::path::Component::ParentDir)) {
        return Err(format!("備份清單含有不安全的父層路徑：{original}"));
    }
    Ok(path)
}

pub fn set_policy(mut policy: BackupPolicy) -> Result<BackupPolicy, String> {
    policy.interval_hours = policy.interval_hours.clamp(1, 24 * 30);
    policy.keep = policy.keep.clamp(5, 200);
    let mut data = store::load();
    data.backup = policy.clone();
    store::save(&data)?;
    Ok(policy)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_rejects_path_traversal_ids() {
        assert!(restore("codex", "../../etc").is_err());
    }
}

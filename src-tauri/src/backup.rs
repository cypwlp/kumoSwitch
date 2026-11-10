use crate::store;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ManifestEntry {
    pub original: String,
    pub stored: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Manifest {
    pub tool: String,
    pub created: String,
    pub entries: Vec<ManifestEntry>,
}

#[derive(Serialize, Clone, Debug)]
pub struct BackupInfo {
    pub id: String,
    pub created: String,
    pub files: Vec<String>,
}

fn root(tool: &str) -> PathBuf {
    store::data_dir().join("backups").join(tool)
}

fn now_stamp() -> (String, String) {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    (format!("{secs}"), human_time(secs))
}

fn human_time(secs: u64) -> String {
    // Civil-from-days conversion (Howard Hinnant), local time left as UTC+8.
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

/// Copy the files we are about to modify into a snapshot directory.
pub fn snapshot(tool: &str, files: &[(PathBuf, String)]) -> Result<(String, String), String> {
    let (id, created) = now_stamp();
    let dir = root(tool).join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("無法建立備份目錄：{e}"))?;
    let mut entries = Vec::new();
    for (idx, (path, display)) in files.iter().enumerate() {
        if !path.exists() {
            continue;
        }
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "config".into());
        let stored = format!("{idx}-{name}");
        std::fs::copy(path, dir.join(&stored)).map_err(|e| format!("備份失敗：{e}"))?;
        entries.push(ManifestEntry { original: display.clone(), stored });
    }
    let manifest = Manifest { tool: tool.to_string(), created: created.clone(), entries };
    std::fs::write(
        dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).unwrap_or_default(),
    )
    .map_err(|e| format!("寫入備份清單失敗：{e}"))?;
    Ok((id, created))
}

pub fn list(tool: &str) -> Vec<BackupInfo> {
    let mut out = Vec::new();
    let dir = root(tool);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path().join("manifest.json");
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<Manifest>(&text) else {
            continue;
        };
        out.push(BackupInfo {
            id: entry.file_name().to_string_lossy().to_string(),
            created: manifest.created,
            files: manifest.entries.into_iter().map(|e| e.original).collect(),
        });
    }
    out.sort_by(|a, b| b.id.cmp(&a.id));
    out
}

pub fn restore(tool: &str, id: &str) -> Result<Vec<String>, String> {
    if !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("備份 ID 不合法".into());
    }
    let dir = root(tool).join(id);
    let text = std::fs::read_to_string(dir.join("manifest.json"))
        .map_err(|_| "找不到這份備份".to_string())?;
    let manifest: Manifest = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let mut restored = Vec::new();
    for entry in manifest.entries {
        let target = crate::adapters::home().join(entry.original.trim_start_matches("~/"));
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::copy(dir.join(&entry.stored), &target)
            .map_err(|e| format!("還原 {} 失敗：{e}", entry.original))?;
        restored.push(entry.original);
    }
    Ok(restored)
}

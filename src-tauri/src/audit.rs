use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuditEntry {
    pub ts: u64,
    pub action: String,
    pub detail: String,
    pub version: String,
}

static LOCK: Mutex<()> = Mutex::new(());

fn path() -> std::path::PathBuf {
    crate::store::data_dir().join("audit.jsonl")
}

pub fn record(action: impl Into<String>, detail: impl Into<String>) {
    let _guard = LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let entry = AuditEntry {
        ts: crate::store::stamp() as u64,
        action: action.into(),
        detail: detail.into(),
        version: env!("CARGO_PKG_VERSION").into(),
    };
    let Ok(line) = serde_json::to_string(&entry) else { return };
    let mut lines: Vec<String> = std::fs::read_to_string(path())
        .unwrap_or_default()
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(str::to_string)
        .collect();
    lines.push(line);
    if lines.len() > 1000 {
        lines.drain(0..lines.len() - 1000);
    }
    let mut text = lines.join("\n");
    text.push('\n');
    let _ = crate::secure_fs::write_private(&path(), &text);
}

pub fn tail(limit: usize) -> Vec<AuditEntry> {
    let _guard = LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut entries: Vec<AuditEntry> = std::fs::read_to_string(path())
        .unwrap_or_default()
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();
    if entries.len() > limit {
        entries.drain(0..entries.len() - limit);
    }
    entries.reverse();
    entries
}

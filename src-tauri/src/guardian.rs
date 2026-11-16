//! Settings Guardian 2.0. A lightweight, local poller fingerprints every managed
//! Harness file, classifies drift, records an attributable timeline and exposes
//! safe auto-repair candidates. No config content is uploaded and secret values
//! never enter the timeline.

use crate::adapters;
use crate::store::Store;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, VecDeque};
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GuardianPolicy {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// Opt-in repair of a drifted managed provider after two consecutive scans.
    #[serde(default)]
    pub auto_repair: bool,
    #[serde(default = "default_notify")]
    pub notify: bool,
    #[serde(default = "default_poll_secs")]
    pub poll_secs: u64,
    #[serde(default = "default_retention")]
    pub retention: usize,
}

fn default_enabled() -> bool { true }
fn default_notify() -> bool { true }
fn default_poll_secs() -> u64 { 5 }
fn default_retention() -> usize { 200 }

impl Default for GuardianPolicy {
    fn default() -> Self {
        Self { enabled: true, auto_repair: false, notify: true, poll_secs: 5, retention: 200 }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GuardianFile {
    pub file: String,
    pub path: String,
    pub exists: bool,
    pub modified_at: u64,
    pub fingerprint: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GuardianToolStatus {
    pub tool: String,
    pub tool_name: String,
    pub status: String,
    pub active_id: Option<String>,
    pub expected_name: Option<String>,
    pub current_base_url: String,
    pub current_model: String,
    pub current_key_tail: String,
    pub expected_base_url: String,
    pub expected_model: String,
    pub changed_fields: Vec<String>,
    pub unmanaged_providers: Vec<String>,
    pub message: String,
    pub actor: String,
    pub files: Vec<GuardianFile>,
    pub drift_signature: String,
    pub last_checked: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GuardianEvent {
    pub id: String,
    pub ts: u64,
    pub tool: String,
    pub tool_name: String,
    pub kind: String,
    pub status: String,
    pub severity: String,
    pub actor: String,
    pub changed_fields: Vec<String>,
    pub message: String,
    pub current_base_url: String,
    pub current_model: String,
    pub expected_name: Option<String>,
    pub file_modified_at: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct GuardianSummary {
    pub clean: usize,
    pub drifted: usize,
    pub unmanaged: usize,
    pub empty: usize,
    pub error: usize,
    pub watched_tools: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct GuardianOverview {
    pub policy: GuardianPolicy,
    pub watching: bool,
    pub last_scan: u64,
    pub last_self_write: u64,
    pub summary: GuardianSummary,
    pub statuses: Vec<GuardianToolStatus>,
    pub events: Vec<GuardianEvent>,
}

#[derive(Clone, Debug, Serialize)]
pub struct GuardianTransition {
    pub tool: String,
    pub status: String,
    pub expected_id: Option<String>,
    pub event: GuardianEvent,
}

struct Runtime {
    initialized: bool,
    statuses: BTreeMap<String, GuardianToolStatus>,
    events: VecDeque<GuardianEvent>,
    last_scan: u64,
    last_self_write: u64,
}

impl Runtime {
    fn new() -> Self {
        Self { initialized: false, statuses: BTreeMap::new(), events: VecDeque::new(), last_scan: 0, last_self_write: 0 }
    }
}

fn runtime() -> &'static Mutex<Runtime> {
    static RUNTIME: OnceLock<Mutex<Runtime>> = OnceLock::new();
    RUNTIME.get_or_init(|| Mutex::new(Runtime::new()))
}

fn now_ms() -> u64 { crate::store::stamp() as u64 }

fn event_path() -> std::path::PathBuf { crate::store::data_dir().join("guardian-events.json") }

fn load_events() -> VecDeque<GuardianEvent> {
    std::fs::read_to_string(event_path())
        .ok()
        .and_then(|text| serde_json::from_str::<Vec<GuardianEvent>>(&text).ok())
        .map(VecDeque::from)
        .unwrap_or_default()
}

fn save_events(events: &VecDeque<GuardianEvent>, retention: usize) -> Result<(), String> {
    let keep = retention.clamp(20, 1000);
    let tail: Vec<_> = events.iter().rev().take(keep).rev().cloned().collect();
    let text = serde_json::to_string_pretty(&tail).map_err(|error| error.to_string())?;
    crate::secure_fs::write_private(&event_path(), &text).map_err(|error| format!("無法寫入守護中心時間線：{error}"))
}

fn mask_key(key: &str) -> String {
    let count = key.chars().count();
    if count == 0 { return String::new(); }
    let tail: String = key.chars().skip(count.saturating_sub(4)).collect();
    format!("••••{tail}")
}

fn same_endpoint(left: &str, right: &str) -> bool {
    !left.is_empty() && left.trim_end_matches('/') == right.trim_end_matches('/')
}

fn unique_files(spec: &adapters::ToolSpec) -> Vec<String> {
    let mut files = Vec::new();
    for step in spec.steps {
        if !files.iter().any(|file| file == step.file) {
            files.push(step.file.to_string());
        }
    }
    if files.is_empty() { files.push(spec.default_file.to_string()); }
    files
}

fn modified_ms(path: &std::path::Path) -> u64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn files_for(spec: &adapters::ToolSpec) -> Vec<GuardianFile> {
    unique_files(spec).into_iter().map(|file| {
        let path = adapters::resolve_file(spec, &file);
        let bytes = std::fs::read(&path).ok();
        let exists = bytes.is_some();
        let fingerprint = bytes.map(|bytes| {
            let digest = Sha256::digest(&bytes);
            digest[..12].iter().map(|byte| format!("{byte:02x}")).collect::<String>()
        }).unwrap_or_default();
        GuardianFile {
            file,
            path: adapters::display_path(&path),
            exists,
            modified_at: modified_ms(&path),
            fingerprint,
        }
    }).collect()
}

fn actor(rt: &Runtime) -> String {
    if rt.last_self_write > 0 && now_ms().saturating_sub(rt.last_self_write) < 15_000 {
        "kumoSwitch".into()
    } else {
        "external".into()
    }
}

fn scan(data: &Store) -> Vec<GuardianToolStatus> {
    let now = now_ms();
    adapters::TOOLS.iter().map(|spec| {
        let providers = data.providers.get(spec.id).cloned().unwrap_or_default();
        let current = adapters::read_current(spec);
        let matched = providers.iter().find(|provider| {
            same_endpoint(&provider.base_url, &current.base_url)
                && (provider.model.is_empty() || current.model.is_empty() || provider.model == current.model)
        });
        let endpoint_match = providers.iter().find(|provider| same_endpoint(&provider.base_url, &current.base_url));
        let expected = data.active.get(spec.id)
            .and_then(|id| providers.iter().find(|provider| &provider.id == id))
            .or_else(|| endpoint_match)
            .or(matched);
        let discovered = adapters::discover(spec);
        let unmanaged_providers = discovered.iter()
            .filter(|provider| !providers.iter().any(|known| known.config_id == provider.config_id))
            .map(|provider| provider.config_id.clone())
            .collect::<Vec<_>>();
        let mut changed_fields = Vec::new();
        if let Some(expected) = expected {
            if !current.base_url.is_empty() && !same_endpoint(&expected.base_url, &current.base_url) {
                changed_fields.push("Base URL".into());
            }
            if !current.model.is_empty() && !expected.model.is_empty() && current.model != expected.model {
                changed_fields.push("模型".into());
            }
            let expected_tail = mask_key(&expected.api_key);
            if !current.api_key_tail.is_empty() && !expected_tail.is_empty() && current.api_key_tail != expected_tail {
                changed_fields.push("API Key".into());
            }
        }
        if endpoint_match.is_none() && !current.base_url.is_empty() { changed_fields.push("供應商".into()); }
        if !unmanaged_providers.is_empty() { changed_fields.push("未納管供應商".into()); }
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
        let files = files_for(spec);
        let file_mtime = files.iter().map(|file| file.modified_at).max().unwrap_or(0);
        let drift_signature = format!(
            "{}|{}|{}|{}|{}|{}|{}",
            status,
            current.base_url,
            current.model,
            current.api_key_tail,
            changed_fields.join(","),
            unmanaged_providers.join(","),
            file_mtime
        );
        GuardianToolStatus {
            tool: spec.id.to_string(),
            tool_name: spec.name.to_string(),
            status: status.to_string(),
            active_id: matched.map(|provider| provider.id.clone()).or_else(|| data.active.get(spec.id).cloned()),
            expected_name: expected.map(|provider| provider.name.clone()),
            current_base_url: current.base_url,
            current_model: current.model,
            current_key_tail: current.api_key_tail,
            expected_base_url: expected.map(|provider| provider.base_url.clone()).unwrap_or_default(),
            expected_model: expected.map(|provider| provider.model.clone()).unwrap_or_default(),
            changed_fields,
            unmanaged_providers,
            message: message.to_string(),
            actor: "unknown".into(),
            files,
            drift_signature,
            last_checked: now,
        }
    }).collect()
}

fn make_event(rt: &Runtime, current: &GuardianToolStatus, kind: &str, severity: &str, message: &str, _retention: usize) -> GuardianEvent {
    let sequence = rt.events.len() as u64 + 1;
    GuardianEvent {
        id: format!("guardian-{}-{sequence}", now_ms()),
        ts: now_ms(),
        tool: current.tool.clone(),
        tool_name: current.tool_name.clone(),
        kind: kind.into(),
        status: current.status.clone(),
        severity: severity.into(),
        actor: actor(rt),
        changed_fields: current.changed_fields.clone(),
        message: message.into(),
        current_base_url: current.current_base_url.clone(),
        current_model: current.current_model.clone(),
        expected_name: current.expected_name.clone(),
        file_modified_at: current.files.iter().map(|file| file.modified_at).max().unwrap_or(0),
    }
}

pub fn observe(data: &Store) -> Vec<GuardianTransition> {
    let mut rt = runtime().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if !rt.initialized {
        rt.events = load_events();
        rt.initialized = true;
    }
    let previous = rt.statuses.clone();
    let mut statuses = scan(data);
    let current_actor = actor(&rt);
    for status in &mut statuses { status.actor = current_actor.clone(); }
    let mut transitions = Vec::new();
    for current in &statuses {
        let Some(previous_status) = previous.get(&current.tool) else { continue };
        let status_changed = previous_status.status != current.status;
        let drift_changed = matches!(current.status.as_str(), "drifted" | "unmanaged")
            && previous_status.drift_signature != current.drift_signature;
        if !status_changed && !drift_changed { continue; }
        let (kind, severity, message) = match (previous_status.status.as_str(), current.status.as_str()) {
            (_, "drifted") => ("drift", "warning", format!("偵測到外部設定偏離：{}", current.message)),
            (_, "unmanaged") => ("unmanaged", "error", format!("偵測到未納管設定：{}", current.message)),
            ("drifted" | "unmanaged", "clean") => ("resolved", "success", "設定已恢復，且與 kumoSwitch 紀錄一致".into()),
            ("clean", "empty") => ("cleared", "info", "目前供應商設定已被移除".into()),
            _ => ("changed", "info", format!("設定狀態變更為 {}", current.status)),
        };
        let event = make_event(&rt, current, kind, severity, &message, data.guardian.retention);
        rt.events.push_back(event.clone());
        transitions.push(GuardianTransition {
            tool: current.tool.clone(),
            status: current.status.clone(),
            expected_id: if current.status == "drifted" {
                current.active_id.clone().or_else(|| data.active.get(&current.tool).cloned())
            } else { None },
            event,
        });
    }
    rt.statuses = statuses.into_iter().map(|status| (status.tool.clone(), status)).collect();
    rt.last_scan = now_ms();
    let _ = save_events(&rt.events, data.guardian.retention);
    transitions
}

pub fn overview() -> GuardianOverview {
    let data = crate::store::load();
    let mut rt = runtime().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if !rt.initialized {
        rt.events = load_events();
        rt.initialized = true;
    }
    if rt.last_scan == 0 {
        drop(rt);
        observe(&data);
        rt = runtime().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    }
    let mut statuses: Vec<_> = rt.statuses.values().cloned().collect();
    statuses.sort_by_key(|status| match status.status.as_str() {
        "unmanaged" => 0,
        "drifted" => 1,
        "error" => 2,
        "empty" => 3,
        "clean" => 4,
        _ => 5,
    });
    let summary = GuardianSummary {
        clean: statuses.iter().filter(|status| status.status == "clean").count(),
        drifted: statuses.iter().filter(|status| status.status == "drifted").count(),
        unmanaged: statuses.iter().filter(|status| status.status == "unmanaged").count(),
        empty: statuses.iter().filter(|status| status.status == "empty").count(),
        error: statuses.iter().filter(|status| status.status == "error").count(),
        watched_tools: statuses.len(),
    };
    let watching = data.guardian.enabled;
    GuardianOverview {
        policy: data.guardian,
        watching,
        last_scan: rt.last_scan,
        last_self_write: rt.last_self_write,
        summary,
        statuses,
        events: rt.events.iter().rev().cloned().collect(),
    }
}

pub fn mark_self_write() {
    let mut rt = runtime().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    rt.last_self_write = now_ms();
}

pub fn record_repair(tool: &str, provider_id: &str, ok: bool, detail: &str) {
    let data = crate::store::load();
    let mut rt = runtime().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if !rt.initialized { rt.events = load_events(); rt.initialized = true; }
    let status = rt.statuses.get(tool).cloned();
    let synthetic = status.unwrap_or_else(|| GuardianToolStatus {
        tool: tool.into(),
        tool_name: tool.into(),
        status: "unknown".into(),
        active_id: None,
        expected_name: None,
        current_base_url: String::new(),
        current_model: String::new(),
        current_key_tail: String::new(),
        expected_base_url: String::new(),
        expected_model: String::new(),
        changed_fields: Vec::new(),
        unmanaged_providers: Vec::new(),
        message: String::new(),
        actor: "kumoSwitch".into(),
        files: Vec::new(),
        drift_signature: String::new(),
        last_checked: now_ms(),
    });
    rt.last_self_write = now_ms();
    let event = make_event(
        &rt,
        &synthetic,
        if ok { "auto_repair" } else { "auto_repair_failed" },
        if ok { "success" } else { "error" },
        &format!("{}（{}）", detail, provider_id),
        data.guardian.retention,
    );
    rt.events.push_back(event);
    let _ = save_events(&rt.events, data.guardian.retention);
}

pub fn set_policy(policy: GuardianPolicy) -> Result<GuardianPolicy, String> {
    let mut policy = policy;
    policy.poll_secs = policy.poll_secs.clamp(2, 60);
    policy.retention = policy.retention.clamp(20, 1000);
    let mut data = crate::store::load();
    data.guardian = policy.clone();
    crate::store::save(&data)?;
    Ok(policy)
}

pub fn clear_events() -> Result<(), String> {
    let mut rt = runtime().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    rt.events.clear();
    save_events(&rt.events, 20)
}

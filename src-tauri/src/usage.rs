//! Usage statistics read from the CLI tools' own local session logs.
//!
//! Claude Code writes `message.usage` per assistant turn; Codex writes
//! `token_usage_record` events. We aggregate both into per-model and per-day
//! totals and attach a rough cost estimate from a public price table.

use serde::Serialize;
use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[derive(Serialize, Clone, Debug, Default)]
pub struct UsageRow {
    pub source: String,
    pub model: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub records: u64,
    pub cost: Option<f64>,
}

#[derive(Serialize, Clone, Debug)]
pub struct DayRow {
    pub day: String,
    pub input: u64,
    pub output: u64,
    pub total: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct UsageRoot {
    pub source: String,
    pub path: String,
    pub exists: bool,
    pub files: usize,
    pub scanned_files: usize,
}

#[derive(Serialize, Clone, Debug)]
pub struct UsageReport {
    pub rows: Vec<UsageRow>,
    pub days: Vec<DayRow>,
    pub files: usize,
    pub records: usize,
    pub total_input: u64,
    pub total_output: u64,
    pub total_cache: u64,
    pub total_cost: Option<f64>,
    pub days_scanned: u32,
    pub roots: Vec<UsageRoot>,
    pub skipped_files: usize,
    pub errors: Vec<String>,
    pub elapsed_ms: u64,
}

/// USD per million tokens: (input, output, cache_read). Estimates, not quotes.
const PRICES: &[(&str, f64, f64, f64)] = &[
    ("deepseek", 0.28, 0.42, 0.028),
    ("glm", 0.6, 2.2, 0.11),
    ("qwen", 0.4, 1.2, 0.08),
    ("kimi", 0.6, 2.5, 0.1),
    ("moonshot", 0.6, 2.5, 0.1),
    ("minimax", 0.3, 1.2, 0.03),
    ("claude-sonnet", 3.0, 15.0, 0.3),
    ("claude-opus", 15.0, 75.0, 1.5),
    ("claude-haiku", 0.8, 4.0, 0.08),
    ("gpt-5", 1.25, 10.0, 0.125),
    ("gpt-4", 2.5, 10.0, 0.25),
    ("grok", 2.0, 10.0, 0.2),
    ("gemini", 1.25, 10.0, 0.125),
];

fn price_for(model: &str) -> Option<(f64, f64, f64)> {
    let lower = model.to_lowercase();
    PRICES
        .iter()
        .find(|(key, ..)| lower.contains(key))
        .map(|(_, i, o, c)| (*i, *o, *c))
}

fn num(value: &serde_json::Value, key: &str) -> u64 {
    value.get(key).and_then(|v| v.as_u64()).unwrap_or(0)
}

fn day_of(ts: &str) -> String {
    ts.chars().take(10).collect()
}

#[derive(Default)]
struct Acc {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
    records: u64,
}

impl Acc {
    fn add(&mut self, i: u64, o: u64, cr: u64, cw: u64) {
        self.input += i;
        self.output += o;
        self.cache_read += cr;
        self.cache_write += cw;
        self.records += 1;
    }
}

fn line_has_candidate(source: &str, line: &str) -> bool {
    if source == "codex" {
        line.contains("token_usage_record") && line.contains("\"usage\"")
    } else {
        line.contains("\"usage\"")
    }
}

fn scan_file(
    path: &Path,
    source: &str,
    cutoff: &str,
    models: &mut BTreeMap<(String, String), Acc>,
    days: &mut BTreeMap<String, (u64, u64)>,
    records: &mut usize,
) -> Result<(), String> {
    let file = File::open(path).map_err(|error| format!("{}：{error}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    loop {
        line.clear();
        let read = reader
            .read_line(&mut line)
            .map_err(|error| format!("{}：{error}", path.display()))?;
        if read == 0 {
            break;
        }
        if !line_has_candidate(source, &line) {
            continue;
        }
        let Ok(d) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let (usage, model, ts) = if source == "codex" {
            if d.get("type").and_then(|t| t.as_str()) != Some("token_usage_record") {
                continue;
            }
            let payload = d.get("payload").cloned().unwrap_or_default();
            let usage = payload.get("usage").cloned().unwrap_or_default();
            let model = payload
                .get("model")
                .and_then(|m| m.as_str())
                .unwrap_or("codex-session")
                .to_string();
            let ts = d.get("timestamp").and_then(|t| t.as_str()).unwrap_or("").to_string();
            (usage, model, ts)
        } else {
            let message = d.get("message").cloned().unwrap_or_default();
            let Some(usage) = message.get("usage").cloned() else {
                continue;
            };
            let model = message
                .get("model")
                .and_then(|m| m.as_str())
                .unwrap_or("unknown")
                .to_string();
            let ts = d.get("timestamp").and_then(|t| t.as_str()).unwrap_or("").to_string();
            (usage, model, ts)
        };
        if model == "<synthetic>" {
            continue;
        }
        let day = day_of(&ts);
        if !day.is_empty() && day.as_str() < cutoff {
            continue;
        }
        let i = num(&usage, "input_tokens");
        let o = num(&usage, "output_tokens");
        let cr = num(&usage, "cache_read_input_tokens") + num(&usage, "cached_input_tokens");
        let cw = num(&usage, "cache_creation_input_tokens") + num(&usage, "cache_write_input_tokens");
        if i + o + cr + cw == 0 {
            continue;
        }
        models
            .entry((source.to_string(), model))
            .or_default()
            .add(i, o, cr, cw);
        let entry = days.entry(day).or_insert((0, 0));
        entry.0 += i;
        entry.1 += o;
        *records += 1;
    }
    Ok(())
}

fn modified_secs(path: &Path) -> Option<u64> {
    std::fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs())
}

fn walk(
    dir: &Path,
    source: &str,
    cutoff_secs: u64,
    cutoff: &str,
    models: &mut BTreeMap<(String, String), Acc>,
    days: &mut BTreeMap<String, (u64, u64)>,
    root: &mut UsageRoot,
    skipped_files: &mut usize,
    errors: &mut Vec<String>,
    records: &mut usize,
) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(
                &path,
                source,
                cutoff_secs,
                cutoff,
                models,
                days,
                root,
                skipped_files,
                errors,
                records,
            );
        } else if path.extension().map(|extension| extension == "jsonl").unwrap_or(false) {
            root.files += 1;
            if modified_secs(&path).is_some_and(|modified| modified.saturating_add(86_400) < cutoff_secs) {
                *skipped_files += 1;
                continue;
            }
            match scan_file(&path, source, cutoff, models, days, records) {
                Ok(()) => root.scanned_files += 1,
                Err(error) => {
                    if errors.len() < 20 {
                        errors.push(error);
                    }
                    *skipped_files += 1;
                }
            }
        }
    }
}

fn root_report(source: &str, path: &Path) -> UsageRoot {
    UsageRoot {
        source: source.to_string(),
        path: crate::adapters::display_path(path),
        exists: path.exists(),
        files: 0,
        scanned_files: 0,
    }
}

pub fn report(days_back: u32) -> UsageReport {
    let started = Instant::now();
    let home = crate::adapters::home();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let cutoff_secs = now.saturating_sub(days_back as u64 * 86_400);
    let cutoff = epoch_day(cutoff_secs);

    let mut models = BTreeMap::new();
    let mut days = BTreeMap::new();
    let mut records = 0;
    let mut skipped_files = 0;
    let mut errors = Vec::new();

    let claude_dir = home.join(".claude").join("projects");
    let codex_dir = home.join(".codex").join("sessions");
    let mut claude_root = root_report("claude", &claude_dir);
    let mut codex_root = root_report("codex", &codex_dir);
    walk(
        &claude_dir,
        "claude",
        cutoff_secs,
        &cutoff,
        &mut models,
        &mut days,
        &mut claude_root,
        &mut skipped_files,
        &mut errors,
        &mut records,
    );
    walk(
        &codex_dir,
        "codex",
        cutoff_secs,
        &cutoff,
        &mut models,
        &mut days,
        &mut codex_root,
        &mut skipped_files,
        &mut errors,
        &mut records,
    );
    let files = claude_root.scanned_files + codex_root.scanned_files;
    let roots = vec![claude_root, codex_root];

    let mut rows: Vec<UsageRow> = models
        .into_iter()
        .map(|((source, model), acc)| {
            let cost = price_for(&model).map(|(i, o, c)| {
                (acc.input as f64 * i + acc.output as f64 * o + acc.cache_read as f64 * c) / 1_000_000.0
            });
            UsageRow {
                source,
                model,
                input: acc.input,
                output: acc.output,
                cache_read: acc.cache_read,
                cache_write: acc.cache_write,
                records: acc.records,
                cost,
            }
        })
        .collect();
    rows.sort_by(|a, b| (b.input + b.output).cmp(&(a.input + a.output)));

    let day_rows: Vec<DayRow> = days
        .into_iter()
        .map(|(day, (i, o))| DayRow { day, input: i, output: o, total: i + o })
        .collect();

    let total_input: u64 = rows.iter().map(|r| r.input).sum();
    let total_output: u64 = rows.iter().map(|r| r.output).sum();
    let total_cache: u64 = rows.iter().map(|r| r.cache_read + r.cache_write).sum();
    let priced: Vec<f64> = rows.iter().filter_map(|r| r.cost).collect();
    let total_cost = if priced.is_empty() { None } else { Some(priced.iter().sum()) };

    UsageReport {
        rows,
        days: day_rows,
        files,
        records,
        total_input,
        total_output,
        total_cache,
        total_cost,
        days_scanned: days_back,
        roots,
        skipped_files,
        errors,
        elapsed_ms: started.elapsed().as_millis() as u64,
    }
}

fn epoch_day(secs: u64) -> String {
    let days = secs / 86_400;
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn price_matching_is_substring_based() {
        assert!(price_for("deepseek-v4.1-flash").is_some());
        assert!(price_for("claude-sonnet-5[1M]").is_some());
        assert!(price_for("totally-unknown-model").is_none());
    }

    #[test]
    fn day_extraction() {
        assert_eq!(day_of("2026-10-16T09:19:56.985Z"), "2026-10-16");
        assert_eq!(day_of(""), "");
    }

    #[test]
    fn real_logs_aggregate_if_present() {
        let report = report(365);
        if report.files == 0 {
            return; // machine without CLI logs
        }
        assert!(report.records > 0, "有檔案卻沒解析到任何用量");
        assert!(report.total_input + report.total_output > 0);
        assert!(!report.rows.is_empty());
    }

    #[test]
    fn codex_record_parses() {
        let line = r#"{"timestamp":"2026-10-16T09:19:56.985Z","type":"token_usage_record","payload":{"usage":{"input_tokens":25096,"cached_input_tokens":23168,"output_tokens":304}}}"#;
        let d: serde_json::Value = serde_json::from_str(line).unwrap();
        let usage = d["payload"]["usage"].clone();
        assert_eq!(num(&usage, "input_tokens"), 25096);
        assert_eq!(num(&usage, "cached_input_tokens"), 23168);
    }
}

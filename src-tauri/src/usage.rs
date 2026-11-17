//! Usage statistics read from the CLI tools' own local session logs.
//!
//! Supported sources today:
//! - Claude Code `message.usage` per assistant turn (`~/.claude/projects`)
//! - Codex `token_usage_record` events (`~/.codex/sessions`)
//! - Pi / Oh My Pi session JSONL (`~/.pi`, `~/.omp`) with `usage` + `durationMs`
//! - DSH request log (`~/.dsh/storages/model-usage.jsonl`) with duration
//!
//! Other harnesses do not expose a stable local token-usage format yet, so they
//! are intentionally left out instead of guessing. Everything is aggregated in
//! memory from the user's own files and never uploaded.

use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
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
    /// Reasoning tokens reported separately by Pi/DSH.
    pub reasoning: u64,
    /// Total request duration for rows that expose timings.
    pub duration_ms: u64,
    /// Output tokens covered by `duration_ms`.
    pub timed_output: u64,
    /// Requests with a usable duration.
    pub timed_records: u64,
    pub avg_duration_ms: Option<u64>,
    pub output_per_sec: Option<f64>,
    /// Median per-request output tokens per second (robust to slow requests).
    pub median_output_per_sec: Option<f64>,
    /// Decode rate estimated by regressing duration on output tokens.
    pub decode_output_per_sec: Option<f64>,
    /// Estimated fixed wait per request (TTFT + queue + retries).
    pub fixed_overhead_ms: Option<u64>,
    /// Requests that took longer than 60 seconds (likely timeouts or retries).
    pub slow_records: u64,
    /// Estimated first-output latency (Claude Code timestamps only).
    pub ttft_ms: Option<u64>,
    pub ttft_records: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct UsageSample {
    pub ts: u64,
    pub source: String,
    pub model: String,
    pub status: String,
    pub input: u64,
    pub output: u64,
    pub cache: u64,
    pub reasoning: u64,
    pub duration_ms: u64,
    pub cost: Option<f64>,
    pub id: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct DayRow {
    pub day: String,
    pub source: String,
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
    pub requests: Vec<UsageSample>,
    pub days: Vec<DayRow>,
    pub files: usize,
    pub records: usize,
    pub total_input: u64,
    pub total_output: u64,
    pub total_cache: u64,
    pub total_cost: Option<f64>,
    pub total_reasoning: u64,
    pub total_duration_ms: u64,
    pub timed_records: u64,
    pub timed_output: u64,
    pub avg_duration_ms: Option<u64>,
    pub output_per_sec: Option<f64>,
    pub decode_output_per_sec: Option<f64>,
    pub fixed_overhead_ms: Option<u64>,
    pub slow_records: u64,
    pub ttft_ms: Option<u64>,
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
    reasoning: u64,
    duration_ms: u64,
    timed_output: u64,
    timed_records: u64,
    ttft_ms: u64,
    ttft_records: u64,
    request_speeds: Vec<f64>,
    samples: Vec<(u64, u64)>,
    slow_records: u64,
}

impl Acc {
    fn add_usage(&mut self, i: u64, o: u64, cr: u64, cw: u64, count: bool) {
        self.input += i;
        self.output += o;
        self.cache_read += cr;
        self.cache_write += cw;
        if count {
            self.records += 1;
        }
    }

    fn add_timing(&mut self, duration_ms: u64, output: u64, ttft: Option<u64>) {
        if duration_ms == 0 {
            return;
        }
        self.duration_ms += duration_ms;
        self.timed_output += output;
        self.timed_records += 1;
        if output > 0 {
            self.request_speeds
                .push(output as f64 / (duration_ms as f64 / 1_000.0));
            self.samples.push((output, duration_ms));
        }
        if duration_ms > 60_000 {
            self.slow_records += 1;
        }
        if let Some(ttft) = ttft {
            self.ttft_ms += ttft;
            self.ttft_records += 1;
        }
    }
}

fn line_has_candidate(source: &str, line: &str) -> bool {
    if source == "codex" {
        line.contains("token_usage_record") && line.contains("\"usage\"")
    } else {
        line.contains("\"usage\"")
    }
}

/* --------------------------------------------------------------- timestamps */

fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (i64::from(m) + 9) % 12;
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Parse `YYYY-MM-DDTHH:MM:SS[.fff]Z` into epoch milliseconds.
fn parse_iso_ms(ts: &str) -> Option<i64> {
    let bytes = ts.as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    let y: i64 = ts.get(0..4)?.parse().ok()?;
    let m: u32 = ts.get(5..7)?.parse().ok()?;
    let d: u32 = ts.get(8..10)?.parse().ok()?;
    let h: i64 = ts.get(11..13)?.parse().ok()?;
    let min: i64 = ts.get(14..16)?.parse().ok()?;
    let sec: i64 = ts.get(17..19)?.parse().ok()?;
    let millis: i64 = ts
        .get(20..23)
        .and_then(|fraction| fraction.parse().ok())
        .unwrap_or(0);
    let days = days_from_civil(y, m, d);
    Some((days * 86_400 + h * 3_600 + min * 60 + sec) * 1_000 + millis)
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

/* ---------------------------------------------------------------- scanning */

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Claude,
    Codex,
    /// Pi / Oh My Pi session JSONL.
    AgentSession,
}

struct Scanner<'a> {
    source: &'a str,
    kind: Kind,
    cutoff: &'a str,
    models: &'a mut BTreeMap<(String, String), Acc>,
    days: &'a mut BTreeMap<(String, String), (u64, u64)>,
    records: &'a mut usize,
    samples: &'a mut Vec<UsageSample>,
}

fn sample_cost(model: &str, input: u64, output: u64, cache: u64, reasoning: u64) -> Option<f64> {
    price_for(model).map(|(i, o, c)| {
        (input as f64 * i + (output + reasoning) as f64 * o + cache as f64 * c) / 1_000_000.0
    })
}

impl Scanner<'_> {
    fn push_sample(
        &mut self,
        ts: u64,
        model: &str,
        status: &str,
        input: u64,
        output: u64,
        cache: u64,
        reasoning: u64,
        duration_ms: u64,
        id: &str,
    ) {
        let cost = sample_cost(model, input, output, cache, reasoning);
        self.samples.push(UsageSample {
            ts,
            source: self.source.to_string(),
            model: model.to_string(),
            status: status.to_string(),
            input,
            output,
            cache,
            reasoning,
            duration_ms,
            cost,
            id: id.to_string(),
        });
    }

    fn bump_day(&mut self, day: &str, source: &str, input: u64, output: u64) {
        if day.is_empty() {
            return;
        }
        let entry = self
            .days
            .entry((day.to_string(), source.to_string()))
            .or_insert((0, 0));
        entry.0 += input;
        entry.1 += output;
    }
}

fn scan_claude(path: &Path, scanner: &mut Scanner<'_>) -> Result<(), String> {
    let file = File::open(path).map_err(|error| format!("{}：{error}", path.display()))?;
    let reader = BufReader::new(file);

    // A single assistant turn is written once per content block. Keep the
    // largest usage seen per message so thinking/tool blocks do not multiply it.
    let mut seen: HashMap<String, (u64, u64, u64, u64)> = HashMap::new();
    let mut last_user_ms: Option<i64> = None;
    let mut requests: HashMap<String, (String, i64, i64, u64, Option<u64>, u64, u64, u64)> = HashMap::new();
    let mut counted: HashSet<String> = HashSet::new();

    for line in reader.lines() {
        let line = line.map_err(|error| format!("{}：{error}", path.display()))?;
        // User rows carry the request start time even though they have no usage.
        let has_usage = line.contains("\"usage\"");
        let maybe_user = line.contains("\"type\":\"user\"");
        if !has_usage && !maybe_user {
            continue;
        }
        let Ok(d) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let kind = d.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let ts = d
            .get("timestamp")
            .and_then(|v| v.as_str())
            .and_then(parse_iso_ms);
        if kind == "user" {
            if let Some(ts) = ts {
                last_user_ms = Some(ts);
            }
            continue;
        }
        if kind != "assistant" || !has_usage {
            continue;
        }
        let message = d.get("message").cloned().unwrap_or_default();
        let usage = message.get("usage").cloned().unwrap_or_default();
        let i = num(&usage, "input_tokens");
        let o = num(&usage, "output_tokens");
        let cr = num(&usage, "cache_read_input_tokens") + num(&usage, "cached_input_tokens");
        let cw = num(&usage, "cache_creation_input_tokens") + num(&usage, "cache_write_input_tokens");
        if i + o + cr + cw == 0 {
            continue;
        }
        let day = ts.map(|ms| epoch_day((ms / 1_000) as u64)).unwrap_or_else(|| day_of(""));
        if !day.is_empty() && day.as_str() < scanner.cutoff {
            continue;
        }
        let model = message
            .get("model")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown")
            .to_string();
        if model == "<synthetic>" {
            continue;
        }
        let session = d.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
        let message_id = message
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| d.get("uuid").and_then(|v| v.as_str()).unwrap_or(""));
        let key = format!("{session}:{message_id}");
        let entry = seen.entry(key.clone()).or_insert((0, 0, 0, 0));
        let delta = (
            i.saturating_sub(entry.0),
            o.saturating_sub(entry.1),
            cr.saturating_sub(entry.2),
            cw.saturating_sub(entry.3),
        );
        let has_delta = delta.0 + delta.1 + delta.2 + delta.3 > 0;
        if has_delta {
            scanner.bump_day(&day, scanner.source, delta.0, delta.1);
            *entry = (
                entry.0.max(i),
                entry.1.max(o),
                entry.2.max(cr),
                entry.3.max(cw),
            );
        }
        let counted_once = counted.insert(key);
        let acc = scanner
            .models
            .entry((scanner.source.to_string(), model.clone()))
            .or_default();
        if has_delta {
            acc.add_usage(delta.0, delta.1, delta.2, delta.3, false);
        }
        if counted_once {
            acc.records += 1;
            *scanner.records += 1;
        }

        // Latency grouping: requestRef stays stable across streamed blocks.
        let request = d
            .get("requestRef")
            .and_then(|v| v.as_str())
            .filter(|value| !value.is_empty())
            .unwrap_or(message_id)
            .to_string();
        if request.is_empty() {
            continue;
        }
        if let Some(ts) = ts {
            requests
                .entry(request)
                .and_modify(|slot| {
                    slot.2 = slot.2.max(ts);
                    slot.3 = slot.3.max(o);
                    slot.5 = slot.5.saturating_add(delta.0);
                    slot.6 = slot.6.saturating_add(delta.2);
                    slot.7 = slot.7.saturating_add(usage.get("output_tokens_details").and_then(|v| v.get("reasoning_tokens")).and_then(|v| v.as_u64()).unwrap_or(0));
                })
                .or_insert_with(|| {
                    let ttft = last_user_ms.and_then(|start| {
                        let elapsed = ts - start;
                        (0..=300_000).contains(&elapsed).then_some(elapsed as u64)
                    });
                    (
                        model,
                        ts,
                        ts,
                        o,
                        ttft,
                        delta.0,
                        delta.2,
                        usage.get("output_tokens_details").and_then(|v| v.get("reasoning_tokens")).and_then(|v| v.as_u64()).unwrap_or(0),
                    )
                });
        }
    }

    for (id, (model, first, last, output, ttft, input, cache, reasoning)) in requests {
        let span = last.saturating_sub(first).max(0) as u64;
        let duration = span + ttft.unwrap_or(0);
        if duration > 0 && output > 0 {
            scanner
                .models
                .entry((scanner.source.to_string(), model.clone()))
                .or_default()
                .add_timing(duration, output, ttft);
        }
        if (first as u64) > 0 {
            scanner.push_sample(first as u64, &model, "completed", input, output, cache, reasoning, duration, &id);
        }
    }
    Ok(())
}

fn scan_codex(path: &Path, scanner: &mut Scanner<'_>) -> Result<(), String> {
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
        if !line_has_candidate(scanner.source, &line) {
            continue;
        }
        let Ok(d) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
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
        let day = day_of(&ts);
        if !day.is_empty() && day.as_str() < scanner.cutoff {
            continue;
        }
        let i = num(&usage, "input_tokens");
        let o = num(&usage, "output_tokens");
        let cr = num(&usage, "cache_read_input_tokens") + num(&usage, "cached_input_tokens");
        let cw = num(&usage, "cache_creation_input_tokens") + num(&usage, "cache_write_input_tokens");
        if i + o + cr + cw == 0 {
            continue;
        }
        scanner
            .models
            .entry((scanner.source.to_string(), model.clone()))
            .or_default()
            .add_usage(i, o, cr, cw, true);
        scanner.bump_day(&day, scanner.source, i, o);
        *scanner.records += 1;
        if let Some(ts) = parse_iso_ms(&ts) {
            let id = payload.get("response_id").and_then(|v| v.as_str()).unwrap_or("");
            scanner.push_sample(ts as u64, &model, "completed", i, o, cr + cw, num(&usage, "reasoning_output_tokens"), 0, id);
        }
    }
    Ok(())
}

/// Pi and Oh My Pi write one assistant message per line with camelCase usage.
fn scan_agent_session(path: &Path, scanner: &mut Scanner<'_>) -> Result<(), String> {
    let file = File::open(path).map_err(|error| format!("{}：{error}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    let mut seen: HashSet<String> = HashSet::new();
    loop {
        line.clear();
        let read = reader
            .read_line(&mut line)
            .map_err(|error| format!("{}：{error}", path.display()))?;
        if read == 0 {
            break;
        }
        if !line_has_candidate(scanner.source, &line) {
            continue;
        }
        let Ok(d) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if d.get("type").and_then(|t| t.as_str()) != Some("message") {
            continue;
        }
        let message = d.get("message").cloned().unwrap_or_default();
        if message.get("role").and_then(|r| r.as_str()) != Some("assistant") {
            continue;
        }
        let usage = message.get("usage").cloned().unwrap_or_default();
        let i = num(&usage, "input");
        let o = num(&usage, "output");
        let cr = num(&usage, "cacheRead");
        let cw = num(&usage, "cacheWrite");
        if i + o + cr + cw == 0 {
            continue;
        }
        let model = message
            .get("model")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown")
            .to_string();
        let ts = d.get("timestamp").and_then(|t| t.as_str()).unwrap_or("");
        let day = day_of(ts);
        if !day.is_empty() && day.as_str() < scanner.cutoff {
            continue;
        }
        let id = message
            .get("responseId")
            .and_then(|v| v.as_str())
            .or_else(|| message.get("id").and_then(|v| v.as_str()))
            .or_else(|| d.get("id").and_then(|v| v.as_str()))
            .unwrap_or("");
        if !id.is_empty() && !seen.insert(id.to_string()) {
            continue;
        }
        let acc = scanner
            .models
            .entry((scanner.source.to_string(), model.clone()))
            .or_default();
        acc.add_usage(i, o, cr, cw, true);
        let reasoning = num(&usage, "reasoning");
        acc.reasoning += reasoning;
        if let Some(duration) = message.get("durationMs").and_then(|v| v.as_u64()) {
            acc.add_timing(duration, o, None);
        }
        scanner.bump_day(&day, scanner.source, i, o);
        *scanner.records += 1;
        if let Some(ts) = parse_iso_ms(ts) {
            let status = message.get("stopReason").and_then(|v| v.as_str()).unwrap_or("completed");
            scanner.push_sample(ts as u64, &model, status, i, o, cr + cw, reasoning, message.get("durationMs").and_then(|v| v.as_u64()).unwrap_or(0), id);
        }
    }
    Ok(())
}

/// DSH keeps a flat request log with its own duration field.
fn scan_dsh(path: &Path, scanner: &mut Scanner<'_>) -> Result<(), String> {
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
        if !line.contains("\"inp\"") {
            continue;
        }
        let Ok(d) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let ts_ms = d.get("ts").and_then(|v| v.as_u64()).unwrap_or(0);
        let day = if ts_ms > 0 {
            epoch_day(ts_ms / 1_000)
        } else {
            String::new()
        };
        if !day.is_empty() && day.as_str() < scanner.cutoff {
            continue;
        }
        let i = num(&d, "inp");
        let o = num(&d, "out");
        let cr = num(&d, "cr");
        let cw = num(&d, "cw");
        if i + o + cr + cw == 0 {
            continue;
        }
        let model = d
            .get("model")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown")
            .to_string();
        let acc = scanner
            .models
            .entry((scanner.source.to_string(), model.clone()))
            .or_default();
        acc.add_usage(i, o, cr, cw, true);
        let reasoning = num(&d, "rsn");
        acc.reasoning += reasoning;
        if let Some(duration) = d.get("dur").and_then(|v| v.as_u64()) {
            acc.add_timing(duration, o, None);
        }
        scanner.bump_day(&day, scanner.source, i, o);
        *scanner.records += 1;
        let status = d.get("status").and_then(|v| v.as_str()).unwrap_or("unknown");
        let id = d.get("id").and_then(|v| v.as_str()).unwrap_or("");
        scanner.push_sample(ts_ms, &model, status, i, o, cr + cw, reasoning, d.get("dur").and_then(|v| v.as_u64()).unwrap_or(0), id);
    }
    Ok(())
}

fn scan_file(path: &Path, scanner: &mut Scanner<'_>) -> Result<(), String> {
    match scanner.kind {
        Kind::Claude => scan_claude(path, scanner),
        Kind::Codex => scan_codex(path, scanner),
        Kind::AgentSession => scan_agent_session(path, scanner),
    }
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

#[allow(clippy::too_many_arguments)]
fn walk(
    dir: &Path,
    scanner: &mut Scanner<'_>,
    cutoff_secs: u64,
    root: &mut UsageRoot,
    skipped_files: &mut usize,
    errors: &mut Vec<String>,
) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(
                &path,
                scanner,
                cutoff_secs,
                root,
                skipped_files,
                errors,
            );
        } else if path.extension().map(|extension| extension == "jsonl").unwrap_or(false) {
            root.files += 1;
            if modified_secs(&path).is_some_and(|modified| modified.saturating_add(86_400) < cutoff_secs) {
                *skipped_files += 1;
                continue;
            }
            match scan_file(&path, scanner) {
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

/// Estimate decode speed and fixed per-request overhead from 
/// `duration_ms = overhead + output / decode_speed`.
fn decode_estimate(samples: &[(u64, u64)]) -> Option<(f64, u64)> {
    if samples.len() < 8 {
        return None;
    }
    let n = samples.len() as f64;
    let mean_x = samples.iter().map(|(x, _)| *x as f64).sum::<f64>() / n;
    let mean_y = samples.iter().map(|(_, y)| *y as f64).sum::<f64>() / n;
    let cov = samples
        .iter()
        .map(|(x, y)| (*x as f64 - mean_x) * (*y as f64 - mean_y))
        .sum::<f64>();
    let var = samples
        .iter()
        .map(|(x, _)| (*x as f64 - mean_x).powi(2))
        .sum::<f64>();
    if var <= f64::EPSILON {
        return None;
    }
    let slope = cov / var; // milliseconds per output token
    if !slope.is_finite() || slope <= 0.0 {
        return None;
    }
    let intercept = (mean_y - slope * mean_x).max(0.0);
    Some((1_000.0 / slope, intercept.round() as u64))
}

fn median(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let middle = sorted.len() / 2;
    if sorted.len() % 2 == 0 {
        Some((sorted[middle - 1] + sorted[middle]) / 2.0)
    } else {
        Some(sorted[middle])
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
    let mut samples: Vec<UsageSample> = Vec::new();
    let mut skipped_files = 0;
    let mut errors = Vec::new();

    let sources: [(&str, Kind, std::path::PathBuf); 4] = [
        ("claude", Kind::Claude, home.join(".claude").join("projects")),
        ("codex", Kind::Codex, home.join(".codex").join("sessions")),
        ("pi", Kind::AgentSession, home.join(".pi").join("agent").join("sessions")),
        ("omp", Kind::AgentSession, home.join(".omp").join("agent").join("sessions")),
    ];
    let mut roots = Vec::new();
    for (source, kind, dir) in sources {
        let mut root = root_report(source, &dir);
        {
            let mut scanner = Scanner {
                source,
                kind,
                cutoff: &cutoff,
                models: &mut models,
                days: &mut days,
                records: &mut records,
                samples: &mut samples,
            };
            walk(&dir, &mut scanner, cutoff_secs, &mut root, &mut skipped_files, &mut errors);
        }
        roots.push(root);
    }

    // DSH writes one flat JSONL request log instead of session directories.
    let dsh_path = home.join(".dsh").join("storages").join("model-usage.jsonl");
    let mut dsh_root = root_report("dsh", &dsh_path);
    if dsh_path.is_file() {
        dsh_root.files = 1;
        let mut scanner = Scanner {
            source: "dsh",
            kind: Kind::AgentSession,
            cutoff: &cutoff,
            models: &mut models,
            days: &mut days,
            records: &mut records,
            samples: &mut samples,
        };
        match scan_dsh(&dsh_path, &mut scanner) {
            Ok(()) => dsh_root.scanned_files = 1,
            Err(error) => {
                if errors.len() < 20 {
                    errors.push(error);
                }
                skipped_files += 1;
            }
        }
    }
    roots.push(dsh_root);

    let files = roots.iter().map(|root| root.scanned_files).sum();

    let all_samples: Vec<(u64, u64)> = models
        .values()
        .flat_map(|acc| acc.samples.iter().copied())
        .collect();

    let mut rows: Vec<UsageRow> = models
        .into_iter()
        .map(|((source, model), acc)| {
            let cost = price_for(&model).map(|(i, o, c)| {
                (acc.input as f64 * i
                    + (acc.output + acc.reasoning) as f64 * o
                    + acc.cache_read as f64 * c)
                    / 1_000_000.0
            });
            let avg_duration = if acc.timed_records > 0 {
                Some(acc.duration_ms / acc.timed_records)
            } else {
                None
            };
            let output_per_sec = if acc.duration_ms > 0 {
                Some(acc.timed_output as f64 / (acc.duration_ms as f64 / 1_000.0))
            } else {
                None
            };
            UsageRow {
                source,
                model,
                input: acc.input,
                output: acc.output,
                cache_read: acc.cache_read,
                cache_write: acc.cache_write,
                records: acc.records,
                cost,
                reasoning: acc.reasoning,
                duration_ms: acc.duration_ms,
                timed_output: acc.timed_output,
                timed_records: acc.timed_records,
                avg_duration_ms: avg_duration,
                output_per_sec,
                median_output_per_sec: median(&acc.request_speeds),
                decode_output_per_sec: decode_estimate(&acc.samples).map(|(speed, _)| speed),
                fixed_overhead_ms: decode_estimate(&acc.samples).map(|(_, overhead)| overhead),
                slow_records: acc.slow_records,
                ttft_ms: if acc.ttft_records > 0 {
                    Some(acc.ttft_ms / acc.ttft_records)
                } else {
                    None
                },
                ttft_records: acc.ttft_records,
            }
        })
        .collect();
    rows.sort_by(|a, b| (b.input + b.output).cmp(&(a.input + a.output)));

    let day_rows: Vec<DayRow> = days
        .into_iter()
        .map(|((day, source), (i, o))| DayRow { day, source, input: i, output: o, total: i + o })
        .collect();

    let total_input: u64 = rows.iter().map(|r| r.input).sum();
    let total_output: u64 = rows.iter().map(|r| r.output).sum();
    let total_cache: u64 = rows.iter().map(|r| r.cache_read + r.cache_write).sum();
    let total_reasoning: u64 = rows.iter().map(|r| r.reasoning).sum();
    let slow_records: u64 = rows.iter().map(|r| r.slow_records).sum();
    let (decode_output_per_sec, fixed_overhead_ms) = match decode_estimate(&all_samples) {
        Some((speed, overhead)) => (Some(speed), Some(overhead)),
        None => (None, None),
    };
    let priced: Vec<f64> = rows.iter().filter_map(|r| r.cost).collect();
    let total_cost = if priced.is_empty() { None } else { Some(priced.iter().sum()) };
    let total_duration_ms: u64 = rows.iter().map(|r| r.duration_ms).sum();
    let timed_records: u64 = rows.iter().map(|r| r.timed_records).sum();
    let timed_output: u64 = rows.iter().map(|r| r.timed_output).sum();
    let ttft_sum: u64 = rows
        .iter()
        .map(|r| r.ttft_ms.unwrap_or(0) * r.ttft_records)
        .sum();
    let ttft_records: u64 = rows.iter().map(|r| r.ttft_records).sum();

    samples.sort_by(|a, b| b.ts.cmp(&a.ts).then_with(|| b.id.cmp(&a.id)));
    samples.truncate(300);

    UsageReport {
        rows,
        requests: samples,
        days: day_rows,
        files,
        records,
        total_input,
        total_output,
        total_cache,
        total_cost,
        total_reasoning,
        total_duration_ms,
        timed_records,
        timed_output,
        avg_duration_ms: (timed_records > 0).then(|| total_duration_ms / timed_records),
        output_per_sec: (total_duration_ms > 0)
            .then(|| timed_output as f64 / (total_duration_ms as f64 / 1_000.0)),
        decode_output_per_sec,
        fixed_overhead_ms,
        slow_records,
        ttft_ms: (ttft_records > 0).then(|| ttft_sum / ttft_records),
        days_scanned: days_back,
        roots,
        skipped_files,
        errors,
        elapsed_ms: started.elapsed().as_millis() as u64,
    }
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
    fn iso_timestamp_parses_to_epoch() {
        assert_eq!(parse_iso_ms("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(
            parse_iso_ms("2026-10-16T09:19:56.985Z"),
            Some(1_792_142_396_985)
        );
        assert_eq!(parse_iso_ms(""), None);
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
        assert!(!report.requests.is_empty(), "沒有收集到逐筆請求記錄");
        assert!(report.requests.iter().all(|sample| sample.ts > 0 && !sample.model.is_empty()));
    }

    #[test]
    fn decode_estimate_removes_fixed_overhead() {
        let samples = [(100, 5_500), (200, 6_000), (400, 7_000), (600, 8_000), (1_000, 10_000), (1_500, 12_500), (2_000, 15_000), (3_000, 20_000)];
        let (speed, overhead) = decode_estimate(&samples).expect("estimate");
        assert!((speed - 200.0).abs() < 1.0, "speed={speed}");
        assert!((overhead as i64 - 5_000).abs() <= 1, "overhead={overhead}");
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

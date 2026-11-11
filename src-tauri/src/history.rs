//! Local health history for providers: every connection test appends a sample so
//! the UI can show success rate and latency trend without hitting any API.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

/// How many samples to keep per provider.
const KEEP: usize = 40;
/// Window used for the success-rate figure.
const WINDOW: usize = 20;

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct Sample {
    pub ts: u64,
    pub ok: bool,
    pub ms: u64,
    pub status: u16,
}

#[derive(Serialize, Clone, Debug)]
pub struct Summary {
    pub samples: Vec<Sample>,
    pub success_rate: f64,
    pub avg_ms: u64,
    pub last_ts: u64,
    pub total: usize,
}

type Store = BTreeMap<String, BTreeMap<String, Vec<Sample>>>;

fn path() -> PathBuf {
    crate::store::data_dir().join("history.json")
}

fn load() -> Store {
    std::fs::read_to_string(path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(store: &Store) -> Result<(), String> {
    let dir = crate::store::data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string(store).map_err(|e| e.to_string())?;
    std::fs::write(path(), text).map_err(|e| format!("無法寫入測試歷史：{e}"))
}

pub fn record(tool: &str, provider_id: &str, ok: bool, ms: u64, status: u16) -> Result<(), String> {
    let mut store = load();
    let bucket = store
        .entry(tool.to_string())
        .or_default()
        .entry(provider_id.to_string())
        .or_default();
    bucket.push(Sample { ts: crate::store::stamp() as u64, ok, ms, status });
    if bucket.len() > KEEP {
        let cut = bucket.len() - KEEP;
        bucket.drain(..cut);
    }
    save(&store)
}

fn summarize(samples: &[Sample]) -> Summary {
    let recent = &samples[samples.len().saturating_sub(WINDOW)..];
    let ok_count = recent.iter().filter(|s| s.ok).count();
    let success_rate = if recent.is_empty() {
        0.0
    } else {
        ok_count as f64 / recent.len() as f64
    };
    let ok_samples: Vec<&Sample> = recent.iter().filter(|s| s.ok).collect();
    let avg_ms = if ok_samples.is_empty() {
        0
    } else {
        ok_samples.iter().map(|s| s.ms).sum::<u64>() / ok_samples.len() as u64
    };
    Summary {
        samples: samples.to_vec(),
        success_rate,
        avg_ms,
        last_ts: samples.last().map(|s| s.ts).unwrap_or(0),
        total: samples.len(),
    }
}

pub fn summaries(tool: &str) -> BTreeMap<String, Summary> {
    load()
        .get(tool)
        .map(|bucket| {
            bucket
                .iter()
                .map(|(id, samples)| (id.clone(), summarize(samples)))
                .collect()
        })
        .unwrap_or_default()
}

pub fn forget(tool: &str, provider_id: &str) -> Result<(), String> {
    let mut store = load();
    if let Some(bucket) = store.get_mut(tool) {
        bucket.remove(provider_id);
    }
    save(&store)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(ok: bool, ms: u64) -> Sample {
        Sample { ts: 0, ok, ms, status: if ok { 200 } else { 500 } }
    }

    #[test]
    fn summary_computes_rate_and_latency() {
        let samples = vec![sample(true, 100), sample(true, 300), sample(false, 20)];
        let s = summarize(&samples);
        assert!((s.success_rate - 2.0 / 3.0).abs() < 1e-9);
        assert_eq!(s.avg_ms, 200, "只平均成功的樣本");
        assert_eq!(s.total, 3);
    }

    #[test]
    fn summary_of_only_failures_has_zero_latency() {
        let s = summarize(&[sample(false, 10)]);
        assert_eq!(s.success_rate, 0.0);
        assert_eq!(s.avg_ms, 0);
    }

    #[test]
    fn window_limits_the_rate() {
        let mut samples: Vec<Sample> = (0..30).map(|_| sample(false, 10)).collect();
        samples.extend((0..20).map(|_| sample(true, 50)));
        let s = summarize(&samples);
        assert_eq!(s.success_rate, 1.0, "只計最近 20 筆");
    }
}

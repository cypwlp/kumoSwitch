//! Connectivity probe. Uses the system `curl` (ships with Windows 10/11) and
//! feeds the request config through stdin so the API key never appears in argv.

use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Instant;

#[derive(Clone, Debug, serde::Serialize)]
pub struct TestResult {
    pub ok: bool,
    pub status: u16,
    pub ms: u128,
    pub message: String,
}

fn curl_bin() -> &'static str {
    "curl"
}

#[cfg(windows)]
const NULL_DEVICE: &str = "NUL";
#[cfg(not(windows))]
const NULL_DEVICE: &str = "/dev/null";

/// GET `{base_url}/models` with a bearer token and report the HTTP status.
pub fn probe(base_url: &str, api_key: &str, anthropic_style: bool) -> TestResult {
    let base = base_url.trim_end_matches('/');
    if base.is_empty() {
        return TestResult { ok: false, status: 0, ms: 0, message: "Base URL 是空的".into() };
    }
    let url = format!("{base}/models");

    let mut config = String::new();
    config.push_str("silent\nshow-error\n");
    config.push_str("max-time = 15\n");
    config.push_str(&format!("output = \"{NULL_DEVICE}\"\n"));
    config.push_str("write-out = \"%{http_code}\"\n");
    config.push_str(&format!("url = \"{url}\"\n"));
    if !api_key.is_empty() {
        if anthropic_style {
            config.push_str(&format!("header = \"x-api-key: {api_key}\"\n"));
            config.push_str("header = \"anthropic-version: 2023-06-01\"\n");
        } else {
            config.push_str(&format!("header = \"Authorization: Bearer {api_key}\"\n"));
        }
    }

    let started = Instant::now();
    let child = Command::new(curl_bin())
        .arg("--config")
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(e) => {
            return TestResult {
                ok: false,
                status: 0,
                ms: started.elapsed().as_millis(),
                message: format!("找不到 curl：{e}"),
            }
        }
    };

    if let Some(stdin) = child.stdin.as_mut() {
        if let Err(e) = stdin.write_all(config.as_bytes()) {
            return TestResult {
                ok: false,
                status: 0,
                ms: started.elapsed().as_millis(),
                message: format!("無法送出測試設定：{e}"),
            };
        }
    }
    drop(child.stdin.take());

    let output = match child.wait_with_output() {
        Ok(o) => o,
        Err(e) => {
            return TestResult {
                ok: false,
                status: 0,
                ms: started.elapsed().as_millis(),
                message: format!("測試失敗：{e}"),
            }
        }
    };
    let ms = started.elapsed().as_millis();
    let body = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let status: u16 = body.parse().unwrap_or(0);

    let (ok, message) = match status {
        200..=299 => (true, format!("HTTP {status} · 端點與金鑰可用")),
        401 | 403 => (false, format!("HTTP {status} · 金鑰被拒或權限不足")),
        404 => (false, "HTTP 404 · 連得到伺服器，但沒有 /models 端點（不代表金鑰錯）".into()),
        429 => (false, "HTTP 429 · 被限流，端點存在".into()),
        0 => {
            let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let short = err.lines().last().unwrap_or("連線失敗").to_string();
            (false, format!("無法連線：{short}"))
        }
        other => (false, format!("HTTP {other}")),
    };

    TestResult { ok, status, ms, message }
}

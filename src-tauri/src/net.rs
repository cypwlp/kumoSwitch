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

/// Collect likely model identifiers from OpenAI-, Anthropic-, Ollama- and
/// OpenAI-compatible `/models` responses. Discovery is intentionally read-only
/// and never sends a prompt or spends inference tokens.
pub fn body_lists_model(body: &str, model: &str) -> Option<bool> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    fn walk(value: &serde_json::Value, parent: Option<&str>, out: &mut Vec<String>) {
        match value {
            serde_json::Value::Object(map) => {
                for (key, child) in map {
                    walk(child, Some(key), out);
                }
            }
            serde_json::Value::Array(items) => {
                for child in items {
                    walk(child, parent, out);
                }
            }
            serde_json::Value::String(text)
                if matches!(parent, Some("id" | "name" | "model" | "slug")) =>
            {
                out.push(text.clone());
            }
            _ => {}
        }
    }
    let mut ids = Vec::new();
    walk(&value, None, &mut ids);
    Some(ids.iter().any(|id| {
        id == model
            || id.rsplit('/').next() == Some(model)
            || id.rsplit(':').next() == Some(model)
    }))
}

/// GET the model catalogue and verify that `model` is advertised. This gives
/// each model its own latency and availability signal without inference cost.
pub fn probe_model(base_url: &str, api_key: &str, anthropic_style: bool, model: &str) -> TestResult {
    let base = base_url.trim_end_matches('/');
    if base.is_empty() {
        return TestResult { ok: false, status: 0, ms: 0, message: "Base URL 是空的".into() };
    }
    let url = format!("{base}/models");
    let mut config = String::new();
    config.push_str("silent\nshow-error\nmax-time = 15\n");
    config.push_str("write-out = \"\\n%{http_code}\"\n");
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
        Ok(child) => child,
        Err(error) => {
            return TestResult {
                ok: false,
                status: 0,
                ms: started.elapsed().as_millis(),
                message: format!("找不到 curl：{error}"),
            }
        }
    };
    if let Some(stdin) = child.stdin.as_mut() {
        if let Err(error) = stdin.write_all(config.as_bytes()) {
            return TestResult {
                ok: false,
                status: 0,
                ms: started.elapsed().as_millis(),
                message: format!("無法送出模型測試：{error}"),
            };
        }
    }
    drop(child.stdin.take());
    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(error) => {
            return TestResult {
                ok: false,
                status: 0,
                ms: started.elapsed().as_millis(),
                message: format!("模型測試失敗：{error}"),
            }
        }
    };
    let ms = started.elapsed().as_millis();
    let raw = String::from_utf8_lossy(&output.stdout);
    let (body, status_text) = raw.rsplit_once('\n').unwrap_or((raw.as_ref(), ""));
    let status: u16 = status_text.trim().parse().unwrap_or(0);
    let (ok, message) = match status {
        200..=299 => match body_lists_model(body, model) {
            Some(true) => (true, format!("HTTP {status} · 模型「{model}」可用")),
            Some(false) => (false, format!("HTTP {status} · 端點可用，但模型清單未列出「{model}」")),
            None => (true, format!("HTTP {status} · 端點可用，但無法解析模型清單")),
        },
        401 | 403 => (false, format!("HTTP {status} · 金鑰被拒或權限不足")),
        404 => (false, "HTTP 404 · 這個端點沒有 /models 模型清單".into()),
        429 => (false, "HTTP 429 · 被限流，端點與模型尚未能驗證".into()),
        0 => {
            let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let short = error.lines().last().unwrap_or("連線失敗").to_string();
            (false, format!("無法連線：{short}"))
        }
        other => (false, format!("HTTP {other}")),
    };
    TestResult { ok, status, ms, message }
}

#[cfg(test)]
mod tests {
    use super::{body_lists_model, probe_model};
    use std::thread;
    use std::time::Duration;

    #[test]
    fn model_catalogue_parser_supports_common_shapes() {
        assert_eq!(
            body_lists_model(r#"{"data":[{"id":"glm-5.3-flash"}]}"#, "glm-5.3-flash"),
            Some(true)
        );
        assert_eq!(
            body_lists_model(r#"{"models":[{"name":"qwen2.5-coder:14b"}]}"#, "qwen2.5-coder:14b"),
            Some(true)
        );
        assert_eq!(
            body_lists_model(r#"{"data":[{"id":"other"}]}"#, "missing"),
            Some(false)
        );
        assert_eq!(body_lists_model("not-json", "missing"), None);
    }

    #[test]
    fn model_probe_verifies_a_local_catalogue() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let address = server.server_addr().to_ip().unwrap();
        let join = thread::spawn(move || {
            let request = server
                .recv_timeout(Duration::from_secs(5))
                .expect("local model request")
                .expect("catalogue request");
            let response = tiny_http::Response::from_string(
                r#"{"data":[{"id":"test-model","name":"Test Model"}]}"#,
            )
            .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
            request.respond(response).unwrap();
        });

        let result = probe_model(&format!("http://{address}"), "", false, "test-model");
        join.join().unwrap();
        assert!(result.ok, "{}", result.message);
        assert_eq!(result.status, 200);
        assert!(result.message.contains("test-model"));
    }
}

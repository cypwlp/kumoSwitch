//! Connectivity probe. Uses the system `curl` (ships with Windows 10/11) and
//! feeds the request config through stdin so the API key never appears in argv.

use crate::adapters::{model_profile_from_value, ModelProfile};
use serde_json::Value;
use std::collections::BTreeSet;
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
    let models = parse_model_catalogue(body).ok()?;
    Some(models.iter().any(|item| {
        item.id == model
            || item.id.rsplit('/').next() == Some(model)
            || item.id.rsplit(':').next() == Some(model)
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

#[derive(Clone, Debug, serde::Serialize)]
pub struct ModelDiscovery {
    pub models: Vec<ModelProfile>,
    pub endpoint: String,
    pub message: String,
}

fn entry_from_value(value: &Value, key_hint: Option<&str>) -> Option<(String, Value)> {
    if let Some(id) = value.as_str() {
        if !id.trim().is_empty() {
            return Some((id.trim().to_string(), Value::Null));
        }
    }
    let id = value
        .get("id")
        .or_else(|| value.get("model"))
        .or_else(|| value.get("slug"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .or_else(|| {
            key_hint
                .filter(|key| !matches!(*key, "result" | "response" | "body" | "data" | "models"))
                .map(str::to_string)
        })
        .or_else(|| {
            value
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(str::to_string)
        })?;
    Some((id, value.clone()))
}

fn collect_catalogue(value: &Value, key_hint: Option<&str>, out: &mut Vec<(String, Value)>) {
    match value {
        Value::Array(items) => {
            for item in items {
                if let Some(entry) = entry_from_value(item, None) {
                    out.push(entry);
                }
            }
        }
        Value::Object(map) => {
            if let Some(list) = map.get("data").or_else(|| map.get("models")) {
                match list {
                    Value::Array(items) => {
                        for item in items {
                            if let Some(entry) = entry_from_value(item, None) {
                                out.push(entry);
                            }
                        }
                    }
                    Value::Object(entries) => {
                        for (key, item) in entries {
                            if let Some(entry) = entry_from_value(item, Some(key)) {
                                out.push(entry);
                            }
                        }
                    }
                    _ => {}
                }
                return;
            }
            if let Some(entry) = entry_from_value(value, key_hint) {
                out.push(entry);
                return;
            }
            for wrapper in ["result", "response", "body"] {
                if let Some(child) = map.get(wrapper) {
                    collect_catalogue(child, Some(wrapper), out);
                    if !out.is_empty() {
                        return;
                    }
                }
            }
        }
        _ => {}
    }
}

fn parse_model_catalogue(body: &str) -> Result<Vec<ModelProfile>, String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|_| "端點回應不是合法 JSON，無法解析模型目錄".to_string())?;
    let mut entries = Vec::new();
    collect_catalogue(&value, None, &mut entries);
    let mut seen = BTreeSet::new();
    let mut models = Vec::new();
    for (id, value) in entries {
        let id = id.strip_prefix("models/").unwrap_or(&id).to_string();
        if models.len() >= 2_000 || !seen.insert(id.clone()) {
            continue;
        }
        let mut profile = if value.is_null() {
            ModelProfile::new(id)
        } else {
            model_profile_from_value(id, &value)
        };
        profile.checks.clear();
        models.push(profile);
    }
    if models.is_empty() {
        return Err("端點回應成功，但找不到可用的模型 ID".into());
    }
    Ok(models)
}

#[derive(Clone, Copy)]
enum DiscoveryAuth {
    Bearer,
    Anthropic,
    GoogleApiKey,
    None,
}

fn fetch_catalogue_url(
    url: &str,
    api_key: &str,
    auth: DiscoveryAuth,
) -> Result<(u16, String), String> {
    let mut config = String::new();
    config.push_str("silent\nshow-error\nmax-time = 30\n");
    config.push_str("write-out = \"\\n%{http_code}\"\n");
    config.push_str("header = \"Accept: application/json\"\n");
    config.push_str(&format!("url = \"{url}\"\n"));
    if !api_key.is_empty() {
        match auth {
            DiscoveryAuth::Anthropic => {
                config.push_str(&format!("header = \"x-api-key: {api_key}\"\n"));
                config.push_str("header = \"anthropic-version: 2023-06-01\"\n");
            }
            DiscoveryAuth::GoogleApiKey => {
                config.push_str(&format!("header = \"x-goog-api-key: {api_key}\"\n"));
            }
            DiscoveryAuth::Bearer => {
                config.push_str(&format!("header = \"Authorization: Bearer {api_key}\"\n"));
            }
            DiscoveryAuth::None => {}
        }
    }

    let mut child = Command::new(curl_bin())
        .arg("--config")
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("找不到 curl：{error}"))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(config.as_bytes())
            .map_err(|error| format!("無法送出模型探索請求：{error}"))?;
    }
    drop(child.stdin.take());
    let output = child
        .wait_with_output()
        .map_err(|error| format!("模型探索失敗：{error}"))?;
    let raw = String::from_utf8_lossy(&output.stdout);
    let (body, status_text) = raw.rsplit_once('\n').unwrap_or((raw.as_ref(), ""));
    let status: u16 = status_text.trim().parse().unwrap_or(0);
    if status == 0 {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let short = error.lines().last().unwrap_or("連線失敗").to_string();
        return Err(format!("無法連線：{short}"));
    }
    Ok((status, body.to_string()))
}

fn discovery_status_error(status: u16) -> Option<String> {
    match status {
        200..=299 => None,
        401 | 403 => Some(format!("HTTP {status} · 金鑰被拒或權限不足")),
        404 => Some("HTTP 404 · 這個端點沒有模型目錄".into()),
        429 => Some("HTTP 429 · 被限流，請稍後再同步模型".into()),
        other => Some(format!("HTTP {other} · 無法取得模型目錄")),
    }
}

fn unique_models(models: &mut Vec<ModelProfile>, incoming: Vec<ModelProfile>) {
    for model in incoming {
        if !models.iter().any(|existing| existing.id == model.id) {
            models.push(model);
        }
    }
}

fn percent_encode(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn fetch_ollama_catalogue(base: &str, api_key: &str) -> Result<ModelDiscovery, String> {
    let root = base.strip_suffix("/v1").unwrap_or(base).trim_end_matches('/');
    let endpoint = format!("{root}/api/tags");
    let (status, body) = fetch_catalogue_url(&endpoint, api_key, DiscoveryAuth::Bearer)?;
    if let Some(error) = discovery_status_error(status) {
        return Err(error);
    }
    let models = parse_model_catalogue(&body)?;
    Ok(ModelDiscovery {
        message: format!("共找到 {} 個模型（Ollama）", models.len()),
        models,
        endpoint,
    })
}

/// Fetch and normalize the provider model catalogue. This only calls model
/// catalogue endpoints; it never sends a prompt or spends inference tokens.
#[cfg(test)]
pub fn discover_models(
    base_url: &str,
    api_key: &str,
    anthropic_style: bool,
) -> Result<ModelDiscovery, String> {
    discover_models_styled(base_url, api_key, anthropic_style, "", "")
}

pub fn discover_models_styled(
    base_url: &str,
    api_key: &str,
    anthropic_style: bool,
    tool: &str,
    _kind: &str,
) -> Result<ModelDiscovery, String> {
    let base = base_url.trim_end_matches('/');
    if base.is_empty() {
        return Err("Base URL 是空的".into());
    }
    let auth = if anthropic_style || tool == "claude" {
        DiscoveryAuth::Anthropic
    } else if tool == "gemini" && !base.ends_with("/openai") {
        DiscoveryAuth::GoogleApiKey
    } else if api_key.is_empty() {
        DiscoveryAuth::None
    } else {
        DiscoveryAuth::Bearer
    };
    let endpoint = format!("{base}/models");
    let first_url = if matches!(auth, DiscoveryAuth::Anthropic) {
        format!("{endpoint}?limit=1000")
    } else {
        endpoint.clone()
    };
    let (mut status, mut body) = fetch_catalogue_url(&first_url, api_key, auth)?;
    let is_ollama = base.contains("11434");
    if status >= 400 && is_ollama {
        if let Ok(discovery) = fetch_ollama_catalogue(base, api_key) {
            return Ok(discovery);
        }
    }
    if let Some(error) = discovery_status_error(status) {
        return Err(error);
    }
    let mut models = match parse_model_catalogue(&body) {
        Ok(models) => models,
        Err(_) if is_ollama => return fetch_ollama_catalogue(base, api_key),
        Err(error) => return Err(error),
    };

    if matches!(auth, DiscoveryAuth::Anthropic) {
        for _ in 0..9 {
            let Ok(page) = serde_json::from_str::<Value>(&body) else { break };
            let has_more = page.get("has_more").and_then(Value::as_bool).unwrap_or(false);
            let last_id = page.get("last_id").and_then(Value::as_str).unwrap_or("");
            if !has_more || last_id.is_empty() {
                break;
            }
            let next = format!("{endpoint}?limit=1000&after_id={}", percent_encode(last_id));
            let (next_status, next_body) = fetch_catalogue_url(&next, api_key, auth)?;
            status = next_status;
            body = next_body;
            if let Some(error) = discovery_status_error(status) {
                return Err(error);
            }
            unique_models(&mut models, parse_model_catalogue(&body)?);
        }
    }

    Ok(ModelDiscovery {
        message: format!("共找到 {} 個模型", models.len()),
        models,
        endpoint,
    })
}

fn live_test_request(tool: &str, kind: &str, model: &str) -> (String, String) {
    if tool == "claude" || kind.contains("anthropic") {
        return (
            "/messages".into(),
            serde_json::json!({
                "model": model,
                "max_tokens": 1,
                "messages": [{ "role": "user", "content": "Reply OK" }]
            })
            .to_string(),
        );
    }
    if tool == "gemini" {
        return (
            format!("/models/{model}:generateContent"),
            serde_json::json!({
                "contents": [{ "role": "user", "parts": [{ "text": "Reply OK" }] }],
                "generationConfig": { "maxOutputTokens": 1 }
            })
            .to_string(),
        );
    }
    if kind == "responses" {
        return (
            "/responses".into(),
            serde_json::json!({
                "model": model,
                "input": "Reply OK",
                "max_output_tokens": 16,
                "store": false
            })
            .to_string(),
        );
    }
    (
        "/chat/completions".into(),
        serde_json::json!({
            "model": model,
            "messages": [{ "role": "user", "content": "Reply OK" }],
            "max_tokens": 1,
            "stream": false
        })
        .to_string(),
    )
}

/// Optional live smoke test. Unlike `/models` discovery, this sends a minimal
/// inference request and may incur provider charges. The caller must confirm.
pub fn probe_live_model(
    base_url: &str,
    api_key: &str,
    model: &str,
    anthropic_style: bool,
    tool: &str,
    kind: &str,
) -> TestResult {
    let base = base_url.trim_end_matches('/');
    if base.is_empty() || model.trim().is_empty() {
        return TestResult { ok: false, status: 0, ms: 0, message: "Base URL 或模型 ID 是空的".into() };
    }
    let request_tool = if tool == "gemini" && base.ends_with("/openai") {
        "gemini-openai"
    } else {
        tool
    };
    let (path, body) = live_test_request(request_tool, kind, model);
    let url = format!("{base}{path}");
    let escaped_body = body.replace('\\', "\\\\").replace('"', "\\\"");
    let mut config = String::new();
    config.push_str("silent\nshow-error\nmax-time = 45\n");
    config.push_str("output = \"");
    config.push_str(NULL_DEVICE);
    config.push_str("\"\nwrite-out = \"%{http_code}\"\n");
    config.push_str("header = \"Content-Type: application/json\"\n");
    config.push_str(&format!("url = \"{url}\"\n"));
    config.push_str(&format!("data = \"{escaped_body}\"\n"));
    if !api_key.is_empty() {
        if anthropic_style || tool == "claude" {
            config.push_str(&format!("header = \"x-api-key: {api_key}\"\n"));
            config.push_str("header = \"anthropic-version: 2023-06-01\"\n");
        } else if tool == "gemini" {
            config.push_str(&format!("header = \"x-goog-api-key: {api_key}\"\n"));
        } else {
            config.push_str(&format!("header = \"Authorization: Bearer {api_key}\"\n"));
        }
    }

    let started = Instant::now();
    let mut child = match Command::new(curl_bin())
        .arg("--config")
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
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
                message: format!("無法送出實測請求：{error}"),
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
                message: format!("實測失敗：{error}"),
            }
        }
    };
    let ms = started.elapsed().as_millis();
    let status: u16 = String::from_utf8_lossy(&output.stdout).trim().parse().unwrap_or(0);
    let (ok, message) = match status {
        200..=299 => (true, format!("HTTP {status} · 最小推論請求成功")),
        401 | 403 => (false, format!("HTTP {status} · 金鑰被拒或權限不足")),
        404 => (false, "HTTP 404 · 模型或 API 路徑不存在".into()),
        429 => (false, "HTTP 429 · 被限流，實測未完成".into()),
        0 => {
            let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let short = error.lines().last().unwrap_or("連線失敗").to_string();
            (false, format!("無法連線：{short}"))
        }
        other => (false, format!("HTTP {other} · 模型實測失敗")),
    };
    TestResult { ok, status, ms, message }
}

#[cfg(test)]
mod tests {
    use super::{body_lists_model, discover_models, live_test_request, parse_model_catalogue, probe_model};
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
    fn model_catalogue_preserves_metadata_and_deduplicates() {
        let models = parse_model_catalogue(r#"{
          "data": [
            {
              "id": "glm-5.3-flash",
              "display_name": "GLM 5.3 Flash",
              "context_window": 128000,
              "max_output_tokens": 16384,
              "capabilities": { "reasoning": true, "vision": false, "tools": true }
            },
            { "id": "glm-5.3-flash", "display_name": "Duplicate" },
            { "id": "qwen2.5-coder:14b", "name": "Qwen Coder" }
          ]
        }"#)
        .unwrap();
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "glm-5.3-flash");
        assert_eq!(models[0].name, "GLM 5.3 Flash");
        assert_eq!(models[0].context_window, Some(128000));
        assert_eq!(models[0].max_output, Some(16384));
        assert_eq!(models[0].reasoning, Some(true));
        assert_eq!(models[0].tools, Some(true));
        assert_eq!(models[0].metadata["display_name"], "GLM 5.3 Flash");
    }

    #[test]
    fn model_catalogue_supports_keyed_and_wrapped_shapes() {
        let keyed = parse_model_catalogue(r#"{
          "models": {
            "anthropic/claude-sonnet": { "name": "Claude Sonnet" },
            "local/qwen3": { "name": "Qwen 3" }
          }
        }"#)
        .unwrap();
        assert_eq!(keyed.len(), 2);
        assert_eq!(keyed[0].id, "anthropic/claude-sonnet");

        let wrapped = parse_model_catalogue(r#"{
          "result": { "data": ["model-a", "model-b"] }
        }"#)
        .unwrap();
        assert_eq!(wrapped.len(), 2);
        assert_eq!(wrapped[1].id, "model-b");
    }

    #[test]
    fn model_catalogue_supports_gemini_and_ollama_shapes() {
        let gemini = parse_model_catalogue(r#"{
          "models": [{
            "name": "models/gemini-2.5-pro",
            "displayName": "Gemini 2.5 Pro",
            "inputTokenLimit": 1048576,
            "outputTokenLimit": 65536
          }]
        }"#)
        .unwrap();
        assert_eq!(gemini[0].id, "gemini-2.5-pro");
        assert_eq!(gemini[0].name, "Gemini 2.5 Pro");
        assert_eq!(gemini[0].context_window, Some(1048576));
        assert_eq!(gemini[0].max_output, Some(65536));

        let ollama = parse_model_catalogue(r#"{
          "models": [{ "name": "qwen2.5-coder:14b", "size": 9000000000u64 }]
        }"#.replace("9000000000u64", "9000000000").as_str())
        .unwrap();
        assert_eq!(ollama[0].id, "qwen2.5-coder:14b");
    }

    #[test]
    fn model_discovery_reads_a_local_catalogue() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let address = server.server_addr().to_ip().unwrap();
        let join = thread::spawn(move || {
            let request = server
                .recv_timeout(Duration::from_secs(5))
                .expect("local discovery request")
                .expect("catalogue request");
            let response = tiny_http::Response::from_string(
                r#"{"data":[{"id":"alpha","context_window":64000},{"id":"beta"}]}"#,
            )
            .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
            request.respond(response).unwrap();
        });

        let discovery = discover_models(&format!("http://{address}"), "", false).unwrap();
        join.join().unwrap();
        assert_eq!(discovery.models.len(), 2);
        assert_eq!(discovery.models[0].id, "alpha");
        assert_eq!(discovery.models[0].context_window, Some(64000));
        assert!(discovery.endpoint.ends_with("/models"));
    }

    #[test]
    fn live_test_uses_provider_specific_request_shapes() {
        let (chat_path, chat_body) = live_test_request("codex", "chat", "gpt-test");
        assert_eq!(chat_path, "/chat/completions");
        assert!(chat_body.contains("gpt-test"));

        let (responses_path, responses_body) = live_test_request("codex", "responses", "gpt-test");
        assert_eq!(responses_path, "/responses");
        assert!(responses_body.contains("max_output_tokens"));

        let (claude_path, claude_body) = live_test_request("claude", "", "claude-test");
        assert_eq!(claude_path, "/messages");
        assert!(claude_body.contains("max_tokens"));

        let (gemini_path, gemini_body) = live_test_request("gemini", "", "gemini-test");
        assert!(gemini_path.contains(":generateContent"));
        assert!(gemini_body.contains("maxOutputTokens"));
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

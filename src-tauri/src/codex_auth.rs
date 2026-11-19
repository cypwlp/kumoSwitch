use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
static REFRESH_LOCK: Mutex<()> = Mutex::new(());

fn auth_path() -> PathBuf {
    if let Some(home) = std::env::var_os("CODEX_HOME") {
        return PathBuf::from(home).join("auth.json");
    }
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_default()
        .join(".codex")
        .join("auth.json")
}

/// Local ChatGPT credentials for the Codex gateway. Codex itself runs in
/// API-key mode so it accepts both GPT and routed third-party model slugs;
/// the gateway attaches these headers only when talking to ChatGPT.
pub fn headers() -> Result<Vec<(String, String)>, String> {
    let auth = load_fresh()?;
    let tokens = auth
        .get("tokens")
        .ok_or("Codex auth.json 沒有 tokens")?;
    let access = tokens
        .get("access_token")
        .and_then(Value::as_str)
        .unwrap_or("");
    if access.trim().is_empty() {
        return Err("Codex 尚未登入 ChatGPT（auth.json 沒有 access token）".into());
    }
    let mut headers = vec![("authorization".to_string(), format!("Bearer {access}"))];
    if let Some(account) = tokens.get("account_id").and_then(Value::as_str) {
        if !account.trim().is_empty() {
            headers.push(("chatgpt-account-id".to_string(), account.to_string()));
        }
    }
    Ok(headers)
}

fn load_fresh() -> Result<Value, String> {
    let path = auth_path();
    let auth = read_auth(&path)?;
    if token_is_fresh(&auth) {
        return Ok(auth);
    }
    let _guard = REFRESH_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let auth = read_auth(&path)?;
    if token_is_fresh(&auth) {
        return Ok(auth);
    }
    refresh(&path, auth)
}

fn read_auth(path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(path)
        .map_err(|error| format!("讀取 Codex 登入憑證失敗：{error}"))?;
    serde_json::from_str(&text)
        .map_err(|error| format!("解析 Codex 登入憑證失敗：{error}"))
}

fn token_is_fresh(auth: &Value) -> bool {
    let Some(access) = auth
        .get("tokens")
        .and_then(|tokens| tokens.get("access_token"))
        .and_then(Value::as_str)
    else {
        return false;
    };
    match jwt_exp(access) {
        Some(exp) => exp > now_secs() + 120,
        None => true,
    }
}

fn jwt_exp(token: &str) -> Option<i64> {
    let payload = token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload).ok()?;
    let value: Value = serde_json::from_slice(&bytes).ok()?;
    value.get("exp")?.as_i64()
}

fn refresh(path: &Path, mut auth: Value) -> Result<Value, String> {
    let refresh_token = auth
        .get("tokens")
        .and_then(|tokens| tokens.get("refresh_token"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or("ChatGPT 登入憑證已過期，且沒有 refresh token")?
        .to_string();
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("kumoswitch")
        .build()
        .map_err(|error| format!("建立 ChatGPT 刷新 client 失敗：{error}"))?;
    let body = serde_json::json!({
        "client_id": CLIENT_ID,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    });
    let response = client
        .post(TOKEN_URL)
        .json(&body)
        .send()
        .map_err(|error| format!("ChatGPT token 刷新連線失敗：{error}"))?;
    let status = response.status();
    let text = response.text().unwrap_or_default();
    if !status.is_success() {
        return Err(format!("ChatGPT token 刷新失敗：HTTP {}", status.as_u16()));
    }
    let data: Value = serde_json::from_str(&text)
        .map_err(|error| format!("ChatGPT token 刷新回應格式無效：{error}"))?;
    let access = data
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or("ChatGPT token 刷新回應缺少 access_token")?
        .to_string();
    {
        let tokens = auth
            .get_mut("tokens")
            .and_then(Value::as_object_mut)
            .ok_or("Codex auth.json 缺少 tokens")?;
        tokens.insert("access_token".into(), Value::String(access));
        if let Some(value) = data.get("refresh_token").and_then(Value::as_str) {
            tokens.insert("refresh_token".into(), Value::String(value.to_string()));
        }
        if let Some(value) = data.get("id_token").and_then(Value::as_str) {
            tokens.insert("id_token".into(), Value::String(value.to_string()));
        }
    }
    auth["last_refresh"] = Value::String(now_rfc3339());
    let text = serde_json::to_string_pretty(&auth)
        .map_err(|error| format!("序列化 Codex 憑證失敗：{error}"))?;
    fs::write(path, text).map_err(|error| format!("寫回 Codex 憑證失敗：{error}"))?;
    Ok(auth)
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn now_rfc3339() -> String {
    let seconds = now_secs();
    let days = seconds.div_euclid(86_400);
    let rest = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.000000000Z",
        rest / 3_600,
        (rest % 3_600) / 60,
        rest % 60
    )
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { y + 1 } else { y }, month, day)
}

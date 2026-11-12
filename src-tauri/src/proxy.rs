//! Local reverse proxy with ordered failover ("aggregate mode").
//!
//! The CLI tools point at `http://127.0.0.1:<port>/v1`; we forward each request
//! to the configured stack of providers in order, failing over on connection
//! errors, 429 and 5xx. Responses stream straight through.

use std::collections::{BTreeMap, VecDeque};
use std::io::{self, Read};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MAX_REQUEST_BODY_BYTES: usize = 32 * 1024 * 1024;

static HTTP_CLIENT: OnceLock<Result<reqwest::blocking::Client, String>> = OnceLock::new();

fn shared_client() -> Result<&'static reqwest::blocking::Client, String> {
    HTTP_CLIENT
        .get_or_init(|| {
            reqwest::blocking::Client::builder()
                .connect_timeout(Duration::from_secs(15))
                .pool_idle_timeout(Duration::from_secs(90))
                .pool_max_idle_per_host(32)
                .tcp_keepalive(Duration::from_secs(60))
                .build()
                .map_err(|error| format!("無法建立代理 HTTP client：{error}"))
        })
        .as_ref()
        .map_err(Clone::clone)
}

#[derive(Debug, PartialEq, Eq)]
enum BodyReadError {
    TooLarge,
    Io(String),
}

fn read_body_limited<R: Read + ?Sized>(reader: &mut R, limit: usize) -> Result<Vec<u8>, BodyReadError> {
    let mut body = Vec::new();
    reader
        .take((limit as u64).saturating_add(1))
        .read_to_end(&mut body)
        .map_err(|error| BodyReadError::Io(error.to_string()))?;
    if body.len() > limit {
        Err(BodyReadError::TooLarge)
    } else {
        Ok(body)
    }
}

struct Runtime {
    server: Option<Arc<tiny_http::Server>>,
    port: u16,
}

static RUNTIME: Mutex<Runtime> = Mutex::new(Runtime { server: None, port: 0 });

fn runtime() -> MutexGuard<'static, Runtime> {
    RUNTIME.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RoutingStrategy {
    Ordered,
    Priority,
    Weighted,
    Health,
}

impl Default for RoutingStrategy {
    fn default() -> Self {
        Self::Ordered
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ProxyTargetPolicy {
    #[serde(default = "default_weight")]
    pub weight: u32,
    #[serde(default)]
    pub priority: i32,
    #[serde(default = "default_target_timeout")]
    pub timeout_secs: u64,
    #[serde(default = "default_failure_cooldown")]
    pub failure_cooldown_secs: u64,
    #[serde(default = "default_429_cooldown")]
    pub backoff_429_secs: u64,
    #[serde(default = "default_failure_threshold")]
    pub failure_threshold: u32,
    #[serde(default = "default_max_concurrency")]
    pub max_concurrency: usize,
}

fn default_weight() -> u32 { 100 }
fn default_target_timeout() -> u64 { 30 }
fn default_failure_cooldown() -> u64 { 60 }
fn default_429_cooldown() -> u64 { 30 }
fn default_failure_threshold() -> u32 { 3 }
fn default_max_concurrency() -> usize { 16 }

impl Default for ProxyTargetPolicy {
    fn default() -> Self {
        Self {
            weight: default_weight(),
            priority: 0,
            timeout_secs: default_target_timeout(),
            failure_cooldown_secs: default_failure_cooldown(),
            backoff_429_secs: default_429_cooldown(),
            failure_threshold: default_failure_threshold(),
            max_concurrency: default_max_concurrency(),
        }
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ProxyConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_port")]
    pub port: u16,
    /// Ordered stack of "tool:provider_id" refs.
    #[serde(default)]
    pub stack: Vec<String>,
    #[serde(default)]
    pub strategy: RoutingStrategy,
    /// Per-target routing and resiliency policy, keyed by "tool:provider_id".
    #[serde(default)]
    pub policies: BTreeMap<String, ProxyTargetPolicy>,
}

fn default_port() -> u16 {
    17890
}

impl Default for ProxyConfig {
    fn default() -> Self {
        ProxyConfig {
            enabled: false,
            port: default_port(),
            stack: Vec::new(),
            strategy: RoutingStrategy::Ordered,
            policies: BTreeMap::new(),
        }
    }
}

/// Join a provider base URL with the incoming request path without doubling /v1.
pub fn upstream_url(base: &str, path: &str) -> String {
    let base = base.trim_end_matches('/');
    let path = if path.starts_with('/') { path.to_string() } else { format!("/{path}") };
    if base.ends_with("/v1") && path.starts_with("/v1/") {
        format!("{base}{}", &path[3..])
    } else if base.ends_with("/v1") && path == "/v1" {
        base.to_string()
    } else {
        format!("{base}{path}")
    }
}

#[derive(Clone, Debug)]
struct Target {
    reference: String,
    base_url: String,
    api_key: String,
    anthropic: bool,
    policy: ProxyTargetPolicy,
}

#[derive(Clone, Default)]
struct TargetState {
    active: usize,
    requests: u64,
    successes: u64,
    failures: u64,
    failovers: u64,
    consecutive_failures: u32,
    open_until_ms: u64,
    total_ttfb_ms: u64,
    ttfb_samples: u64,
    last_ttfb_ms: u64,
    last_status: u16,
    last_used_ms: u64,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct ProxyLogEntry {
    pub ts: u64,
    pub target: String,
    pub event: String,
    pub status: Option<u16>,
    pub ttfb_ms: Option<u64>,
    pub message: String,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct TargetMetrics {
    pub active: usize,
    pub requests: u64,
    pub successes: u64,
    pub failures: u64,
    pub failovers: u64,
    pub success_rate: f64,
    pub consecutive_failures: u32,
    pub circuit_open_until: u64,
    pub last_ttfb_ms: u64,
    pub avg_ttfb_ms: u64,
    pub last_status: u16,
    pub last_used: u64,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct ProxyMetrics {
    pub strategy: String,
    pub targets: BTreeMap<String, TargetMetrics>,
    pub logs: Vec<ProxyLogEntry>,
}

static TARGET_STATE: Mutex<BTreeMap<String, TargetState>> = Mutex::new(BTreeMap::new());
static PROXY_LOGS: Mutex<VecDeque<ProxyLogEntry>> = Mutex::new(VecDeque::new());
static ROUTE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn target_states() -> MutexGuard<'static, BTreeMap<String, TargetState>> {
    TARGET_STATE.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn resolve_stack(config: &ProxyConfig) -> Vec<Target> {
    let store = crate::store::load();
    let mut out = Vec::new();
    for reference in &config.stack {
        let Some((tool, id)) = reference.split_once(':') else { continue };
        let Some(list) = store.providers.get(tool) else { continue };
        let Some(p) = list.iter().find(|p| p.id == id) else { continue };
        out.push(Target {
            reference: reference.clone(),
            base_url: p.base_url.clone(),
            api_key: p.api_key.clone(),
            anthropic: tool == "claude",
            policy: config.policies.get(reference).cloned().unwrap_or_default(),
        });
    }
    out
}

fn strategy_label(strategy: &RoutingStrategy) -> &'static str {
    match strategy {
        RoutingStrategy::Ordered => "ordered",
        RoutingStrategy::Priority => "priority",
        RoutingStrategy::Weighted => "weighted",
        RoutingStrategy::Health => "health",
    }
}

fn push_proxy_log(target: &str, event: &str, status: Option<u16>, ttfb_ms: Option<u64>, message: impl Into<String>) {
    let mut logs = PROXY_LOGS.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if logs.len() >= 200 {
        logs.pop_front();
    }
    logs.push_back(ProxyLogEntry {
        ts: now_ms(),
        target: target.to_string(),
        event: event.to_string(),
        status,
        ttfb_ms,
        message: message.into(),
    });
}

fn record_result(
    reference: &str,
    status: u16,
    ttfb_ms: u64,
    ok: bool,
    policy: &ProxyTargetPolicy,
    reason: Option<&str>,
) {
    let now = now_ms();
    let mut states = target_states();
    let state = states.entry(reference.to_string()).or_default();
    state.requests += 1;
    state.last_status = status;
    state.last_ttfb_ms = ttfb_ms;
    state.total_ttfb_ms += ttfb_ms;
    state.ttfb_samples += 1;
    state.last_used_ms = now;
    if ok {
        state.successes += 1;
        state.consecutive_failures = 0;
        state.open_until_ms = 0;
    } else {
        state.failures += 1;
        state.consecutive_failures = state.consecutive_failures.saturating_add(1);
        let cooldown = if status == 429 {
            policy.backoff_429_secs
        } else if state.consecutive_failures >= policy.failure_threshold.max(1) {
            policy.failure_cooldown_secs
        } else {
            0
        };
        if cooldown > 0 {
            state.open_until_ms = now.saturating_add(cooldown.saturating_mul(1000));
        }
    }
    drop(states);
    push_proxy_log(
        reference,
        if ok { "success" } else { "failure" },
        Some(status),
        Some(ttfb_ms),
        reason.unwrap_or(if ok { "OK" } else { "upstream failed" }),
    );
}

fn record_failover(reference: &str, reason: &str) {
    let mut states = target_states();
    if let Some(state) = states.get_mut(reference) {
        state.failovers += 1;
    }
    drop(states);
    push_proxy_log(reference, "failover", None, None, reason);
}

fn target_available(reference: &str, now: u64) -> bool {
    target_states()
        .get(reference)
        .map(|state| state.open_until_ms <= now)
        .unwrap_or(true)
}

fn ordered_targets(strategy: RoutingStrategy, targets: &[Target]) -> Vec<Target> {
    let mut ordered = targets.to_vec();
    let states = target_states();
    match strategy {
        RoutingStrategy::Priority => ordered.sort_by(|left, right| {
            right
                .policy
                .priority
                .cmp(&left.policy.priority)
                .then_with(|| right.policy.weight.cmp(&left.policy.weight))
        }),
        RoutingStrategy::Weighted => {
            let sequence = ROUTE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let count = ordered.len().max(1) as u64;
            ordered.sort_by_key(|target| {
                let requests = states.get(&target.reference).map(|state| state.requests).unwrap_or(0);
                let weight = u64::from(target.policy.weight.max(1));
                ((requests + 1) * 1_000 / weight, sequence % count)
            });
        }
        RoutingStrategy::Health => ordered.sort_by(|left, right| {
            let l = states.get(&left.reference).cloned().unwrap_or_default();
            let r = states.get(&right.reference).cloned().unwrap_or_default();
            l.consecutive_failures
                .cmp(&r.consecutive_failures)
                .then_with(|| {
                    let lr = if l.requests == 0 { 0.5 } else { l.successes as f64 / l.requests as f64 };
                    let rr = if r.requests == 0 { 0.5 } else { r.successes as f64 / r.requests as f64 };
                    rr.partial_cmp(&lr).unwrap_or(std::cmp::Ordering::Equal)
                })
                .then_with(|| {
                    let la = if l.ttfb_samples == 0 { u64::MAX } else { l.total_ttfb_ms / l.ttfb_samples };
                    let ra = if r.ttfb_samples == 0 { u64::MAX } else { r.total_ttfb_ms / r.ttfb_samples };
                    la.cmp(&ra)
                })
        }),
        RoutingStrategy::Ordered => {}
    }
    drop(states);
    let now = now_ms();
    let available: Vec<Target> = ordered
        .iter()
        .filter(|target| target_available(&target.reference, now))
        .cloned()
        .collect();
    if available.is_empty() { ordered } else { available }
}

struct TargetPermit {
    reference: String,
}

impl Drop for TargetPermit {
    fn drop(&mut self) {
        let mut states = target_states();
        if let Some(state) = states.get_mut(&self.reference) {
            state.active = state.active.saturating_sub(1);
        }
    }
}

fn acquire_target(reference: &str, max_concurrency: usize) -> Option<TargetPermit> {
    let mut states = target_states();
    let state = states.entry(reference.to_string()).or_default();
    if state.active >= max_concurrency.max(1) {
        return None;
    }
    state.active += 1;
    Some(TargetPermit { reference: reference.to_string() })
}

pub fn metrics() -> ProxyMetrics {
    let config = crate::store::load().proxy;
    let states = target_states();
    let targets = states
        .iter()
        .map(|(reference, state)| {
            let success_rate = if state.requests == 0 {
                0.0
            } else {
                state.successes as f64 / state.requests as f64
            };
            let avg_ttfb_ms = if state.ttfb_samples == 0 {
                0
            } else {
                state.total_ttfb_ms / state.ttfb_samples
            };
            (
                reference.clone(),
                TargetMetrics {
                    active: state.active,
                    requests: state.requests,
                    successes: state.successes,
                    failures: state.failures,
                    failovers: state.failovers,
                    success_rate,
                    consecutive_failures: state.consecutive_failures,
                    circuit_open_until: state.open_until_ms,
                    last_ttfb_ms: state.last_ttfb_ms,
                    avg_ttfb_ms,
                    last_status: state.last_status,
                    last_used: state.last_used_ms,
                },
            )
        })
        .collect();
    let logs = PROXY_LOGS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .iter()
        .cloned()
        .collect();
    ProxyMetrics {
        strategy: strategy_label(&config.strategy).into(),
        targets,
        logs,
    }
}

pub fn reset_metrics() {
    target_states().clear();
    PROXY_LOGS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clear();
}

fn is_hop_by_hop(name: &str) -> bool {
    matches!(
        name,
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

fn request_headers(headers: &[tiny_http::Header]) -> Vec<(String, String)> {
    headers
        .iter()
        .filter_map(|header| {
            let name = header.field.as_str().as_str().to_ascii_lowercase();
            if is_hop_by_hop(&name)
                || matches!(name.as_str(), "host" | "content-length" | "authorization" | "x-api-key")
            {
                return None;
            }
            Some((name, header.value.as_str().to_string()))
        })
        .collect()
}

fn response_headers(response: &reqwest::blocking::Response) -> Vec<(String, String)> {
    response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            let name = name.as_str().to_ascii_lowercase();
            if is_hop_by_hop(&name) || name == "content-length" {
                return None;
            }
            Some((name, value.to_str().unwrap_or("").to_string()))
        })
        .collect()
}

fn relay_response(
    request: tiny_http::Request,
    mut upstream: reqwest::blocking::Response,
    method: &str,
) {
    let status = upstream.status().as_u16();
    let version = request.http_version().clone();
    let headers = response_headers(&upstream);
    let suppress_body = method == "HEAD" || matches!(status, 100..=199 | 204 | 304);
    let chunked = version >= tiny_http::HTTPVersion(1, 1) && !suppress_body;
    let reason = reqwest::StatusCode::from_u16(status)
        .ok()
        .and_then(|code| code.canonical_reason())
        .unwrap_or("Proxy Response");

    // tiny_http::Response buffers the reader and only flushes after EOF. A raw
    // writer lets SSE chunks reach the CLI as soon as the upstream emits them.
    let mut writer = request.into_writer();
    let relay = (|| -> io::Result<()> {
        write!(writer, "HTTP/{}.{} {status} {reason}\r\n", version.0, version.1)?;
        for (name, value) in headers {
            write!(writer, "{name}: {value}\r\n")?;
        }
        if suppress_body {
            writer.write_all(b"Content-Length: 0\r\n")?;
        } else if chunked {
            writer.write_all(b"Transfer-Encoding: chunked\r\n")?;
        } else {
            writer.write_all(b"Connection: close\r\n")?;
        }
        writer.write_all(b"\r\n")?;
        writer.flush()?;

        if suppress_body {
            return Ok(());
        }

        let mut buffer = [0u8; 16 * 1024];
        loop {
            let count = match upstream.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => count,
                Err(error) => return Err(error),
            };
            if chunked {
                write!(writer, "{count:x}\r\n")?;
                writer.write_all(&buffer[..count])?;
                writer.write_all(b"\r\n")?;
            } else {
                writer.write_all(&buffer[..count])?;
            }
            writer.flush()?;
        }
        if chunked {
            writer.write_all(b"0\r\n\r\n")?;
        }
        writer.flush()
    })();
    let _ = relay;
}

fn handle(request: tiny_http::Request, config: ProxyConfig) {
    let targets = resolve_stack(&config);
    handle_with_routing_limit(request, config.enabled, config.strategy, targets, MAX_REQUEST_BODY_BYTES);
}

#[cfg(test)]
fn handle_with_targets(request: tiny_http::Request, enabled: bool, targets: Vec<Target>) {
    handle_with_routing_limit(request, enabled, RoutingStrategy::Ordered, targets, MAX_REQUEST_BODY_BYTES);
}

#[cfg(test)]
fn handle_with_targets_limit(request: tiny_http::Request, enabled: bool, targets: Vec<Target>, max_body_bytes: usize) {
    handle_with_routing_limit(request, enabled, RoutingStrategy::Ordered, targets, max_body_bytes);
}

fn handle_with_routing_limit(
    mut request: tiny_http::Request,
    enabled: bool,
    strategy: RoutingStrategy,
    targets: Vec<Target>,
    max_body_bytes: usize,
) {
    let method = request.method().as_str().to_string();
    let forwarded_headers = request_headers(request.headers());
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    let query = url.split_once('?').map(|(_, q)| format!("?{q}")).unwrap_or_default();

    let reader = request.as_reader();
    let body = match read_body_limited(reader, max_body_bytes) {
        Ok(body) => body,
        Err(BodyReadError::TooLarge) => {
            // Drain the rest without buffering it so tiny_http can keep the
            // connection framing intact before returning a clean 413.
            let _ = io::copy(reader, &mut io::sink());
            let response = tiny_http::Response::from_string(format!(
                r#"{{"error":"request body too large","limit_bytes":{max_body_bytes}}}"#
            ))
            .with_status_code(413)
            .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
            let _ = request.respond(response);
            return;
        }
        Err(BodyReadError::Io(error)) => {
            let response = tiny_http::Response::from_string(format!(
                r#"{{"error":"failed to read request body","detail":"{error}"}}"#
            ))
            .with_status_code(400)
            .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
            let _ = request.respond(response);
            return;
        }
    };
    let body = bytes::Bytes::from(body);

    if !enabled || targets.is_empty() {
        let resp = tiny_http::Response::from_string("{\"error\":\"kumoswitch proxy disabled or empty stack\"}")
            .with_status_code(503)
            .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
        let _ = request.respond(resp);
        return;
    }

    let client = match shared_client() {
        Ok(client) => client,
        Err(error) => {
            let response = tiny_http::Response::from_string(format!(
                r#"{{"error":"proxy client unavailable","detail":"{error}"}}"#
            ))
            .with_status_code(500)
            .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
            let _ = request.respond(response);
            return;
        }
    };

    let reqwest_method = reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::POST);
    let has_content_type = forwarded_headers.iter().any(|(name, _)| name == "content-type");
    let has_anthropic_version = forwarded_headers.iter().any(|(name, _)| name == "anthropic-version");

    let targets = ordered_targets(strategy, &targets);
    let all_unavailable = targets.iter().all(|target| !target_available(&target.reference, now_ms()));
    let mut last_status = 502u16;
    for target in &targets {
        if !all_unavailable && !target_available(&target.reference, now_ms()) {
            record_failover(&target.reference, "circuit open; skipped");
            continue;
        }
        let Some(_permit) = acquire_target(&target.reference, target.policy.max_concurrency) else {
            record_failover(&target.reference, "max concurrency reached; skipped");
            continue;
        };

        let upstream = format!("{}{}", upstream_url(&target.base_url, &path), query);
        let mut req = client
            .request(reqwest_method.clone(), &upstream)
            .timeout(Duration::from_secs(target.policy.timeout_secs.max(1)));
        for (name, value) in &forwarded_headers {
            req = req.header(name, value);
        }
        if target.anthropic {
            req = req.header("x-api-key", &target.api_key);
            if !has_anthropic_version {
                req = req.header("anthropic-version", "2023-06-01");
            }
        } else {
            req = req.header("Authorization", format!("Bearer {}", target.api_key));
        }
        if !has_content_type && !body.is_empty() {
            req = req.header("Content-Type", "application/json");
        }
        if !body.is_empty() {
            req = req.body(body.clone());
        }

        let started = Instant::now();
        let resp = match req.send() {
            Ok(response) => response,
            Err(error) => {
                let ttfb = started.elapsed().as_millis() as u64;
                let reason = if error.is_timeout() {
                    "upstream timeout"
                } else if error.is_connect() {
                    "upstream connection failed"
                } else {
                    "upstream request failed"
                };
                record_result(&target.reference, 0, ttfb, false, &target.policy, Some(reason));
                record_failover(&target.reference, reason);
                last_status = 502;
                continue;
            }
        };
        let ttfb = started.elapsed().as_millis() as u64;
        let status = resp.status().as_u16();
        if status == 429 || status >= 500 {
            let reason = if status == 429 {
                "upstream rate limited (429); cooling down"
            } else {
                "upstream server error; failing over"
            };
            record_result(&target.reference, status, ttfb, false, &target.policy, Some(reason));
            record_failover(&target.reference, reason);
            last_status = status;
            continue;
        }
        record_result(&target.reference, status, ttfb, true, &target.policy, None);
        relay_response(request, resp, &method);
        return;
    }

    let resp = tiny_http::Response::from_string(format!("{{\"error\":\"all providers failed\",\"last_status\":{last_status}}}"))
        .with_status_code(last_status)
        .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
    let _ = request.respond(resp);
}

/// Start or restart the proxy listener so a changed port takes effect immediately.
fn start_listener(port: u16) -> Result<(), String> {
    let mut state = runtime();
    if state.server.is_some() && state.port == port {
        return Ok(());
    }

    if let Some(previous) = state.server.take() {
        previous.unblock();
    }
    state.port = 0;

    let addr = format!("127.0.0.1:{port}");
    let server = tiny_http::Server::http(&addr)
        .map_err(|error| format!("無法在 {addr} 啟動代理：{error}"))?;
    let server = Arc::new(server);
    state.server = Some(Arc::clone(&server));
    state.port = port;

    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let config = crate::store::load().proxy;
            std::thread::spawn(move || handle(request, config));
        }
    });
    Ok(())
}

pub fn start() -> Result<(), String> {
    start_listener(crate::store::load().proxy.port)
}

#[cfg(test)]
fn stop_listener() {
    let mut state = runtime();
    if let Some(server) = state.server.take() {
        server.unblock();
    }
    state.port = 0;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::{SocketAddr, TcpListener, TcpStream};
    use std::sync::{mpsc, Arc, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};

    #[derive(Debug)]
    struct CapturedRequest {
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: String,
    }

    fn local_url(server: &tiny_http::Server) -> String {
        let addr = server.server_addr().to_ip().expect("local TCP listener");
        format!("http://{addr}")
    }

    fn header<'a>(request: &'a CapturedRequest, name: &str) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    fn spawn_upstream(
        status: u16,
        tag: &'static str,
    ) -> (String, Arc<Mutex<Vec<CapturedRequest>>>, thread::JoinHandle<()>) {
        let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").unwrap());
        let url = local_url(&server);
        let captured = Arc::new(Mutex::new(Vec::new()));
        let seen = Arc::clone(&captured);
        let join = thread::spawn(move || {
            let mut request = server
                .recv_timeout(Duration::from_secs(10))
                .expect("upstream receive")
                .expect("upstream request");
            let method = request.method().as_str().to_string();
            let headers = request
                .headers()
                .iter()
                .map(|h| {
                    (
                        h.field.as_str().as_str().to_ascii_lowercase(),
                        h.value.as_str().to_string(),
                    )
                })
                .collect();
            let url = request.url().to_string();
            let mut body = String::new();
            request.as_reader().read_to_string(&mut body).unwrap();
            seen.lock().unwrap().push(CapturedRequest { method, url, headers, body });

            let payload = format!(r#"{{"mock":"{tag}"}}"#);
            let response = tiny_http::Response::from_string(payload)
                .with_status_code(status)
                .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
            let _ = request.respond(response);
        });
        (url, captured, join)
    }

    fn spawn_proxy(targets: Vec<Target>) -> (String, thread::JoinHandle<()>) {
        spawn_proxy_with_limit(targets, MAX_REQUEST_BODY_BYTES)
    }

    fn spawn_proxy_with_limit(
        targets: Vec<Target>,
        max_body_bytes: usize,
    ) -> (String, thread::JoinHandle<()>) {
        let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").unwrap());
        let url = local_url(&server);
        let join = thread::spawn(move || {
            let request = server
                .recv_timeout(Duration::from_secs(10))
                .expect("proxy receive")
                .expect("proxy request");
            handle_with_targets_limit(request, true, targets, max_body_bytes);
        });
        (url, join)
    }

    fn write_sse_chunk(stream: &mut TcpStream, payload: &[u8]) {
        write!(stream, "{:x}\r\n", payload.len()).unwrap();
        stream.write_all(payload).unwrap();
        stream.write_all(b"\r\n").unwrap();
    }

    /// Minimal chunked SSE upstream. It sends the first event and then waits
    /// for the test to release the second event, proving the proxy did not
    /// buffer the whole response before forwarding it.
    fn spawn_sse_upstream() -> (String, mpsc::Sender<()>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (finish_tx, finish_rx) = mpsc::channel();
        let join = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("SSE client");
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            stream
                .set_write_timeout(Some(Duration::from_secs(5)))
                .unwrap();

            let mut request = Vec::new();
            let mut buffer = [0u8; 1024];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let read = stream.read(&mut buffer).expect("upstream request read");
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..read]);
                assert!(request.len() < 64 * 1024, "request headers too large");
            }

            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
                )
                .unwrap();
            write_sse_chunk(&mut stream, b"data: first\n\n");
            stream.flush().unwrap();

            finish_rx
                .recv_timeout(Duration::from_secs(15))
                .expect("release second SSE event");
            write_sse_chunk(&mut stream, b"data: second\n\n");
            stream.write_all(b"0\r\n\r\n").unwrap();
            stream.flush().unwrap();
        });
        (url, finish_tx, join)
    }

    fn spawn_sse_stress_upstream(
        connections: usize,
        events: usize,
    ) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let join = thread::spawn(move || {
            let mut workers = Vec::new();
            for _ in 0..connections {
                let (mut stream, _) = listener.accept().expect("stress SSE client");
                workers.push(thread::spawn(move || {
                    stream
                        .set_read_timeout(Some(Duration::from_secs(5)))
                        .unwrap();
                    stream
                        .set_write_timeout(Some(Duration::from_secs(5)))
                        .unwrap();
                    let mut request = Vec::new();
                    let mut buffer = [0u8; 1024];
                    while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                        let read = stream.read(&mut buffer).expect("stress request read");
                        if read == 0 {
                            break;
                        }
                        request.extend_from_slice(&buffer[..read]);
                    }
                    stream
                        .write_all(
                            b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
                        )
                        .unwrap();
                    for index in 0..events {
                        let event = format!("data: event-{index}\n\n");
                        write_sse_chunk(&mut stream, event.as_bytes());
                        stream.flush().unwrap();
                    }
                    stream.write_all(b"0\r\n\r\n").unwrap();
                    stream.flush().unwrap();
                }));
            }
            for worker in workers {
                worker.join().unwrap();
            }
        });
        (url, join)
    }

    fn spawn_proxy_many(
        targets: Vec<Target>,
        requests: usize,
    ) -> (String, thread::JoinHandle<()>) {
        let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").unwrap());
        let url = local_url(&server);
        let join = thread::spawn(move || {
            let mut workers = Vec::new();
            for _ in 0..requests {
                let request = server
                    .recv_timeout(Duration::from_secs(30))
                    .expect("stress proxy receive")
                    .expect("stress proxy request");
                let targets = targets.clone();
                workers.push(thread::spawn(move || {
                    handle_with_targets(request, true, targets);
                }));
            }
            for worker in workers {
                worker.join().unwrap();
            }
        });
        (url, join)
    }

    fn spawn_stalling_upstream() -> (String, Arc<Mutex<Vec<CapturedRequest>>>, thread::JoinHandle<()>) {
        let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").unwrap());
        let url = local_url(&server);
        let captured = Arc::new(Mutex::new(Vec::new()));
        let seen = Arc::clone(&captured);
        let join = thread::spawn(move || {
            let mut request = server
                .recv_timeout(Duration::from_secs(10))
                .expect("stall upstream receive")
                .expect("stall upstream request");
            let method = request.method().as_str().to_string();
            let headers = request.headers().iter().map(|header| {
                (header.field.as_str().as_str().to_ascii_lowercase(), header.value.as_str().to_string())
            }).collect();
            let url = request.url().to_string();
            let mut body = String::new();
            request.as_reader().read_to_string(&mut body).unwrap();
            seen.lock().unwrap().push(CapturedRequest { method, url, headers, body });
            thread::sleep(Duration::from_millis(2200));
            let _ = request.respond(tiny_http::Response::from_string("late").with_status_code(200));
        });
        (url, captured, join)
    }

    fn target(base_url: String, api_key: &str) -> Target {
        Target {
            reference: base_url.clone(),
            base_url,
            api_key: api_key.into(),
            anthropic: false,
            policy: ProxyTargetPolicy::default(),
        }
    }

    fn anthropic_target(base_url: String, api_key: &str) -> Target {
        Target {
            reference: base_url.clone(),
            base_url,
            api_key: api_key.into(),
            anthropic: true,
            policy: ProxyTargetPolicy::default(),
        }
    }

    fn send_through_proxy(proxy_url: &str) -> reqwest::blocking::Response {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap();
        client
            .post(format!("{proxy_url}/v1/chat/completions?trace=1"))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer client-fake")
            .header("x-api-key", "client-fake")
            .body(r#"{"model":"e2e-model","messages":[]}"#)
            .send()
            .expect("proxy response")
    }

    fn assert_forwarded(request: &CapturedRequest, api_key: &str) {
        let expected_auth = format!("Bearer {api_key}");
        assert_eq!(request.method, "POST");
        assert_eq!(request.url, "/v1/chat/completions?trace=1");
        assert_eq!(header(request, "authorization"), Some(expected_auth.as_str()));
        assert_eq!(header(request, "x-api-key"), None);
        assert_eq!(header(request, "content-type"), Some("application/json"));
        assert!(request.body.contains(r#""model":"e2e-model""#), "body was {}", request.body);
    }

    fn free_port() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.local_addr().unwrap().port()
    }

    fn port_open(port: u16) -> bool {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        TcpStream::connect_timeout(&addr, Duration::from_millis(150)).is_ok()
    }

    fn wait_until(mut condition: impl FnMut() -> bool) -> bool {
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(3) {
            if condition() {
                return true;
            }
            thread::sleep(Duration::from_millis(25));
        }
        false
    }

    #[test]
    fn url_join_does_not_double_v1() {
        assert_eq!(upstream_url("https://x/v1", "/v1/chat/completions"), "https://x/v1/chat/completions");
        assert_eq!(upstream_url("https://x/v1/", "/v1/responses"), "https://x/v1/responses");
        assert_eq!(upstream_url("https://x", "/v1/messages"), "https://x/v1/messages");
        assert_eq!(upstream_url("https://x/v1", "/v1"), "https://x/v1");
    }

    #[test]
    fn body_reader_enforces_the_configured_limit() {
        let mut exact = std::io::Cursor::new(b"1234".to_vec());
        assert_eq!(read_body_limited(&mut exact, 4).unwrap(), b"1234");

        let mut oversized = std::io::Cursor::new(b"12345".to_vec());
        assert_eq!(
            read_body_limited(&mut oversized, 4),
            Err(BodyReadError::TooLarge)
        );
    }

    #[test]
    fn proxy_rejects_oversized_body_with_413() {
        let (proxy_url, proxy_join) = spawn_proxy_with_limit(Vec::new(), 4);
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        let response = client
            .post(format!("{proxy_url}/v1/chat/completions"))
            .body("12345")
            .send()
            .expect("413 response");
        assert_eq!(response.status().as_u16(), 413);
        let body = response.text().unwrap();
        assert!(body.contains(r#""limit_bytes":4"#), "unexpected body: {body}");
        proxy_join.join().unwrap();
    }

    #[test]
    fn shared_http_client_is_reused() {
        let first = shared_client().unwrap();
        let second = shared_client().unwrap();
        assert!(std::ptr::eq(first, second));
    }

    #[test]
    fn sse_is_streamed_before_upstream_finishes() {
        let (upstream_url, release_upstream, upstream_join) = spawn_sse_upstream();
        let (proxy_url, proxy_join) = spawn_proxy(vec![target(upstream_url, "sse-key")]);
        let (first_tx, first_rx) = mpsc::channel();
        let client_join = thread::spawn(move || {
            let client = reqwest::blocking::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(20))
                .build()
                .unwrap();
            let response = client
                .post(format!("{proxy_url}/v1/responses"))
                .header("Content-Type", "application/json")
                .body(r#"{"stream":true}"#)
                .send()
                .expect("SSE response");
            assert_eq!(response.status().as_u16(), 200);
            let mut reader = BufReader::new(response);
            let mut first = String::new();
            reader.read_line(&mut first).expect("first SSE line");
            first_tx.send(first.clone()).expect("report first SSE line");
            let mut rest = String::new();
            reader.read_to_string(&mut rest).expect("remaining SSE body");
            (first, rest)
        });

        let first = first_rx.recv_timeout(Duration::from_secs(10));
        release_upstream.send(()).expect("release SSE upstream");
        upstream_join.join().unwrap();
        proxy_join.join().unwrap();
        let (line, rest) = client_join.join().unwrap();

        assert_eq!(
            first.expect("proxy buffered SSE until the upstream completed"),
            "data: first\n"
        );
        assert_eq!(line, "data: first\n");
        assert!(rest.contains("data: second\n"), "unexpected tail: {rest}");
    }

    #[test]
    fn concurrent_sse_streams_complete_without_cross_talk() {
        const CONNECTIONS: usize = 6;
        const EVENTS: usize = 8;
        let (upstream_url, upstream_join) = spawn_sse_stress_upstream(CONNECTIONS, EVENTS);
        let (proxy_url, proxy_join) = spawn_proxy_many(
            vec![target(upstream_url, "stress-key")],
            CONNECTIONS,
        );
        let mut workers = Vec::new();
        for index in 0..CONNECTIONS {
            let proxy_url = proxy_url.clone();
            workers.push(thread::spawn(move || {
                let client = reqwest::blocking::Client::builder()
                    .timeout(Duration::from_secs(30))
                    .pool_max_idle_per_host(0)
                    .build()
                    .unwrap();
                let response = client
                    .post(format!("{proxy_url}/v1/responses"))
                    .header("Content-Type", "application/json")
                    .header("Connection", "close")
                    .body(format!(r#"{{"stream":true,"request":{index}}}"#))
                    .send()
                    .expect("stress proxy response");
                assert_eq!(response.status().as_u16(), 200);
                response.text().expect("stress SSE body")
            }));
        }

        for body in workers.into_iter().map(|worker| worker.join().unwrap()) {
            for index in 0..EVENTS {
                assert!(body.contains(&format!("data: event-{index}\n")), "missing event {index}: {body}");
            }
            assert!(body.contains("data: event-7\n"));
        }

        proxy_join.join().unwrap();
        upstream_join.join().unwrap();
    }

    #[test]
    fn target_timeout_fails_over_to_the_next_provider() {
        let (slow_url, _slow_seen, slow_join) = spawn_stalling_upstream();
        let (good_url, good_seen, good_join) = spawn_upstream(200, "good");
        let mut slow = target(slow_url, "slow-key");
        slow.policy.timeout_secs = 1;
        let (proxy_url, proxy_join) = spawn_proxy(vec![slow, target(good_url, "good-key")]);

        let response = send_through_proxy(&proxy_url);
        assert_eq!(response.status().as_u16(), 200);
        assert!(response.text().unwrap().contains(r#""mock":"good""#));

        proxy_join.join().unwrap();
        good_join.join().unwrap();
        slow_join.join().unwrap();
        assert_eq!(good_seen.lock().unwrap().len(), 1);
    }

    #[test]
    fn routing_strategy_orders_by_priority() {
        let mut low = target("http://low.invalid".into(), "low");
        low.reference = "test:low".into();
        low.policy.priority = 1;
        let mut high = target("http://high.invalid".into(), "high");
        high.reference = "test:high".into();
        high.policy.priority = 10;
        let ordered = ordered_targets(RoutingStrategy::Priority, &[low, high]);
        assert_eq!(ordered[0].reference, "test:high");
    }

    #[test]
    fn health_strategy_prefers_successful_known_targets() {
        let steady = target("http://steady.invalid".into(), "steady");
        let shaky = target("http://shaky.invalid".into(), "shaky");
        let fresh = target("http://fresh.invalid".into(), "fresh");
        let fresh_reference = fresh.reference.clone();
        let references = [&steady.reference, &shaky.reference, &fresh.reference];
        {
            let mut states = target_states();
            for reference in references {
                states.remove(reference.as_str());
            }
            states.insert(steady.reference.clone(), TargetState {
                requests: 10,
                successes: 10,
                total_ttfb_ms: 900,
                ttfb_samples: 10,
                ..TargetState::default()
            });
            states.insert(shaky.reference.clone(), TargetState {
                requests: 10,
                successes: 6,
                failures: 4,
                total_ttfb_ms: 500,
                ttfb_samples: 10,
                ..TargetState::default()
            });
        }
        let ordered = ordered_targets(RoutingStrategy::Health, &[shaky.clone(), fresh, steady.clone()]);
        assert_eq!(ordered[0].reference, steady.reference);
        assert_eq!(ordered[1].reference, shaky.reference);
        assert_eq!(ordered[2].reference, fresh_reference);
    }

    #[test]
    fn rate_limit_opens_backoff_even_below_failure_threshold() {
        let mut item = target("http://rate-limit.invalid".into(), "rate-limit");
        item.reference = "test:rate-limit".into();
        item.policy.failure_threshold = 10;
        item.policy.backoff_429_secs = 30;
        record_result(&item.reference, 429, 12, false, &item.policy, Some("rate limited"));
        assert!(!target_available(&item.reference, now_ms()));
        assert!(metrics().targets.get("test:rate-limit").unwrap().circuit_open_until > now_ms());
    }

    #[test]
    fn circuit_breaker_opens_and_cooldown_is_reported() {
        let mut item = target("http://circuit.invalid".into(), "circuit");
        item.reference = "test:circuit".into();
        item.policy.failure_threshold = 2;
        item.policy.failure_cooldown_secs = 60;
        record_result(&item.reference, 500, 20, false, &item.policy, Some("boom"));
        assert!(target_available(&item.reference, now_ms()));
        record_result(&item.reference, 500, 20, false, &item.policy, Some("boom"));
        assert!(!target_available(&item.reference, now_ms()));
        let metrics = metrics();
        let metric = metrics.targets.get("test:circuit").unwrap();
        assert_eq!(metric.failures, 2);
        assert!(metric.circuit_open_until > now_ms());
    }

    #[test]
    fn max_concurrency_rejects_parallel_target_attempts() {
        let first = acquire_target("test:concurrency", 1).expect("first permit");
        assert!(acquire_target("test:concurrency", 1).is_none());
        drop(first);
        assert!(acquire_target("test:concurrency", 1).is_some());
    }

    #[test]
    fn proxy_fails_over_from_500_to_200_and_preserves_request() {
        let (bad_url, bad_seen, bad_join) = spawn_upstream(500, "bad");
        let (good_url, good_seen, good_join) = spawn_upstream(200, "good");
        let (proxy_url, proxy_join) = spawn_proxy(vec![
            target(bad_url, "bad-key"),
            target(good_url, "good-key"),
        ]);

        let response = send_through_proxy(&proxy_url);
        assert_eq!(response.status().as_u16(), 200);
        let body = response.text().unwrap();
        assert!(body.contains(r#""mock":"good""#), "unexpected body: {body}");

        proxy_join.join().unwrap();
        bad_join.join().unwrap();
        good_join.join().unwrap();

        let bad = bad_seen.lock().unwrap();
        let good = good_seen.lock().unwrap();
        assert_eq!(bad.len(), 1, "first upstream should receive one request");
        assert_eq!(good.len(), 1, "second upstream should receive one request");
        assert_forwarded(&bad[0], "bad-key");
        assert_forwarded(&good[0], "good-key");
    }

    #[test]
    fn proxy_fails_over_from_connection_error_to_200() {
        let dead_port = free_port();
        let (good_url, good_seen, good_join) = spawn_upstream(200, "good");
        let (proxy_url, proxy_join) = spawn_proxy(vec![
            target(format!("http://127.0.0.1:{dead_port}"), "dead-key"),
            target(good_url, "good-key"),
        ]);

        let response = send_through_proxy(&proxy_url);
        assert_eq!(response.status().as_u16(), 200);
        let body = response.text().unwrap();
        assert!(body.contains(r#""mock":"good""#), "unexpected body: {body}");

        proxy_join.join().unwrap();
        good_join.join().unwrap();

        let good = good_seen.lock().unwrap();
        assert_eq!(good.len(), 1, "healthy upstream should receive one request");
        assert_forwarded(&good[0], "good-key");
    }

    #[test]
    fn proxy_forwards_method_and_anthropic_headers() {
        let (upstream_url, seen, upstream_join) = spawn_upstream(200, "good");
        let (proxy_url, proxy_join) = spawn_proxy(vec![anthropic_target(upstream_url, "anthropic-key")]);

        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap();
        let response = client
            .patch(format!("{proxy_url}/v1/messages?beta=1"))
            .header("Content-Type", "application/json")
            .header("anthropic-beta", "tools-2024-04-04")
            .header("anthropic-version", "2024-06-01")
            .header("x-client-trace", "trace-123")
            .header("Authorization", "Bearer client-fake")
            .header("x-api-key", "client-fake")
            .body(r#"{"model":"e2e-model","messages":[]}"#)
            .send()
            .expect("proxy response");
        assert_eq!(response.status().as_u16(), 200);

        proxy_join.join().unwrap();
        upstream_join.join().unwrap();

        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].method, "PATCH");
        assert_eq!(seen[0].url, "/v1/messages?beta=1");
        assert_eq!(header(&seen[0], "x-api-key"), Some("anthropic-key"));
        assert_eq!(header(&seen[0], "anthropic-beta"), Some("tools-2024-04-04"));
        assert_eq!(header(&seen[0], "anthropic-version"), Some("2024-06-01"));
        assert_eq!(header(&seen[0], "x-client-trace"), Some("trace-123"));
        assert_eq!(header(&seen[0], "authorization"), None);
        assert_eq!(header(&seen[0], "content-type"), Some("application/json"));
    }

    #[test]
    fn listener_restarts_when_port_changes() {
        let first = free_port();
        let mut second = free_port();
        while second == first {
            second = free_port();
        }

        start_listener(first).unwrap();
        assert!(port_open(first), "first listener should accept connections");
        start_listener(second).unwrap();
        assert!(port_open(second), "second listener should accept connections");
        assert!(
            wait_until(|| !port_open(first)),
            "old listener should close after the port changes"
        );
        stop_listener();
    }
}

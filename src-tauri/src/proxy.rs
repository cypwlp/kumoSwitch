//! Local reverse proxy with ordered failover ("aggregate mode").
//!
//! The CLI tools point at `http://127.0.0.1:<port>/v1`; we forward each request
//! to the configured stack of providers in order, failing over on connection
//! errors, 429 and 5xx. Responses stream straight through.

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

struct Runtime {
    server: Option<Arc<tiny_http::Server>>,
    port: u16,
}

static RUNTIME: Mutex<Runtime> = Mutex::new(Runtime { server: None, port: 0 });

fn runtime() -> MutexGuard<'static, Runtime> {
    RUNTIME.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
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
}

fn default_port() -> u16 {
    17890
}

impl Default for ProxyConfig {
    fn default() -> Self {
        ProxyConfig { enabled: false, port: default_port(), stack: Vec::new() }
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
    base_url: String,
    api_key: String,
    anthropic: bool,
}

fn resolve_stack(config: &ProxyConfig) -> Vec<Target> {
    let store = crate::store::load();
    let mut out = Vec::new();
    for reference in &config.stack {
        let Some((tool, id)) = reference.split_once(':') else { continue };
        let Some(list) = store.providers.get(tool) else { continue };
        let Some(p) = list.iter().find(|p| p.id == id) else { continue };
        out.push(Target {
            base_url: p.base_url.clone(),
            api_key: p.api_key.clone(),
            anthropic: tool == "claude",
        });
    }
    out
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

fn handle(request: tiny_http::Request, config: ProxyConfig) {
    let targets = resolve_stack(&config);
    handle_with_targets(request, config.enabled, targets);
}

fn handle_with_targets(mut request: tiny_http::Request, enabled: bool, targets: Vec<Target>) {
    let method = request.method().as_str().to_string();
    let forwarded_headers = request_headers(request.headers());
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    let query = url.split_once('?').map(|(_, q)| format!("?{q}")).unwrap_or_default();

    let mut body = Vec::new();
    let reader = request.as_reader();
    let _ = reader.read_to_end(&mut body);

    if !enabled || targets.is_empty() {
        let resp = tiny_http::Response::from_string("{\"error\":\"kumoswitch proxy disabled or empty stack\"}")
            .with_status_code(503)
            .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
        let _ = request.respond(resp);
        return;
    }

    // Keep a generous idle timeout for long SSE streams, but fail fast when
    // connecting to an unreachable provider.
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30 * 60))
        .build();
    let client = match client {
        Ok(c) => c,
        Err(_) => {
            let _ = request.respond(tiny_http::Response::from_string("client error").with_status_code(500));
            return;
        }
    };

    let reqwest_method = reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::POST);
    let has_content_type = forwarded_headers.iter().any(|(name, _)| name == "content-type");
    let has_anthropic_version = forwarded_headers.iter().any(|(name, _)| name == "anthropic-version");

    let mut last_status = 502u16;
    for target in &targets {
        let upstream = format!("{}{}", upstream_url(&target.base_url, &path), query);
        let mut req = client.request(reqwest_method.clone(), &upstream);
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

        let sent = req.send();
        let resp = match sent {
            Ok(r) => r,
            Err(_) => { last_status = 502; continue; }
        };
        let status = resp.status().as_u16();
        if status == 429 || status >= 500 {
            last_status = status;
            continue; // fail over to the next provider
        }
        let headers = response_headers(&resp);
        let mut builder = tiny_http::Response::new(
            tiny_http::StatusCode(status),
            headers
                .into_iter()
                .filter_map(|(k, v)| format!("{k}: {v}").parse::<tiny_http::Header>().ok())
                .collect::<Vec<_>>(),
            resp, // blocking::Response implements Read -> streams through
            None,
            None,
        );
        builder = builder.with_chunked_threshold(0);
        let _ = request.respond(builder);
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
    use std::net::{SocketAddr, TcpListener, TcpStream};
    use std::sync::{Arc, Mutex};
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
        let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").unwrap());
        let url = local_url(&server);
        let join = thread::spawn(move || {
            let request = server
                .recv_timeout(Duration::from_secs(10))
                .expect("proxy receive")
                .expect("proxy request");
            handle_with_targets(request, true, targets);
        });
        (url, join)
    }

    fn target(base_url: String, api_key: &str) -> Target {
        Target { base_url, api_key: api_key.into(), anthropic: false }
    }

    fn anthropic_target(base_url: String, api_key: &str) -> Target {
        Target { base_url, api_key: api_key.into(), anthropic: true }
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

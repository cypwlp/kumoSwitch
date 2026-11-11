//! Local reverse proxy with ordered failover ("aggregate mode").
//!
//! The CLI tools point at `http://127.0.0.1:<port>/v1`; we forward each request
//! to the configured stack of providers in order, failing over on connection
//! errors, 429 and 5xx. Responses stream straight through.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

static RUNNING: AtomicBool = AtomicBool::new(false);

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

fn header_map(response: &reqwest::blocking::Response) -> Vec<(String, String)> {
    response
        .headers()
        .iter()
        .filter(|(k, _)| {
            let k = k.as_str().to_lowercase();
            !matches!(k.as_str(), "transfer-encoding" | "connection" | "content-length")
        })
        .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
        .collect()
}

fn handle(request: tiny_http::Request, config: ProxyConfig) {
    let targets = resolve_stack(&config);
    handle_with_targets(request, config.enabled, targets);
}

fn handle_with_targets(mut request: tiny_http::Request, enabled: bool, targets: Vec<Target>) {
    let method = request.method().clone();
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    let query = url.split_once('?').map(|(_, q)| format!("?{q}")).unwrap_or_default();

    let mut body = Vec::new();
    let reader = request.as_reader();
    let _ = reader.read_to_end(&mut body);

    if !enabled || targets.is_empty() {
        let resp = tiny_http::Response::from_string("{\"error\":\"switchyard proxy disabled or empty stack\"}")
            .with_status_code(503)
            .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
        let _ = request.respond(resp);
        return;
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build();
    let client = match client {
        Ok(c) => c,
        Err(_) => {
            let _ = request.respond(tiny_http::Response::from_string("client error").with_status_code(500));
            return;
        }
    };

    let mut last_status = 502u16;
    for target in &targets {
        let upstream = format!("{}{}", upstream_url(&target.base_url, &path), query);
        let mut req = match method {
            tiny_http::Method::Post => client.post(&upstream),
            tiny_http::Method::Get => client.get(&upstream),
            _ => client.post(&upstream),
        };
        if target.anthropic {
            req = req.header("x-api-key", &target.api_key).header("anthropic-version", "2023-06-01");
        } else {
            req = req.header("Authorization", format!("Bearer {}", target.api_key));
        }
        req = req.header("Content-Type", "application/json").body(body.clone());

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
        let headers = header_map(&resp);
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

/// Start the proxy listener once; it reads fresh config on every request.
pub fn start() {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        let config = crate::store::load().proxy;
        let addr = format!("127.0.0.1:{}", config.port);
        let server = match tiny_http::Server::http(&addr) {
            Ok(s) => Arc::new(s),
            Err(_) => { RUNNING.store(false, Ordering::SeqCst); return; }
        };
        for request in server.incoming_requests() {
            let config = crate::store::load().proxy;
            let server = server.clone();
            std::thread::spawn(move || {
                handle(request, config);
                let _ = server; // keep alive
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::Duration;

    #[derive(Debug)]
    struct CapturedRequest {
        url: String,
        authorization: String,
        body: String,
    }

    fn local_url(server: &tiny_http::Server) -> String {
        let addr = server.server_addr().to_ip().expect("local TCP listener");
        format!("http://{addr}")
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
            let authorization = request
                .headers()
                .iter()
                .find(|h| h.field.equiv("Authorization"))
                .map(|h| h.value.as_str().to_string())
                .unwrap_or_default();
            let url = request.url().to_string();
            let mut body = String::new();
            request.as_reader().read_to_string(&mut body).unwrap();
            seen.lock().unwrap().push(CapturedRequest { url, authorization, body });

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

    fn send_through_proxy(proxy_url: &str) -> reqwest::blocking::Response {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap();
        client
            .post(format!("{proxy_url}/v1/chat/completions?trace=1"))
            .header("Content-Type", "application/json")
            .body(r#"{"model":"e2e-model","messages":[]}"#)
            .send()
            .expect("proxy response")
    }

    fn assert_forwarded(request: &CapturedRequest, api_key: &str) {
        assert_eq!(request.url, "/v1/chat/completions?trace=1");
        assert_eq!(request.authorization, format!("Bearer {api_key}"));
        assert!(request.body.contains(r#""model":"e2e-model""#), "body was {}", request.body);
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
        let dead_port = {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.local_addr().unwrap().port()
        };
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
}

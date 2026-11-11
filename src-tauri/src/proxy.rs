//! Local reverse proxy with ordered failover ("aggregate mode").
//!
//! The CLI tools point at `http://127.0.0.1:<port>/v1`; we forward each request
//! to the configured stack of providers in order, failing over on connection
//! errors, 429 and 5xx. Responses stream straight through.

use std::io::Read;
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

fn handle(mut request: tiny_http::Request, config: ProxyConfig) {
    let method = request.method().clone();
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    let query = url.split_once('?').map(|(_, q)| format!("?{q}")).unwrap_or_default();

    let mut body = Vec::new();
    let mut reader = request.as_reader();
    let _ = reader.read_to_end(&mut body);

    let targets = resolve_stack(&config);
    if !config.enabled || targets.is_empty() {
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

    #[test]
    fn url_join_does_not_double_v1() {
        assert_eq!(upstream_url("https://x/v1", "/v1/chat/completions"), "https://x/v1/chat/completions");
        assert_eq!(upstream_url("https://x/v1/", "/v1/responses"), "https://x/v1/responses");
        assert_eq!(upstream_url("https://x", "/v1/messages"), "https://x/v1/messages");
        assert_eq!(upstream_url("https://x/v1", "/v1"), "https://x/v1");
    }
}

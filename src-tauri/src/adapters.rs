//! Declarative adapter registry.
//!
//! Every tool is described as a list of *targeted* edits: (file, format, key path,
//! value). Applying a provider can therefore never wipe unrelated settings — the
//! worst case is that a key we intended to touch gets an unexpected value, and the
//! diff preview shows that before anything is written.

use crate::{jsonc, yamlpatch};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct Provider {
    #[serde(default)]
    pub id: String,
    /// Identifier used inside the tool's own config file. Stable across applies.
    #[serde(default)]
    pub config_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    /// wire_api / protocol / api flavour, meaning depends on the tool.
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Copy, Clone, PartialEq, Debug)]
pub enum Fmt {
    Toml,
    Json,
    Yaml,
    Env,
}

impl Fmt {
    pub fn label(self) -> &'static str {
        match self {
            Fmt::Toml => "TOML",
            Fmt::Json => "JSON",
            Fmt::Yaml => "YAML",
            Fmt::Env => "ENV",
        }
    }
}

#[derive(Copy, Clone)]
pub enum Val {
    /// String value; `{{...}}` placeholders are substituted.
    Str(&'static str),
    /// JSON value built from a template.
    Json(&'static str),
    /// YAML mapping built from a JSON template.
    Yaml(&'static str),
    Bool(bool),
}

#[derive(Copy, Clone, PartialEq)]
pub enum When {
    Always,
    HasModel,
}

pub struct Step {
    pub file: &'static str,
    pub fmt: Fmt,
    pub path: &'static [&'static str],
    pub val: Val,
    pub when: When,
}

#[derive(Copy, Clone)]
pub enum Role {
    BaseUrl,
    Model,
    ApiKey,
}

pub struct Probe {
    pub file: &'static str,
    pub fmt: Fmt,
    pub role: Role,
    pub path: &'static [&'static str],
}

pub struct ToolSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub blurb: &'static str,
    /// Directory relative to the user's home, e.g. ".codex".
    pub dir: &'static str,
    pub default_file: &'static str,
    pub alt_files: &'static [&'static str],
    pub env_override: Option<&'static str>,
    pub verified: bool,
    pub restart: &'static str,
    pub steps: &'static [Step],
    pub probes: &'static [Probe],
    pub kind_choices: &'static [&'static str],
}

const fn s(text: &'static str) -> Val {
    Val::Str(text)
}

const QODER_PROTOCOLS: &[&str] = &["openai", "openai-responses"];
const CODEX_WIRE: &[&str] = &["responses", "chat"];
const DSH_API: &[&str] = &["openai-completions", "openai-responses", "anthropic-messages"];
const OPENCODE_API: &[&str] = &["openai", "anthropic", "responses"];
const EMPTY: &[&str] = &[];

pub static TOOLS: &[ToolSpec] = &[
    ToolSpec {
        id: "codex",
        name: "Codex",
        blurb: "OpenAI Codex CLI",
        dir: ".codex",
        default_file: "config.toml",
        alt_files: &[],
        env_override: Some("CODEX_HOME"),
        verified: true,
        restart: "需要重開終端或 Codex 才會生效",
        steps: &[
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model_provider"], val: s("{{config_id}}"), when: When::Always },
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model"], val: s("{{model}}"), when: When::HasModel },
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model_providers", "{{config_id}}", "name"], val: s("{{name}}"), when: When::Always },
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model_providers", "{{config_id}}", "base_url"], val: s("{{base_url}}"), when: When::Always },
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model_providers", "{{config_id}}", "wire_api"], val: s("{{kind}}"), when: When::Always },
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model_providers", "{{config_id}}", "experimental_bearer_token"], val: s("{{api_key}}"), when: When::Always },
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model_providers", "{{config_id}}", "requires_openai_auth"], val: Val::Bool(false), when: When::Always },
        ],
        probes: &[
            Probe { file: "config.toml", fmt: Fmt::Toml, role: Role::Model, path: &["model"] },
        ],
        kind_choices: CODEX_WIRE,
    },
    ToolSpec {
        id: "claude",
        name: "Claude Code",
        blurb: "Anthropic Claude Code CLI",
        dir: ".claude",
        default_file: "settings.json",
        alt_files: &[],
        env_override: Some("CLAUDE_CONFIG_DIR"),
        verified: true,
        restart: "Claude Code 支援熱切換，新開的 session 即生效",
        steps: &[
            Step { file: "settings.json", fmt: Fmt::Json, path: &["env", "ANTHROPIC_BASE_URL"], val: s("{{base_url}}"), when: When::Always },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["env", "ANTHROPIC_AUTH_TOKEN"], val: s("{{api_key}}"), when: When::Always },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["env", "ANTHROPIC_MODEL"], val: s("{{model}}"), when: When::HasModel },
        ],
        probes: &[
            Probe { file: "settings.json", fmt: Fmt::Json, role: Role::BaseUrl, path: &["env", "ANTHROPIC_BASE_URL"] },
            Probe { file: "settings.json", fmt: Fmt::Json, role: Role::ApiKey, path: &["env", "ANTHROPIC_AUTH_TOKEN"] },
            Probe { file: "settings.json", fmt: Fmt::Json, role: Role::Model, path: &["env", "ANTHROPIC_MODEL"] },
        ],
        kind_choices: EMPTY,
    },
    ToolSpec {
        id: "gemini",
        name: "Gemini CLI",
        blurb: "Google Gemini CLI",
        dir: ".gemini",
        default_file: "settings.json",
        alt_files: &[],
        env_override: Some("GEMINI_CLI_HOME"),
        verified: true,
        restart: "需要重開終端",
        steps: &[
            Step { file: "settings.json", fmt: Fmt::Json, path: &["selectedAuthType"], val: Val::Str("gemini-api-key"), when: When::Always },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["model", "name"], val: s("{{model}}"), when: When::HasModel },
            Step { file: ".env", fmt: Fmt::Env, path: &["GOOGLE_GEMINI_BASE_URL"], val: s("{{base_url}}"), when: When::Always },
            Step { file: ".env", fmt: Fmt::Env, path: &["GEMINI_API_KEY"], val: s("{{api_key}}"), when: When::Always },
        ],
        probes: &[
            Probe { file: ".env", fmt: Fmt::Env, role: Role::BaseUrl, path: &["GOOGLE_GEMINI_BASE_URL"] },
            Probe { file: ".env", fmt: Fmt::Env, role: Role::ApiKey, path: &["GEMINI_API_KEY"] },
            Probe { file: "settings.json", fmt: Fmt::Json, role: Role::Model, path: &["model", "name"] },
        ],
        kind_choices: EMPTY,
    },
    ToolSpec {
        id: "grok",
        name: "Grok Build",
        blurb: "xAI Grok Build CLI",
        dir: ".grok",
        default_file: "config.toml",
        alt_files: &[],
        env_override: None,
        verified: true,
        restart: "需要重開終端",
        steps: &[
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model", "{{config_id}}", "model"], val: s("{{model}}"), when: When::HasModel },
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model", "{{config_id}}", "base_url"], val: s("{{base_url}}"), when: When::Always },
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model", "{{config_id}}", "api_key"], val: s("{{api_key}}"), when: When::Always },
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["models", "default"], val: s("{{config_id}}"), when: When::Always },
        ],
        probes: &[
            Probe { file: "config.toml", fmt: Fmt::Toml, role: Role::Model, path: &["models", "default"] },
        ],
        kind_choices: EMPTY,
    },
    ToolSpec {
        id: "opencode",
        name: "OpenCode",
        blurb: "sst/opencode",
        dir: ".config/opencode",
        default_file: "opencode.json",
        alt_files: &["opencode.jsonc"],
        env_override: Some("OPENCODE_CONFIG"),
        verified: true,
        restart: "需要重開終端",
        steps: &[
            Step {
                file: "opencode.json",
                fmt: Fmt::Json,
                path: &["provider", "{{config_id}}"],
                val: Val::Json(
                    r#"{"npm":"@ai-sdk/openai-compatible","name":"{{name}}","options":{"baseURL":"{{base_url}}","apiKey":"{{api_key}}"},"models":{"{{model}}":{"name":"{{model}}"}}}"#,
                ),
                when: When::Always,
            },
            Step { file: "opencode.json", fmt: Fmt::Json, path: &["model"], val: s("{{config_id}}/{{model}}"), when: When::HasModel },
        ],
        probes: &[
            Probe { file: "opencode.json", fmt: Fmt::Json, role: Role::BaseUrl, path: &["provider", "{{config_id}}", "options", "baseURL"] },
        ],
        kind_choices: OPENCODE_API,
    },
    ToolSpec {
        id: "qoder",
        name: "Qoder",
        blurb: "Qoder CLI 自訂模型",
        dir: ".qoder",
        default_file: "settings.json",
        alt_files: &[],
        env_override: None,
        verified: true,
        restart: "改完在 Qoder 重新載入模型設定",
        steps: &[
            Step {
                file: "settings.json",
                fmt: Fmt::Json,
                path: &["providers", "{{config_id}}"],
                val: Val::Json(
                    r#"{"displayName":"{{name}}","baseUrl":"{{base_url}}","apiKey":"{{api_key}}","type":"openai-compatible","protocol":"{{kind}}","authType":"bearer","model":"{{model}}","models":[{"model":"{{model}}","displayName":"{{name}}"}]}"#,
                ),
                when: When::Always,
            },
        ],
        probes: &[],
        kind_choices: QODER_PROTOCOLS,
    },
    ToolSpec {
        id: "zcode",
        name: "ZCode",
        blurb: "Z.ai ZCode CLI",
        dir: ".zcode",
        default_file: "v2/config.json",
        alt_files: &["v2/provider_config.json"],
        env_override: Some("ZCODE_PERSONAL_PROVIDER_CONFIG_FILE"),
        verified: false,
        restart: "需要重開終端",
        steps: &[
            Step {
                file: "v2/config.json",
                fmt: Fmt::Json,
                path: &["providers", "{{config_id}}", "options"],
                val: Val::Json(
                    r#"{"apiKey":"{{api_key}}","baseURL":"{{base_url}}","apiKeyRequired":false}"#,
                ),
                when: When::Always,
            },
            Step { file: "v2/config.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "name"], val: s("{{name}}"), when: When::Always },
        ],
        probes: &[
            Probe { file: "v2/config.json", fmt: Fmt::Json, role: Role::BaseUrl, path: &["providers", "{{config_id}}", "options", "baseURL"] },
        ],
        kind_choices: EMPTY,
    },
    ToolSpec {
        id: "hermes",
        name: "Hermes",
        blurb: "Nous Research Hermes CLI",
        dir: ".hermes",
        default_file: "config.yaml",
        alt_files: &[],
        env_override: None,
        verified: false,
        restart: "需要重開終端",
        steps: &[
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["model", "provider"], val: s("{{config_id}}"), when: When::Always },
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["model", "name"], val: s("{{model}}"), when: When::HasModel },
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["model", "base_url"], val: s("{{base_url}}"), when: When::Always },
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["model", "api_key"], val: s("{{api_key}}"), when: When::Always },
        ],
        probes: &[
            Probe { file: "config.yaml", fmt: Fmt::Yaml, role: Role::BaseUrl, path: &["model", "base_url"] },
            Probe { file: "config.yaml", fmt: Fmt::Yaml, role: Role::Model, path: &["model", "name"] },
        ],
        kind_choices: EMPTY,
    },
    ToolSpec {
        id: "commandcode",
        name: "Command Code",
        blurb: "Command Code CLI",
        dir: ".commandcode",
        default_file: "providers.json",
        alt_files: &[],
        env_override: None,
        verified: false,
        restart: "需要重開終端",
        steps: &[
            Step {
                file: "providers.json",
                fmt: Fmt::Json,
                path: &["providers", "{{config_id}}"],
                val: Val::Json(
                    r#"{"name":"{{name}}","baseURL":"{{base_url}}","apiKey":"{{api_key}}","api":"{{kind}}","model":"{{model}}"}"#,
                ),
                when: When::Always,
            },
        ],
        probes: &[
            Probe { file: "providers.json", fmt: Fmt::Json, role: Role::BaseUrl, path: &["providers", "{{config_id}}", "baseURL"] },
        ],
        kind_choices: OPENCODE_API,
    },
    ToolSpec {
        id: "dsh",
        name: "DSH",
        blurb: "DeepSeek Harness",
        dir: ".dsh",
        default_file: "settings.yaml",
        alt_files: &[],
        env_override: None,
        verified: true,
        restart: "需要重開 DSH 桌面端",
        steps: &[
            Step {
                file: "settings.yaml",
                fmt: Fmt::Yaml,
                path: &["llm-pi-ai", "providers", "{{config_id}}"],
                val: Val::Yaml(
                    r#"{"displayName":"{{name}}","apiKey":"{{api_key}}","api":"{{kind}}","baseURL":"{{base_url}}","models":[{"id":"{{model}}","name":"{{model}}"}]}"#,
                ),
                when: When::Always,
            },
            Step { file: "settings.yaml", fmt: Fmt::Yaml, path: &["agent-default-model", "provider"], val: s("{{config_id}}"), when: When::Always },
            Step { file: "settings.yaml", fmt: Fmt::Yaml, path: &["agent-default-model", "model"], val: s("{{model}}"), when: When::HasModel },
        ],
        probes: &[
            Probe { file: "settings.yaml", fmt: Fmt::Yaml, role: Role::BaseUrl, path: &["llm-pi-ai", "providers", "{{config_id}}", "baseURL"] },
            Probe { file: "settings.yaml", fmt: Fmt::Yaml, role: Role::Model, path: &["agent-default-model", "model"] },
        ],
        kind_choices: DSH_API,
    },
];

pub fn find(id: &str) -> Option<&'static ToolSpec> {
    TOOLS.iter().find(|t| t.id == id)
}

pub fn home() -> PathBuf {
    if let Ok(p) = std::env::var("USERPROFILE") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    if let Ok(p) = std::env::var("HOME") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    PathBuf::from(".")
}

pub fn tool_dir(spec: &ToolSpec) -> PathBuf {
    if let Some(var) = spec.env_override {
        if var.contains("FILE") || var.contains("CONFIG") {
            // Points at a file, not a directory — ignore for directory resolution.
        } else if let Ok(p) = std::env::var(var) {
            if !p.is_empty() {
                return PathBuf::from(p);
            }
        }
    }
    home().join(spec.dir)
}

/// Resolve a file mentioned by a step, honouring the tool's alternate filenames.
pub fn resolve_file(spec: &ToolSpec, file: &str) -> PathBuf {
    let base = tool_dir(spec);
    let primary = base.join(file);
    if primary.exists() {
        return primary;
    }
    if file == spec.default_file {
        for alt in spec.alt_files {
            let candidate = base.join(alt);
            if candidate.exists() {
                return candidate;
            }
        }
    }
    primary
}

pub fn display_path(path: &Path) -> String {
    let h = home();
    if let Ok(rest) = path.strip_prefix(&h) {
        return format!("~/{}", rest.to_string_lossy().replace('\\', "/"));
    }
    path.to_string_lossy().replace('\\', "/")
}

fn subst(template: &str, provider: &Provider) -> String {
    template
        .replace("{{config_id}}", &provider.config_id)
        .replace("{{name}}", &provider.name)
        .replace("{{base_url}}", provider.base_url.trim_end_matches('/'))
        .replace("{{api_key}}", &provider.api_key)
        .replace("{{model}}", &provider.model)
        .replace("{{kind}}", &provider.kind)
}

fn path_segments(path: &[&'static str], provider: &Provider) -> Vec<String> {
    path.iter().map(|p| subst(p, provider)).collect()
}

fn read_raw(text: &str, fmt: Fmt, path: &[String]) -> Option<String> {
    match fmt {
        Fmt::Json => jsonc::get(text, path).map(|v| match v {
            Value::String(s) => s,
            other => other.to_string(),
        }),
        Fmt::Toml => {
            let doc = text.parse::<toml_edit::DocumentMut>().ok()?;
            let mut item: &toml_edit::Item = doc.as_item();
            for seg in path {
                item = item.get(seg)?;
            }
            Some(item.as_str().map(|s| s.to_string()).unwrap_or_else(|| item.to_string().trim().to_string()))
        }
        Fmt::Yaml => yamlpatch::get_scalar(text, path),
        Fmt::Env => {
            let key = path.first()?;
            text.lines().find_map(|line| {
                let line = line.trim();
                let (k, v) = line.split_once('=')?;
                if k.trim() == key {
                    Some(v.trim().trim_matches('"').to_string())
                } else {
                    None
                }
            })
        }
    }
}

fn set_env(text: &str, key: &str, value: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut replaced = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some((k, _)) = trimmed.split_once('=') {
            if k.trim() == key && !trimmed.starts_with('#') {
                out.push(format!("{key}={value}"));
                replaced = true;
                continue;
            }
        }
        out.push(line.to_string());
    }
    if !replaced {
        out.push(format!("{key}={value}"));
    }
    let mut joined = out.join("\n");
    joined.push('\n');
    joined
}

fn set_toml(text: &str, path: &[String], val: Val, provider: &Provider) -> Result<String, String> {
    let mut doc = if text.trim().is_empty() {
        toml_edit::DocumentMut::new()
    } else {
        text.parse::<toml_edit::DocumentMut>()
            .map_err(|e| format!("TOML 解析失敗：{e}"))?
    };
    let mut tbl: &mut toml_edit::Table = doc.as_table_mut();
    for seg in &path[..path.len() - 1] {
        let entry = tbl.entry(seg).or_insert(toml_edit::Item::Table(toml_edit::Table::new()));
        if !entry.is_table() {
            if entry.is_inline_table() {
                let inline = entry.as_inline_table().unwrap().clone().into_table();
                *entry = toml_edit::Item::Table(inline);
            } else {
                *entry = toml_edit::Item::Table(toml_edit::Table::new());
            }
        }
        if let Some(t) = entry.as_table_mut() {
            t.set_implicit(true);
            tbl = t;
        } else {
            return Err(format!("`{seg}` 不是表格"));
        }
    }
    let last = path.last().cloned().unwrap_or_default();
    let item = match val {
        Val::Bool(b) => toml_edit::value(b),
        Val::Str(t) => toml_edit::value(subst(t, provider)),
        Val::Json(_) | Val::Yaml(_) => {
            return Err("TOML 步驟不支援 JSON/YAML 模板值".into())
        }
    };
    tbl.insert(&last, item);
    Ok(doc.to_string())
}

fn set_json(text: &str, path: &[String], val: Val, provider: &Provider) -> Result<String, String> {
    let value = match val {
        Val::Str(t) => Value::String(subst(t, provider)),
        Val::Bool(b) => Value::Bool(b),
        Val::Json(t) => serde_json::from_str(&subst(t, provider))
            .map_err(|e| format!("JSON 模板無效：{e}"))?,
        Val::Yaml(_) => return Err("JSON 檔案不支援 YAML 模板值".into()),
    };
    jsonc::set(text, path, &value)
}

fn set_yaml(text: &str, path: &[String], val: Val, provider: &Provider) -> Result<String, String> {
    match val {
        Val::Str(t) => yamlpatch::set_scalar(text, path, &subst(t, provider)),
        Val::Yaml(t) | Val::Json(t) => {
            let value: Value = serde_json::from_str(&subst(t, provider))
                .map_err(|e| format!("模板無效：{e}"))?;
            yamlpatch::set_block(text, path, &value)
        }
        Val::Bool(b) => yamlpatch::set_scalar(text, path, &b.to_string()),
    }
}

pub fn read_value(spec: &ToolSpec, file: &str, fmt: Fmt, path: &[&'static str], provider: &Provider) -> Option<String> {
    let full = resolve_file(spec, file);
    let text = std::fs::read_to_string(&full).ok()?;
    let segs = path_segments(path, provider);
    read_raw(&text, fmt, &segs)
}

#[derive(Default, Clone, Debug, serde::Serialize)]
pub struct CurrentState {
    pub base_url: String,
    pub model: String,
    pub api_key_tail: String,
}

fn mask_tail(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let tail: String = trimmed.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("••••{tail}")
}

pub fn read_current(spec: &ToolSpec, provider: &Provider) -> CurrentState {
    let mut state = CurrentState::default();

    // Codex and Grok point at a named provider table, so resolve the pointer first.
    if spec.id == "codex" {
        let active = read_value(spec, "config.toml", Fmt::Toml, &["model_provider"], provider);
        if let Some(id) = active {
            let full = resolve_file(spec, "config.toml");
            if let Ok(text) = std::fs::read_to_string(&full) {
                state.base_url = read_raw(&text, Fmt::Toml, &["model_providers".into(), id.clone(), "base_url".into()])
                    .unwrap_or_default();
                state.api_key_tail = mask_tail(
                    &read_raw(&text, Fmt::Toml, &["model_providers".into(), id.clone(), "experimental_bearer_token".into()])
                        .unwrap_or_default(),
                );
            }
        }
        state.model = read_value(spec, "config.toml", Fmt::Toml, &["model"], provider).unwrap_or_default();
        return state;
    }

    for probe in spec.probes {
        let value = read_value(spec, probe.file, probe.fmt, probe.path, provider);
        match (probe.role, value) {
            (Role::BaseUrl, Some(v)) => state.base_url = v,
            (Role::Model, Some(v)) => state.model = v,
            (Role::ApiKey, Some(v)) => state.api_key_tail = mask_tail(&v),
            _ => {}
        }
    }
    state
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct FileChange {
    pub file: String,
    pub fmt: &'static str,
    pub existed: bool,
    pub before: String,
    pub after: String,
    #[serde(skip)]
    pub path: PathBuf,
}

pub fn plan(spec: &ToolSpec, provider: &Provider) -> Result<Vec<FileChange>, String> {
    let mut files: Vec<FileChange> = Vec::new();
    for step in spec.steps {
        if step.when == When::HasModel && provider.model.trim().is_empty() {
            continue;
        }
        let path = resolve_file(spec, step.file);
        let display = display_path(&path);
        let idx = match files.iter().position(|f| f.file == display) {
            Some(i) => i,
            None => {
                let before = std::fs::read_to_string(&path).unwrap_or_default();
                files.push(FileChange {
                    file: display,
                    fmt: step.fmt.label(),
                    existed: path.exists(),
                    before,
                    after: String::new(),
                    path,
                });
                files.len() - 1
            }
        };
        let current = if files[idx].after.is_empty() {
            files[idx].before.clone()
        } else {
            files[idx].after.clone()
        };
        let segs = path_segments(step.path, provider);
        let updated = match step.fmt {
            Fmt::Toml => set_toml(&current, &segs, step.val, provider)?,
            Fmt::Json => set_json(&current, &segs, step.val, provider)?,
            Fmt::Yaml => set_yaml(&current, &segs, step.val, provider)?,
            Fmt::Env => match step.val {
                Val::Str(t) => set_env(&current, &segs[0], &subst(t, provider)),
                _ => return Err("ENV 只支援字串值".into()),
            },
        };
        files[idx].after = updated;
    }
    Ok(files)
}

#[cfg(test)]
mod real_config_checks {
    //! Read-only checks against whatever config files exist on this machine.
    //! They prove the non-destructive promise on real data instead of fixtures.

    use super::*;
    use std::collections::BTreeMap;

    fn probe_provider() -> Provider {
        Provider {
            id: "selftest".into(),
            config_id: "switchyard-selftest".into(),
            name: "SwitchYard Selftest".into(),
            base_url: "https://selftest.invalid/v1".into(),
            api_key: "sk-selftest".into(),
            model: "selftest-model".into(),
            kind: "responses".into(),
            note: String::new(),
        }
    }

    fn json_map(text: &str) -> BTreeMap<String, Value> {
        serde_json::from_str::<Value>(&jsonc::strip_comments(text))
            .map(|v| v.as_object().cloned().unwrap_or_default().into_iter().collect())
            .unwrap_or_default()
    }

    #[test]
    fn codex_keeps_every_unrelated_section() {
        let spec = find("codex").unwrap();
        let path = resolve_file(spec, "config.toml");
        let Ok(before) = std::fs::read_to_string(&path) else {
            return;
        };
        let after = plan(spec, &probe_provider()).unwrap()[0].after.clone();

        for section in [
            "[desktop",
            "[marketplaces.",
            "[plugins.",
            "[mcp_servers.",
            "[windows",
        ] {
            assert!(
                after.contains(section),
                "Codex 計畫把 `{section}` 區塊吃掉了"
            );
        }
        let sections_before = before.matches("\n[").count();
        let sections_after = after.matches("\n[").count();
        assert!(
            sections_after >= sections_before,
            "TOML 區塊數量變少：{sections_before} -> {sections_after}"
        );
        let changed = before
            .lines()
            .filter(|l| !after.lines().any(|a| a == *l))
            .count();
        assert!(changed <= 12, "非預期的大量改動：{changed} 行");
        assert!(after.parse::<toml_edit::DocumentMut>().is_ok(), "產生的 TOML 無法解析");
    }

    #[test]
    fn claude_only_touches_three_env_keys() {
        let spec = find("claude").unwrap();
        let path = resolve_file(spec, "settings.json");
        let Ok(before) = std::fs::read_to_string(&path) else {
            return;
        };
        let after = plan(spec, &probe_provider()).unwrap()[0].after.clone();
        let a = json_map(&before);
        let b = json_map(&after);

        let targeted = ["env", "model_provider"];
        for key in a.keys() {
            if targeted.contains(&key.as_str()) {
                continue;
            }
            assert_eq!(a.get(key), b.get(key), "頂層鍵 `{key}` 被改動了");
        }
        let env_a = a.get("env").and_then(|v| v.as_object()).cloned().unwrap_or_default();
        let env_b = b.get("env").and_then(|v| v.as_object()).cloned().unwrap_or_default();
        let allowed = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL"];
        for (k, v) in &env_a {
            if allowed.contains(&k.as_str()) {
                continue;
            }
            assert_eq!(Some(v), env_b.get(k), "env.{k} 被改動了");
        }
        assert_eq!(
            env_b.get("ANTHROPIC_BASE_URL").and_then(|v| v.as_str()),
            Some("https://selftest.invalid/v1")
        );
    }

    #[test]
    fn qoder_keeps_existing_providers() {
        let spec = find("qoder").unwrap();
        let path = resolve_file(spec, "settings.json");
        let Ok(before) = std::fs::read_to_string(&path) else {
            return;
        };
        let after = plan(spec, &probe_provider()).unwrap()[0].after.clone();
        let a = json_map(&before);
        let b = json_map(&after);
        let pa = a.get("providers").and_then(|v| v.as_object()).cloned().unwrap_or_default();
        let pb = b.get("providers").and_then(|v| v.as_object()).cloned().unwrap_or_default();
        for (k, v) in &pa {
            assert_eq!(Some(v), pb.get(k), "既有 provider `{k}` 被改動了");
        }
        assert!(pb.contains_key("switchyard-selftest"));
        assert_eq!(
            b.get("enabledPlugins").and_then(|v| v.as_object()).map(|m| m.len()),
            a.get("enabledPlugins").and_then(|v| v.as_object()).map(|m| m.len())
        );
    }

    #[test]
    fn dsh_keeps_unrelated_top_level_blocks() {
        let spec = find("dsh").unwrap();
        let path = resolve_file(spec, "settings.yaml");
        let Ok(before) = std::fs::read_to_string(&path) else {
            return;
        };
        let after = plan(spec, &probe_provider()).unwrap()[0].after.clone();
        for block in ["permission:", "ui-theme:", "agent-presets:"] {
            assert!(after.contains(block), "DSH 計畫把 `{block}` 吃掉了");
        }
        assert!(after.contains("switchyard-selftest:"));
    }
}


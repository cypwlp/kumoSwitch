//! Declarative adapter registry.
//!
//! Every tool is described as a list of *targeted* edits: (file, format, key path,
//! value). Steps are scalar wherever possible so that re-applying a provider never
//! clobbers sibling keys the user customised. Whole objects/arrays are only ever
//! written with `When::IfMissing`, i.e. created once and then left alone.

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
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub api_key: String,
    /// Encrypted key. Windows uses DPAPI; macOS/Linux use AES-256-GCM with a
    /// master key stored in Keychain or Secret Service.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub api_key_enc: String,
    #[serde(default)]
    pub model: String,
    /// wire_api / protocol / api flavour, meaning depends on the tool.
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub note: String,
    /// Unix millis of the last successful apply, used for sorting.
    #[serde(default)]
    pub last_used: u64,
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
    /// JSON value built from a template. Only used with `When::IfMissing`.
    Json(&'static str),
    /// YAML value built from a JSON template. Only used with `When::IfMissing`.
    Yaml(&'static str),
    Bool(bool),
}

#[derive(Copy, Clone, PartialEq)]
pub enum When {
    Always,
    HasModel,
    /// Skip when the key already exists, so user customisations survive.
    IfMissing,
}

pub struct Step {
    pub file: &'static str,
    pub fmt: Fmt,
    pub path: &'static [&'static str],
    pub val: Val,
    pub when: When,
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
            Step { file: "config.toml", fmt: Fmt::Toml, path: &["model_providers", "{{config_id}}", "requires_openai_auth"], val: Val::Bool(false), when: When::IfMissing },
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
            Step { file: "settings.json", fmt: Fmt::Json, path: &["selectedAuthType"], val: s("gemini-api-key"), when: When::Always },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["model", "name"], val: s("{{model}}"), when: When::HasModel },
            Step { file: ".env", fmt: Fmt::Env, path: &["GOOGLE_GEMINI_BASE_URL"], val: s("{{base_url}}"), when: When::Always },
            Step { file: ".env", fmt: Fmt::Env, path: &["GEMINI_API_KEY"], val: s("{{api_key}}"), when: When::Always },
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
            Step { file: "opencode.json", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "npm"], val: s("@ai-sdk/openai-compatible"), when: When::IfMissing },
            Step { file: "opencode.json", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "name"], val: s("{{name}}"), when: When::Always },
            Step { file: "opencode.json", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "options", "baseURL"], val: s("{{base_url}}"), when: When::Always },
            Step { file: "opencode.json", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "options", "apiKey"], val: s("{{api_key}}"), when: When::Always },
            Step { file: "opencode.json", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "models", "{{model}}", "name"], val: s("{{model}}"), when: When::IfMissing },
            Step { file: "opencode.json", fmt: Fmt::Json, path: &["model"], val: s("{{config_id}}/{{model}}"), when: When::HasModel },
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
            Step { file: "settings.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "displayName"], val: s("{{name}}"), when: When::Always },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "baseUrl"], val: s("{{base_url}}"), when: When::Always },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "apiKey"], val: s("{{api_key}}"), when: When::Always },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "type"], val: s("openai-compatible"), when: When::IfMissing },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "protocol"], val: s("{{kind}}"), when: When::Always },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "authType"], val: s("bearer"), when: When::IfMissing },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "model"], val: s("{{model}}"), when: When::HasModel },
            Step {
                file: "settings.json",
                fmt: Fmt::Json,
                path: &["providers", "{{config_id}}", "models"],
                val: Val::Json(r#"[{"model":"{{model}}","displayName":"{{name}}"}]"#),
                when: When::IfMissing,
            },
        ],
        kind_choices: QODER_PROTOCOLS,
    },
    ToolSpec {
        id: "zcode",
        name: "ZCode",
        blurb: "Z.ai ZCode CLI",
        dir: ".zcode",
        default_file: "v2/provider_config.json",
        alt_files: &[],
        env_override: Some("ZCODE_PERSONAL_PROVIDER_CONFIG_FILE"),
        verified: true,
        restart: "需要重開終端",
        steps: &[
            Step { file: "v2/provider_config.json", fmt: Fmt::Json, path: &["config", "providerConfigRules", "providerRules", "{{index}}", "providerId"], val: s("{{config_id}}"), when: When::Always },
            Step { file: "v2/provider_config.json", fmt: Fmt::Json, path: &["config", "providerConfigRules", "providerRules", "{{index}}", "providerName"], val: s("{{name}}"), when: When::Always },
            Step { file: "v2/provider_config.json", fmt: Fmt::Json, path: &["config", "providerConfigRules", "providerRules", "{{index}}", "enabled"], val: Val::Bool(true), when: When::Always },
            Step { file: "v2/provider_config.json", fmt: Fmt::Json, path: &["config", "providerConfigRules", "providerRules", "{{index}}", "config", "access", "type"], val: s("api-key"), when: When::IfMissing },
            Step { file: "v2/provider_config.json", fmt: Fmt::Json, path: &["config", "providerConfigRules", "providerRules", "{{index}}", "config", "access", "apiKey"], val: s("{{api_key}}"), when: When::Always },
            Step { file: "v2/provider_config.json", fmt: Fmt::Json, path: &["config", "providerConfigRules", "providerRules", "{{index}}", "config", "api", "type"], val: s("openai-chat-completions"), when: When::IfMissing },
            Step { file: "v2/provider_config.json", fmt: Fmt::Json, path: &["config", "providerConfigRules", "providerRules", "{{index}}", "config", "api", "baseUrl"], val: s("{{base_url}}"), when: When::Always },
            Step {
                file: "v2/provider_config.json",
                fmt: Fmt::Json,
                path: &["config", "providerConfigRules", "providerRules", "{{index}}", "config", "personalModelIds"],
                val: Val::Json(r#"["{{model}}"]"#),
                when: When::IfMissing,
            },
            Step {
                file: "v2/provider_config.json",
                fmt: Fmt::Json,
                path: &["config", "defaultModelSelection"],
                val: Val::Json(r#"{"providerId":"{{config_id}}","modelId":"{{model}}"}"#),
                when: When::HasModel,
            },
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
        verified: true,
        restart: "需要重開終端",
        steps: &[
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["providers", "{{config_id}}", "api"], val: s("{{base_url}}"), when: When::Always },
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["providers", "{{config_id}}", "key"], val: s("{{api_key}}"), when: When::Always },
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["providers", "{{config_id}}", "key_env"], val: s("KUMOSWITCH_{{config_id}}_KEY"), when: When::IfMissing },
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["providers", "{{config_id}}", "transport"], val: s("chat_completions"), when: When::IfMissing },
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["providers", "{{config_id}}", "default_model"], val: s("{{model}}"), when: When::HasModel },
            Step {
                file: "config.yaml",
                fmt: Fmt::Yaml,
                path: &["providers", "{{config_id}}", "models"],
                val: Val::Yaml(r#"{"{{model}}":{"context_length":128000}}"#),
                when: When::IfMissing,
            },
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["model", "provider"], val: s("custom:{{config_id}}"), when: When::Always },
            Step { file: "config.yaml", fmt: Fmt::Yaml, path: &["model", "default"], val: s("{{model}}"), when: When::HasModel },
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
        verified: true,
        restart: "需要重開終端",
        steps: &[
            Step { file: "providers.json", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "name"], val: s("{{name}}"), when: When::Always },
            Step { file: "providers.json", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "baseURL"], val: s("{{base_url}}"), when: When::Always },
            Step { file: "providers.json", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "apiKey"], val: s("{{api_key}}"), when: When::Always },
            Step { file: "providers.json", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "api"], val: s("openai-completions"), when: When::IfMissing },
            Step { file: "providers.json", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "models", "{{model}}", "contextWindow"], val: Val::Json("128000"), when: When::IfMissing },
        ],
        kind_choices: EMPTY,
    },
    ToolSpec {
        id: "crush",
        name: "Crush",
        blurb: "Charmbracelet Crush",
        dir: ".config/crush",
        default_file: "crush.json",
        alt_files: &[],
        env_override: None,
        verified: true,
        restart: "需要重開終端",
        steps: &[
            Step { file: "crush.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "type"], val: s("openai-compat"), when: When::IfMissing },
            Step { file: "crush.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "base_url"], val: s("{{base_url}}"), when: When::Always },
            Step { file: "crush.json", fmt: Fmt::Json, path: &["providers", "{{config_id}}", "api_key"], val: s("{{api_key}}"), when: When::Always },
            Step {
                file: "crush.json",
                fmt: Fmt::Json,
                path: &["providers", "{{config_id}}", "models"],
                val: Val::Json(r#"[{"id":"{{model}}","name":"{{model}}"}]"#),
                when: When::IfMissing,
            },
        ],
        kind_choices: EMPTY,
    },
    ToolSpec {
        id: "qwen",
        name: "Qwen Code",
        blurb: "QwenLM qwen-code",
        dir: ".qwen",
        default_file: "settings.json",
        alt_files: &[],
        env_override: None,
        verified: true,
        restart: "需要重開終端",
        steps: &[
            Step {
                file: "settings.json",
                fmt: Fmt::Json,
                path: &["modelProviders", "{{config_id}}"],
                val: Val::Json(r#"[{"id":"{{model}}","baseUrl":"{{base_url}}","envKey":"OPENAI_API_KEY"}]"#),
                when: When::IfMissing,
            },
            Step { file: "settings.json", fmt: Fmt::Json, path: &["model", "name"], val: s("{{model}}"), when: When::HasModel },
            Step { file: ".env", fmt: Fmt::Env, path: &["OPENAI_BASE_URL"], val: s("{{base_url}}"), when: When::Always },
            Step { file: ".env", fmt: Fmt::Env, path: &["OPENAI_API_KEY"], val: s("{{api_key}}"), when: When::Always },
            Step { file: ".env", fmt: Fmt::Env, path: &["OPENAI_MODEL"], val: s("{{model}}"), when: When::HasModel },
        ],
        kind_choices: EMPTY,
    },
    ToolSpec {
        id: "kilo",
        name: "Kilo Code",
        blurb: "Kilo-Org kilocode CLI",
        dir: ".config/kilo",
        default_file: "kilo.jsonc",
        alt_files: &["kilo.json"],
        env_override: None,
        verified: true,
        restart: "需要重開終端",
        steps: &[
            Step { file: "kilo.jsonc", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "name"], val: s("{{name}}"), when: When::Always },
            Step { file: "kilo.jsonc", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "options", "baseURL"], val: s("{{base_url}}"), when: When::Always },
            Step { file: "kilo.jsonc", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "options", "apiKey"], val: s("{{api_key}}"), when: When::Always },
            Step { file: "kilo.jsonc", fmt: Fmt::Json, path: &["provider", "{{config_id}}", "models", "{{model}}", "name"], val: s("{{model}}"), when: When::IfMissing },
            Step { file: "kilo.jsonc", fmt: Fmt::Json, path: &["model"], val: s("{{config_id}}/{{model}}"), when: When::HasModel },
        ],
        kind_choices: EMPTY,
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
            Step { file: "settings.yaml", fmt: Fmt::Yaml, path: &["llm-pi-ai", "providers", "{{config_id}}", "displayName"], val: s("{{name}}"), when: When::Always },
            Step { file: "settings.yaml", fmt: Fmt::Yaml, path: &["llm-pi-ai", "providers", "{{config_id}}", "apiKey"], val: s("{{api_key}}"), when: When::Always },
            Step { file: "settings.yaml", fmt: Fmt::Yaml, path: &["llm-pi-ai", "providers", "{{config_id}}", "api"], val: s("{{kind}}"), when: When::Always },
            Step { file: "settings.yaml", fmt: Fmt::Yaml, path: &["llm-pi-ai", "providers", "{{config_id}}", "baseURL"], val: s("{{base_url}}"), when: When::Always },
            Step {
                file: "settings.yaml",
                fmt: Fmt::Yaml,
                path: &["llm-pi-ai", "providers", "{{config_id}}", "models"],
                val: Val::Yaml(r#"[{"id":"{{model}}","name":"{{model}}"}]"#),
                when: When::IfMissing,
            },
            Step { file: "settings.yaml", fmt: Fmt::Yaml, path: &["agent-default-model", "provider"], val: s("{{config_id}}"), when: When::Always },
            Step { file: "settings.yaml", fmt: Fmt::Yaml, path: &["agent-default-model", "model"], val: s("{{model}}"), when: When::HasModel },
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
        if !var.contains("FILE") && !var.contains("CONFIG") {
            if let Ok(p) = std::env::var(var) {
                if !p.is_empty() {
                    return PathBuf::from(p);
                }
            }
        }
    }
    home().join(spec.dir)
}

/// Resolve a file mentioned by a step, honouring the tool's alternate filenames.
pub fn resolve_file(spec: &ToolSpec, file: &str) -> PathBuf {
    resolve_file_in(spec, file, &tool_dir(spec))
}

pub fn resolve_file_in(spec: &ToolSpec, file: &str, base: &Path) -> PathBuf {
    let base = base.to_path_buf();
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

fn subst(template: &str, provider: &Provider, index: usize) -> String {
    template
        .replace("{{index}}", &index.to_string())
        .replace("{{config_id}}", &provider.config_id)
        .replace("{{name}}", &provider.name)
        .replace("{{base_url}}", provider.base_url.trim_end_matches('/'))
        .replace("{{api_key}}", &provider.api_key)
        .replace("{{model}}", &provider.model)
        .replace("{{kind}}", &provider.kind)
}

fn path_segments(path: &[&'static str], provider: &Provider, index: usize) -> Vec<String> {
    path.iter().map(|p| subst(p, provider, index)).collect()
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

fn key_exists(text: &str, fmt: Fmt, path: &[String]) -> bool {
    match fmt {
        Fmt::Yaml => yamlpatch::exists(text, path),
        _ => read_raw(text, fmt, path).is_some(),
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

fn set_toml(text: &str, path: &[String], val: Val, provider: &Provider, index: usize) -> Result<String, String> {
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
    let new_value: toml_edit::Value = match val {
        Val::Bool(b) => b.into(),
        Val::Str(t) => subst(t, provider, index).into(),
        Val::Json(_) | Val::Yaml(_) => return Err("TOML 步驟不支援 JSON/YAML 模板值".into()),
    };
    // Replacing the whole item would drop its decor, i.e. the comment lines that
    // sit above the key. Swap the value and carry the decor over instead.
    if let Some(existing) = tbl.get_mut(&last).and_then(|item| item.as_value_mut()) {
        let decor = existing.decor().clone();
        *existing = new_value;
        *existing.decor_mut() = decor;
    } else {
        tbl.insert(&last, toml_edit::Item::Value(new_value));
    }
    Ok(doc.to_string())
}

fn set_json(text: &str, path: &[String], val: Val, provider: &Provider, index: usize) -> Result<String, String> {
    let value = match val {
        Val::Str(t) => Value::String(subst(t, provider, index)),
        Val::Bool(b) => Value::Bool(b),
        Val::Json(t) => serde_json::from_str(&subst(t, provider, index))
            .map_err(|e| format!("JSON 模板無效：{e}"))?,
        Val::Yaml(_) => return Err("JSON 檔案不支援 YAML 模板值".into()),
    };
    jsonc::set(text, path, &value)
}

fn set_yaml(text: &str, path: &[String], val: Val, provider: &Provider, index: usize) -> Result<String, String> {
    match val {
        Val::Str(t) => yamlpatch::set_scalar(text, path, &subst(t, provider, index)),
        Val::Yaml(t) | Val::Json(t) => {
            let value: Value = serde_json::from_str(&subst(t, provider, index))
                .map_err(|e| format!("模板無效：{e}"))?;
            yamlpatch::set_block(text, path, &value)
        }
        Val::Bool(b) => yamlpatch::set_scalar(text, path, &b.to_string()),
    }
}

pub fn read_value(spec: &ToolSpec, file: &str, fmt: Fmt, path: &[String]) -> Option<String> {
    let full = resolve_file(spec, file);
    let text = std::fs::read_to_string(&full).ok()?;
    read_raw(&text, fmt, path)
}

fn p(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|s| s.to_string()).collect()
}

#[derive(Default, Clone, Debug, serde::Serialize)]
pub struct CurrentState {
    pub base_url: String,
    pub model: String,
    pub api_key_tail: String,
    /// Which key the reading came from, for display in the UI.
    pub source: String,
}

fn mask_tail(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let tail: String = trimmed.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("••••{tail}")
}

/// Read what the tool is *actually* configured to use right now.
pub fn read_current(spec: &ToolSpec) -> CurrentState {
    let mut st = CurrentState::default();
    let rd = |file: &str, fmt: Fmt, path: &[&str]| read_value(spec, file, fmt, &p(path));

    match spec.id {
        "codex" => {
            if let Some(id) = rd("config.toml", Fmt::Toml, &["model_provider"]) {
                st.base_url = rd("config.toml", Fmt::Toml, &["model_providers", &id, "base_url"]).unwrap_or_default();
                st.api_key_tail = mask_tail(&rd("config.toml", Fmt::Toml, &["model_providers", &id, "experimental_bearer_token"]).unwrap_or_default());
                st.source = format!("model_providers.{id}.base_url");
            }
            st.model = rd("config.toml", Fmt::Toml, &["model"]).unwrap_or_default();
        }
        "grok" => {
            if let Some(id) = rd("config.toml", Fmt::Toml, &["models", "default"]) {
                st.base_url = rd("config.toml", Fmt::Toml, &["model", &id, "base_url"]).unwrap_or_default();
                st.api_key_tail = mask_tail(&rd("config.toml", Fmt::Toml, &["model", &id, "api_key"]).unwrap_or_default());
                st.model = rd("config.toml", Fmt::Toml, &["model", &id, "model"]).unwrap_or_default();
                st.source = format!("model.{id}.base_url");
            }
        }
        "opencode" => {
            if let Some(full) = rd("opencode.json", Fmt::Json, &["model"]) {
                if let Some((id, model)) = full.split_once('/') {
                    st.base_url = rd("opencode.json", Fmt::Json, &["provider", id, "options", "baseURL"]).unwrap_or_default();
                    st.api_key_tail = mask_tail(&rd("opencode.json", Fmt::Json, &["provider", id, "options", "apiKey"]).unwrap_or_default());
                    st.model = model.to_string();
                    st.source = format!("provider.{id}.options.baseURL");
                }
            }
        }
        "dsh" => {
            if let Some(id) = rd("settings.yaml", Fmt::Yaml, &["agent-default-model", "provider"]) {
                st.base_url = rd("settings.yaml", Fmt::Yaml, &["llm-pi-ai", "providers", &id, "baseURL"]).unwrap_or_default();
                st.api_key_tail = mask_tail(&rd("settings.yaml", Fmt::Yaml, &["llm-pi-ai", "providers", &id, "apiKey"]).unwrap_or_default());
                st.source = format!("llm-pi-ai.providers.{id}.baseURL");
            }
            st.model = rd("settings.yaml", Fmt::Yaml, &["agent-default-model", "model"]).unwrap_or_default();
        }
        "claude" => {
            st.base_url = rd("settings.json", Fmt::Json, &["env", "ANTHROPIC_BASE_URL"]).unwrap_or_default();
            st.api_key_tail = mask_tail(&rd("settings.json", Fmt::Json, &["env", "ANTHROPIC_AUTH_TOKEN"]).unwrap_or_default());
            st.model = rd("settings.json", Fmt::Json, &["env", "ANTHROPIC_MODEL"]).unwrap_or_default();
            st.source = "env.ANTHROPIC_BASE_URL".into();
        }
        "gemini" => {
            st.base_url = rd(".env", Fmt::Env, &["GOOGLE_GEMINI_BASE_URL"]).unwrap_or_default();
            st.api_key_tail = mask_tail(&rd(".env", Fmt::Env, &["GEMINI_API_KEY"]).unwrap_or_default());
            st.model = rd("settings.json", Fmt::Json, &["model", "name"]).unwrap_or_default();
            st.source = ".env GOOGLE_GEMINI_BASE_URL".into();
        }
        "hermes" => {
            if let Some(pointer) = rd("config.yaml", Fmt::Yaml, &["model", "provider"]) {
                let id = pointer.strip_prefix("custom:").unwrap_or(&pointer);
                st.base_url = rd("config.yaml", Fmt::Yaml, &["providers", id, "api"]).unwrap_or_default();
                st.api_key_tail = mask_tail(&rd("config.yaml", Fmt::Yaml, &["providers", id, "key"]).unwrap_or_default());
                st.source = format!("providers.{id}.api");
            }
            st.model = rd("config.yaml", Fmt::Yaml, &["model", "default"]).unwrap_or_default();
        }
        _ => {
            st.source = "由工具介面選擇".into();
        }
    }
    if st.base_url.is_empty() && st.source != "由工具介面選擇" {
        st.source = "尚未設定".into();
    }
    st
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
    plan_in(spec, provider, &tool_dir(spec))
}

/// Same as [`plan`] but against an explicit directory, which keeps end-to-end
/// tests away from the user's real configuration.
/// ZCode keeps providers in an array; find the slot for this provider, or append.
fn zcode_index(spec: &ToolSpec, provider: &Provider, dir: &Path) -> usize {
    let path = resolve_file_in(spec, spec.default_file, dir);
    let Ok(text) = std::fs::read_to_string(&path) else {
        return 0;
    };
    let segs = p(&["config", "providerConfigRules", "providerRules"]);
    let Some(Value::Array(items)) = jsonc::get(&text, &segs) else {
        return 0;
    };
    items
        .iter()
        .position(|item| item.get("providerId").and_then(|v| v.as_str()) == Some(provider.config_id.as_str()))
        .unwrap_or(items.len())
}

pub fn plan_in(spec: &ToolSpec, provider: &Provider, dir: &Path) -> Result<Vec<FileChange>, String> {
    let index = if spec.id == "zcode" { zcode_index(spec, provider, dir) } else { 0 };
    let mut files: Vec<FileChange> = Vec::new();
    for step in spec.steps {
        if step.when == When::HasModel && provider.model.trim().is_empty() {
            continue;
        }
        let path = resolve_file_in(spec, step.file, dir);
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
        let segs = path_segments(step.path, provider, index);
        if step.when == When::IfMissing && key_exists(&current, step.fmt, &segs) {
            continue;
        }
        let updated = match step.fmt {
            Fmt::Toml => set_toml(&current, &segs, step.val, provider, index)?,
            Fmt::Json => set_json(&current, &segs, step.val, provider, index)?,
            Fmt::Yaml => set_yaml(&current, &segs, step.val, provider, index)?,
            Fmt::Env => match step.val {
                Val::Str(t) => set_env(&current, &segs[0], &subst(t, provider, index)),
                _ => return Err("ENV 只支援字串值".into()),
            },
        };
        files[idx].after = updated;
    }
    Ok(files)
}

// ---------------------------------------------------------------------------
// Importing providers that already exist in the tool's own config file.
// ---------------------------------------------------------------------------

fn toml_keys(text: &str, path: &[String]) -> Vec<String> {
    let Ok(doc) = text.parse::<toml_edit::DocumentMut>() else {
        return Vec::new();
    };
    let mut item: &toml_edit::Item = doc.as_item();
    for seg in path {
        match item.get(seg) {
            Some(i) => item = i,
            None => return Vec::new(),
        }
    }
    if let Some(t) = item.as_table() {
        return t.iter().map(|(k, _)| k.to_string()).collect();
    }
    item.as_inline_table()
        .map(|t| t.iter().map(|(k, _)| k.to_string()).collect())
        .unwrap_or_default()
}

fn map_keys(spec: &ToolSpec, file: &str, fmt: Fmt, path: &[&str]) -> Vec<String> {
    let full = resolve_file(spec, file);
    let Ok(text) = std::fs::read_to_string(&full) else {
        return Vec::new();
    };
    let segs = p(path);
    match fmt {
        Fmt::Toml => toml_keys(&text, &segs),
        Fmt::Json => jsonc::get(&text, &segs)
            .and_then(|v| v.as_object().map(|m| m.keys().cloned().collect()))
            .unwrap_or_default(),
        Fmt::Yaml => yamlpatch::list_keys(&text, &segs),
        Fmt::Env => Vec::new(),
    }
}

fn imported(config_id: &str, name: String, base_url: String, api_key: String, model: String, kind: String) -> Provider {
    Provider {
        id: String::new(),
        config_id: config_id.to_string(),
        name: if name.is_empty() { config_id.to_string() } else { name },
        base_url,
        api_key,
        api_key_enc: String::new(),
        model,
        kind,
        note: "從設定檔導入".into(),
        last_used: 0,
    }
}

/// Read every provider already present in the tool's config file.
pub fn discover(spec: &ToolSpec) -> Vec<Provider> {
    let rd = |file: &str, fmt: Fmt, path: &[&str]| read_value(spec, file, fmt, &p(path)).unwrap_or_default();
    let mut out = Vec::new();

    match spec.id {
        "codex" => {
            let active = rd("config.toml", Fmt::Toml, &["model_provider"]);
            let global_model = rd("config.toml", Fmt::Toml, &["model"]);
            for id in map_keys(spec, "config.toml", Fmt::Toml, &["model_providers"]) {
                let base = rd("config.toml", Fmt::Toml, &["model_providers", &id, "base_url"]);
                if base.is_empty() {
                    continue;
                }
                out.push(imported(
                    &id,
                    rd("config.toml", Fmt::Toml, &["model_providers", &id, "name"]),
                    base,
                    rd("config.toml", Fmt::Toml, &["model_providers", &id, "experimental_bearer_token"]),
                    if active == id { global_model.clone() } else { String::new() },
                    rd("config.toml", Fmt::Toml, &["model_providers", &id, "wire_api"]),
                ));
            }
        }
        "grok" => {
            let active = rd("config.toml", Fmt::Toml, &["models", "default"]);
            for id in map_keys(spec, "config.toml", Fmt::Toml, &["model"]) {
                let base = rd("config.toml", Fmt::Toml, &["model", &id, "base_url"]);
                if base.is_empty() {
                    continue;
                }
                out.push(imported(
                    &id,
                    id.clone(),
                    base,
                    rd("config.toml", Fmt::Toml, &["model", &id, "api_key"]),
                    if active == id { rd("config.toml", Fmt::Toml, &["model", &id, "model"]) } else { String::new() },
                    String::new(),
                ));
            }
        }
        "opencode" => {
            let active = rd("opencode.json", Fmt::Json, &["model"]);
            for id in map_keys(spec, "opencode.json", Fmt::Json, &["provider"]) {
                let base = rd("opencode.json", Fmt::Json, &["provider", &id, "options", "baseURL"]);
                if base.is_empty() {
                    continue;
                }
                let model = active
                    .split_once('/')
                    .filter(|(pid, _)| *pid == id)
                    .map(|(_, m)| m.to_string())
                    .unwrap_or_default();
                out.push(imported(
                    &id,
                    rd("opencode.json", Fmt::Json, &["provider", &id, "name"]),
                    base,
                    rd("opencode.json", Fmt::Json, &["provider", &id, "options", "apiKey"]),
                    model,
                    String::new(),
                ));
            }
        }
        "qoder" => {
            for id in map_keys(spec, "settings.json", Fmt::Json, &["providers"]) {
                let base = rd("settings.json", Fmt::Json, &["providers", &id, "baseUrl"]);
                if base.is_empty() {
                    continue;
                }
                out.push(imported(
                    &id,
                    rd("settings.json", Fmt::Json, &["providers", &id, "displayName"]),
                    base,
                    rd("settings.json", Fmt::Json, &["providers", &id, "apiKey"]),
                    rd("settings.json", Fmt::Json, &["providers", &id, "model"]),
                    rd("settings.json", Fmt::Json, &["providers", &id, "protocol"]),
                ));
            }
        }
        "zcode" => {
            let full = resolve_file(spec, spec.default_file);
            if let Ok(text) = std::fs::read_to_string(&full) {
                if let Some(Value::Array(items)) = jsonc::get(&text, &p(&["config", "providerConfigRules", "providerRules"])) {
                    for item in items {
                        let id = item.get("providerId").and_then(|v| v.as_str()).unwrap_or("");
                        let base = item.pointer("/config/api/baseUrl").and_then(|v| v.as_str()).unwrap_or("");
                        if id.is_empty() || base.is_empty() {
                            continue;
                        }
                        out.push(imported(
                            id,
                            item.get("providerName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            base.to_string(),
                            item.pointer("/config/access/apiKey").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            String::new(),
                            String::new(),
                        ));
                    }
                }
            }
        }
        "dsh" => {
            let active = rd("settings.yaml", Fmt::Yaml, &["agent-default-model", "provider"]);
            let active_model = rd("settings.yaml", Fmt::Yaml, &["agent-default-model", "model"]);
            for id in map_keys(spec, "settings.yaml", Fmt::Yaml, &["llm-pi-ai", "providers"]) {
                let base = rd("settings.yaml", Fmt::Yaml, &["llm-pi-ai", "providers", &id, "baseURL"]);
                let key = rd("settings.yaml", Fmt::Yaml, &["llm-pi-ai", "providers", &id, "apiKey"]);
                if base.is_empty() && key.is_empty() {
                    continue;
                }
                out.push(imported(
                    &id,
                    rd("settings.yaml", Fmt::Yaml, &["llm-pi-ai", "providers", &id, "displayName"]),
                    base,
                    key,
                    if active == id { active_model.clone() } else { String::new() },
                    rd("settings.yaml", Fmt::Yaml, &["llm-pi-ai", "providers", &id, "api"]),
                ));
            }
        }
        "crush" => {
            for id in map_keys(spec, "crush.json", Fmt::Json, &["providers"]) {
                let base = rd("crush.json", Fmt::Json, &["providers", &id, "base_url"]);
                if base.is_empty() {
                    continue;
                }
                out.push(imported(
                    &id,
                    id.clone(),
                    base,
                    rd("crush.json", Fmt::Json, &["providers", &id, "api_key"]),
                    String::new(),
                    String::new(),
                ));
            }
        }
        "kilo" => {
            let active = rd("kilo.jsonc", Fmt::Json, &["model"]);
            for id in map_keys(spec, "kilo.jsonc", Fmt::Json, &["provider"]) {
                let base = rd("kilo.jsonc", Fmt::Json, &["provider", &id, "options", "baseURL"]);
                if base.is_empty() {
                    continue;
                }
                let model = active
                    .split_once('/')
                    .filter(|(pid, _)| *pid == id)
                    .map(|(_, m)| m.to_string())
                    .unwrap_or_default();
                out.push(imported(
                    &id,
                    rd("kilo.jsonc", Fmt::Json, &["provider", &id, "name"]),
                    base,
                    rd("kilo.jsonc", Fmt::Json, &["provider", &id, "options", "apiKey"]),
                    model,
                    String::new(),
                ));
            }
        }
        "qwen" => {
            let base = rd(".env", Fmt::Env, &["OPENAI_BASE_URL"]);
            if !base.is_empty() {
                out.push(imported(
                    "current",
                    "目前設定".into(),
                    base,
                    rd(".env", Fmt::Env, &["OPENAI_API_KEY"]),
                    rd(".env", Fmt::Env, &["OPENAI_MODEL"]),
                    String::new(),
                ));
            }
        }
        "claude" => {
            let base = rd("settings.json", Fmt::Json, &["env", "ANTHROPIC_BASE_URL"]);
            if !base.is_empty() {
                out.push(imported(
                    "current",
                    "目前設定".into(),
                    base,
                    rd("settings.json", Fmt::Json, &["env", "ANTHROPIC_AUTH_TOKEN"]),
                    rd("settings.json", Fmt::Json, &["env", "ANTHROPIC_MODEL"]),
                    String::new(),
                ));
            }
        }
        "gemini" => {
            let base = rd(".env", Fmt::Env, &["GOOGLE_GEMINI_BASE_URL"]);
            if !base.is_empty() {
                out.push(imported(
                    "current",
                    "目前設定".into(),
                    base,
                    rd(".env", Fmt::Env, &["GEMINI_API_KEY"]),
                    rd("settings.json", Fmt::Json, &["model", "name"]),
                    String::new(),
                ));
            }
        }
        "hermes" => {
            for id in map_keys(spec, "config.yaml", Fmt::Yaml, &["providers"]) {
                let base = rd("config.yaml", Fmt::Yaml, &["providers", &id, "api"]);
                if base.is_empty() {
                    continue;
                }
                out.push(imported(
                    &id,
                    id.clone(),
                    base,
                    rd("config.yaml", Fmt::Yaml, &["providers", &id, "key"]),
                    rd("config.yaml", Fmt::Yaml, &["providers", &id, "default_model"]),
                    String::new(),
                ));
            }
        }
        "commandcode" => {
            for id in map_keys(spec, "providers.json", Fmt::Json, &["provider"]) {
                let base = rd("providers.json", Fmt::Json, &["provider", &id, "baseURL"]);
                if base.is_empty() {
                    continue;
                }
                out.push(imported(
                    &id,
                    rd("providers.json", Fmt::Json, &["provider", &id, "name"]),
                    base,
                    rd("providers.json", Fmt::Json, &["provider", &id, "apiKey"]),
                    String::new(),
                    rd("providers.json", Fmt::Json, &["provider", &id, "api"]),
                ));
            }
        }
        _ => {}
    }
    out
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
            config_id: "kumoswitch-selftest".into(),
            name: "kumoSwitch Selftest".into(),
            base_url: "https://selftest.invalid/v1".into(),
            api_key: "sk-selftest".into(),
            api_key_enc: String::new(),
            model: "selftest-model".into(),
            kind: "responses".into(),
            note: String::new(),
            last_used: 0,
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

        for section in ["[desktop", "[marketplaces.", "[plugins.", "[mcp_servers.", "[windows"] {
            assert!(after.contains(section), "Codex 計畫把 `{section}` 區塊吃掉了");
        }
        let sections_before = before.matches("\n[").count();
        let sections_after = after.matches("\n[").count();
        assert!(sections_after >= sections_before, "TOML 區塊數量變少：{sections_before} -> {sections_after}");
        let changed = before.lines().filter(|l| !after.lines().any(|a| a == *l)).count();
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

        for key in a.keys() {
            if key == "env" {
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
        assert!(pb.contains_key("kumoswitch-selftest"));
        assert_eq!(
            b.get("enabledPlugins").and_then(|v| v.as_object()).map(|m| m.len()),
            a.get("enabledPlugins").and_then(|v| v.as_object()).map(|m| m.len())
        );
    }

    #[test]
    fn dsh_keeps_unrelated_top_level_blocks() {
        let spec = find("dsh").unwrap();
        let path = resolve_file(spec, "settings.yaml");
        let Ok(_before) = std::fs::read_to_string(&path) else {
            return;
        };
        let after = plan(spec, &probe_provider()).unwrap()[0].after.clone();
        for block in ["permission:", "ui-theme:", "agent-presets:"] {
            assert!(after.contains(block), "DSH 計畫把 `{block}` 吃掉了");
        }
        assert!(after.contains("kumoswitch-selftest:"));
    }

    #[test]
    fn reapplying_qoder_preserves_custom_models_array() {
        let spec = find("qoder").unwrap();
        let existing = r#"{
  "providers": {
    "qoder-custom-x": {
      "displayName": "Old",
      "baseUrl": "https://old/v1",
      "apiKey": "sk-old",
      "models": [{ "model": "m", "contextWindow": 999, "capabilities": { "vision": true } }]
    }
  }
}
"#;
        let mut provider = probe_provider();
        provider.config_id = "qoder-custom-x".into();
        let steps: Vec<_> = spec
            .steps
            .iter()
            .filter(|st| st.when != When::HasModel || !provider.model.is_empty())
            .collect();
        let mut text = existing.to_string();
        for step in steps {
            let segs = path_segments(step.path, &provider, 0);
            if step.when == When::IfMissing && key_exists(&text, step.fmt, &segs) {
                continue;
            }
            text = set_json(&text, &segs, step.val, &provider, 0).unwrap();
        }
        let parsed: Value = serde_json::from_str(&text).unwrap();
        let models = &parsed["providers"]["qoder-custom-x"]["models"];
        assert_eq!(models[0]["contextWindow"], serde_json::json!(999), "自訂 models 被覆蓋了");
        assert_eq!(models[0]["capabilities"]["vision"], serde_json::json!(true));
        assert_eq!(parsed["providers"]["qoder-custom-x"]["baseUrl"], serde_json::json!("https://selftest.invalid/v1"));
    }

    #[test]
    fn reapplying_dsh_preserves_compat_block() {
        let spec = find("dsh").unwrap();
        let existing = "llm-pi-ai:\n  providers:\n    keep-me:\n      apiKey: sk-old\n      baseURL: https://old/v1\n      compat:\n        supportsDeveloperRole: false\n      models:\n        - id: custom\n          contextWindow: 12345\nagent-default-model:\n  provider: keep-me\n  model: custom\n";
        let mut provider = probe_provider();
        provider.config_id = "keep-me".into();
        provider.kind = "openai-completions".into();
        let mut text = existing.to_string();
        for step in spec.steps {
            if step.when == When::HasModel && provider.model.is_empty() {
                continue;
            }
            let segs = path_segments(step.path, &provider, 0);
            if step.when == When::IfMissing && key_exists(&text, step.fmt, &segs) {
                continue;
            }
            text = set_yaml(&text, &segs, step.val, &provider, 0).unwrap();
        }
        assert!(text.contains("supportsDeveloperRole: false"), "compat 被覆蓋了：{text}");
        assert!(text.contains("contextWindow: 12345"), "自訂 models 被覆蓋了：{text}");
        assert!(text.contains("baseURL: https://selftest.invalid/v1"));
        assert_eq!(text.matches("llm-pi-ai:").count(), 1);
    }

    #[test]
    fn discover_finds_real_providers() {
        for spec in TOOLS {
            let found = discover(spec);
            for provider in &found {
                assert!(!provider.config_id.is_empty(), "{} 導入的 config_id 是空的", spec.id);
            }
        }
    }
}

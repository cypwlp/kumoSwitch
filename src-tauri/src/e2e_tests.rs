//! End-to-end apply tests against a sandbox directory.
//!
//! These write real files and re-read them, but never touch the user's home.

use crate::adapters::{self, Provider};
use crate::write_atomic;
use std::path::{Path, PathBuf};

fn sandbox(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("switchyard-e2e-{tag}-{}", crate::store::stamp()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn seed(dir: &Path, rel: &str, text: &str) {
    let path = dir.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

fn provider(config_id: &str) -> Provider {
    Provider {
        id: "e2e".into(),
        config_id: config_id.into(),
        name: "E2E Provider".into(),
        base_url: "https://e2e.invalid/v1".into(),
        api_key: "sk-e2e".into(),
        api_key_enc: String::new(),
        model: "e2e-model".into(),
        kind: String::new(),
        note: String::new(),
        last_used: 0,
    }
}

/// Plan, write, re-read — the same sequence `apply_provider` performs.
fn apply(dir: &Path, tool: &str, config_id: &str) -> Vec<String> {
    let spec = adapters::find(tool).unwrap();
    let mut p = provider(config_id);
    p.kind = spec.kind_choices.first().copied().unwrap_or("").to_string();
    let changes = adapters::plan_in(spec, &p, dir).unwrap();
    let mut written = Vec::new();
    for change in changes.iter().filter(|c| c.before != c.after) {
        std::fs::create_dir_all(change.path.parent().unwrap()).unwrap();
        write_atomic(&change.path, &change.after).unwrap();
        written.push(change.file.clone());
    }
    written
}

const CODEX_SEED: &str = r#"# 使用者註解
model_provider = "old"
model = "old-model"
disable_response_storage = true

[model_providers.old]
name = "Old"
base_url = "https://old.invalid/v1"
wire_api = "responses"

[desktop]
appearanceTheme = "dark"

[plugins."pdf@openai-primary-runtime"]
enabled = true

[mcp_servers.node_repl]
command = "node"
"#;

#[test]
fn codex_apply_writes_only_provider_keys() {
    let dir = sandbox("codex");
    seed(&dir, "config.toml", CODEX_SEED);
    let written = apply(&dir, "codex", "e2e");
    assert_eq!(written.len(), 1);

    let after = std::fs::read_to_string(dir.join("config.toml")).unwrap();
    assert!(after.contains("# 使用者註解"));
    assert!(after.contains("model_provider = \"e2e\""));
    assert!(after.contains("model = \"e2e-model\""));
    assert!(after.contains("[model_providers.e2e]"));
    assert!(after.contains("base_url = \"https://e2e.invalid/v1\""));
    // Untouched sections survive verbatim.
    for keep in [
        "[desktop]\nappearanceTheme = \"dark\"",
        "[plugins.\"pdf@openai-primary-runtime\"]\nenabled = true",
        "[mcp_servers.node_repl]\ncommand = \"node\"",
        "[model_providers.old]\nname = \"Old\"",
        "disable_response_storage = true",
    ] {
        assert!(after.contains(keep), "遺失或被改動：{keep}\n---\n{after}");
    }
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn claude_apply_keeps_other_env_keys() {
    let dir = sandbox("claude");
    seed(
        &dir,
        "settings.json",
        "{\n  \"env\": {\n    \"ANTHROPIC_BASE_URL\": \"https://old\",\n    \"TZ\": \"UTC\",\n    \"NO_PROXY\": \"127.0.0.1\"\n  },\n  \"permissions\": { \"allow\": [\"Bash\"] }\n}\n",
    );
    apply(&dir, "claude", "e2e");
    let after = std::fs::read_to_string(dir.join("settings.json")).unwrap();
    let json: serde_json::Value = serde_json::from_str(&after).unwrap();
    assert_eq!(json["env"]["ANTHROPIC_BASE_URL"], "https://e2e.invalid/v1");
    assert_eq!(json["env"]["ANTHROPIC_AUTH_TOKEN"], "sk-e2e");
    assert_eq!(json["env"]["TZ"], "UTC");
    assert_eq!(json["env"]["NO_PROXY"], "127.0.0.1");
    assert_eq!(json["permissions"]["allow"][0], "Bash");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn qoder_apply_preserves_other_providers_and_custom_models() {
    let dir = sandbox("qoder");
    seed(
        &dir,
        "settings.json",
        "{\n  \"enabledPlugins\": { \"a@b\": true },\n  \"providers\": {\n    \"qoder-custom-keep\": {\n      \"displayName\": \"Keep\",\n      \"baseUrl\": \"https://keep/v1\",\n      \"apiKey\": \"sk-keep\",\n      \"models\": [{ \"model\": \"m\", \"contextWindow\": 4242 }]\n    }\n  }\n}\n",
    );
    apply(&dir, "qoder", "qoder-custom-keep");
    let after = std::fs::read_to_string(dir.join("settings.json")).unwrap();
    let json: serde_json::Value = serde_json::from_str(&after).unwrap();
    let kept = &json["providers"]["qoder-custom-keep"];
    assert_eq!(kept["baseUrl"], "https://e2e.invalid/v1");
    assert_eq!(kept["models"][0]["contextWindow"], 4242, "自訂 models 被覆蓋");
    assert_eq!(json["enabledPlugins"]["a@b"], true);
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn dsh_apply_preserves_compat_and_other_blocks() {
    let dir = sandbox("dsh");
    seed(
        &dir,
        "settings.yaml",
        "llm-pi-ai:\n  providers:\n    keep:\n      apiKey: sk-old\n      baseURL: https://old/v1\n      compat:\n        supportsDeveloperRole: false\n      models:\n        - id: custom\n          contextWindow: 777\n\npermission:\n  defaultPreset: danger-full-access\n\nagent-default-model:\n  provider: keep\n  model: custom\n",
    );
    apply(&dir, "dsh", "keep");
    let after = std::fs::read_to_string(dir.join("settings.yaml")).unwrap();
    assert!(after.contains("supportsDeveloperRole: false"), "{after}");
    assert!(after.contains("contextWindow: 777"), "{after}");
    assert!(after.contains("baseURL: https://e2e.invalid/v1"), "{after}");
    assert!(after.contains("permission:\n  defaultPreset: danger-full-access"));
    assert_eq!(after.matches("llm-pi-ai:").count(), 1);
    assert_eq!(after.matches("agent-default-model:").count(), 1);
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn gemini_apply_writes_both_files() {
    let dir = sandbox("gemini");
    seed(&dir, "settings.json", "{\n  \"theme\": \"dark\"\n}\n");
    seed(&dir, ".env", "# keep me\nOTHER=1\n");
    let written = apply(&dir, "gemini", "e2e");
    assert_eq!(written.len(), 2, "應該同時寫 settings.json 與 .env");
    let env = std::fs::read_to_string(dir.join(".env")).unwrap();
    assert!(env.contains("# keep me"));
    assert!(env.contains("OTHER=1"));
    assert!(env.contains("GOOGLE_GEMINI_BASE_URL=https://e2e.invalid/v1"));
    assert!(env.contains("GEMINI_API_KEY=sk-e2e"));
    let settings = std::fs::read_to_string(dir.join("settings.json")).unwrap();
    assert!(settings.contains("\"theme\": \"dark\""));
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn applying_twice_is_idempotent() {
    let dir = sandbox("idem");
    seed(&dir, "config.toml", CODEX_SEED);
    apply(&dir, "codex", "e2e");
    let first = std::fs::read_to_string(dir.join("config.toml")).unwrap();
    let second_written = apply(&dir, "codex", "e2e");
    let second = std::fs::read_to_string(dir.join("config.toml")).unwrap();
    assert!(second_written.is_empty(), "第二次套用不該有任何變更");
    assert_eq!(first, second);
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn creates_config_from_nothing() {
    let dir = sandbox("fresh");
    let written = apply(&dir, "opencode", "e2e");
    assert_eq!(written.len(), 1);
    let after = std::fs::read_to_string(dir.join("opencode.json")).unwrap();
    let json: serde_json::Value = serde_json::from_str(&after).unwrap();
    assert_eq!(json["provider"]["e2e"]["options"]["baseURL"], "https://e2e.invalid/v1");
    assert_eq!(json["model"], "e2e/e2e-model");
    std::fs::remove_dir_all(&dir).ok();
}

//! Harness-specific model compatibility analysis. The matrix deliberately keeps
//! unknown metadata non-blocking; only an explicit contradiction (for example a
//! model marked as not supporting tools in a tool-calling CLI) blocks apply.

use crate::adapters::{ModelProfile, Provider};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct CompatibilityCheck {
    pub key: String,
    pub label: String,
    pub status: String,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ModelCompatibility {
    pub tool: String,
    pub tool_name: String,
    pub provider_id: String,
    pub provider_name: String,
    pub model_id: String,
    pub model_name: String,
    pub status: String,
    pub score: u8,
    pub checks: Vec<CompatibilityCheck>,
    pub issues: Vec<String>,
}

struct Requirements {
    min_context: u64,
    reasoning: bool,
    vision: bool,
    protocols: &'static [&'static str],
}

fn requirements(tool: &str) -> Requirements {
    match tool {
        "codex" => Requirements { min_context: 32_000, reasoning: true, vision: true, protocols: &["responses", "chat"] },
        "claude" => Requirements { min_context: 200_000, reasoning: true, vision: true, protocols: &["anthropic", "anthropic-messages", "claude"] },
        "gemini" => Requirements { min_context: 32_000, reasoning: true, vision: true, protocols: &[] },
        "grok" => Requirements { min_context: 32_000, reasoning: true, vision: false, protocols: &[] },
        "qoder" | "opencode" => Requirements { min_context: 32_000, reasoning: true, vision: true, protocols: &["openai", "openai-responses", "anthropic", "responses"] },
        "dsh" | "pi" | "omp" => Requirements { min_context: 32_000, reasoning: true, vision: true, protocols: &["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"] },
        _ => Requirements { min_context: 8_000, reasoning: false, vision: false, protocols: &[] },
    }
}

fn check(key: &str, label: &str, status: &str, detail: impl Into<String>) -> CompatibilityCheck {
    CompatibilityCheck {
        key: key.into(),
        label: label.into(),
        status: status.into(),
        detail: detail.into(),
    }
}

fn overridden(model: &ModelProfile) -> bool {
    model
        .metadata
        .get("compatibility_override")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

pub fn evaluate_model(tool: &str, provider: &Provider, model: &ModelProfile) -> ModelCompatibility {
    let req = requirements(tool);
    let tool_name = crate::adapters::find(tool).map(|spec| spec.name).unwrap_or(tool);
    let override_enabled = overridden(model);
    let mut checks = Vec::new();
    let mut score: i32 = 100;
    let mut blocking = false;
    let mut warned = false;

    match model.context_window {
        Some(value) if value >= req.min_context => checks.push(check("context", "Context window", "ok", format!("{} tokens，符合此 Harness 建議值", compact(value)))),
        Some(value) => {
            score -= 18;
            warned = true;
            checks.push(check("context", "Context window", "warn", format!("{} tokens，低於建議的 {}", compact(value), compact(req.min_context))));
        }
        None => {
            score -= 8;
            warned = true;
            checks.push(check("context", "Context window", "warn", "尚未標記；無法預先確認長上下文需求"));
        }
    }

    match model.tools {
        Some(true) => checks.push(check("tools", "Tool calling", "ok", "模型標記為支援工具呼叫")),
        Some(false) => {
            blocking = true;
            score -= 55;
            checks.push(check("tools", "Tool calling", "fail", "Harness 需要工具呼叫，但此模型明確標記為不支援"));
        }
        None => {
            score -= 10;
            warned = true;
            checks.push(check("tools", "Tool calling", "warn", "能力未知；建議先做連線與工具呼叫實測"));
        }
    }

    if req.reasoning {
        match model.reasoning {
            Some(true) => checks.push(check("reasoning", "Reasoning", "ok", "支援 reasoning 模式")),
            Some(false) => {
                score -= 12;
                warned = true;
                checks.push(check("reasoning", "Reasoning", "warn", "不支援 reasoning；仍可執行，但某些高階功能不可用"));
            }
            None => {
                score -= 5;
                warned = true;
                checks.push(check("reasoning", "Reasoning", "warn", "Reasoning 能力未知"));
            }
        }
    }

    if req.vision {
        match model.vision {
            Some(true) => checks.push(check("vision", "Vision", "ok", "支援圖片輸入")),
            Some(false) => checks.push(check("vision", "Vision", "info", "不支援圖片；文字與工具工作流不受影響")),
            None => checks.push(check("vision", "Vision", "info", "圖片能力未知")),
        }
    }

    if !req.protocols.is_empty() {
        if provider.kind.trim().is_empty() {
            score -= 6;
            warned = true;
            checks.push(check("protocol", "Protocol", "warn", "供應商未指定協議"));
        } else if req.protocols.iter().any(|allowed| allowed.eq_ignore_ascii_case(&provider.kind)) {
            checks.push(check("protocol", "Protocol", "ok", format!("{} 與此 Harness 相容", provider.kind)));
        } else {
            blocking = true;
            score -= 35;
            checks.push(check("protocol", "Protocol", "fail", format!("{} 不在此 Harness 支援清單（{}）", provider.kind, req.protocols.join(" / "))));
        }
    }

    if override_enabled {
        for item in &mut checks {
            if item.status == "fail" {
                item.status = "warn".into();
                item.detail.push_str("；已由 compatibility_override 強制允許");
            }
        }
        blocking = false;
        warned = true;
        checks.push(check("override", "Override", "warn", "使用者已明確允許不相容組合"));
    }

    let issues = checks
        .iter()
        .filter(|item| item.status == "fail" || item.status == "warn")
        .map(|item| item.detail.clone())
        .collect::<Vec<_>>();
    let status = if blocking {
        "incompatible"
    } else if warned {
        "warning"
    } else {
        "compatible"
    };

    ModelCompatibility {
        tool: tool.into(),
        tool_name: tool_name.into(),
        provider_id: provider.id.clone(),
        provider_name: provider.name.clone(),
        model_id: model.id.clone(),
        model_name: model.name.clone(),
        status: status.into(),
        score: score.clamp(0, 100) as u8,
        checks,
        issues,
    }
}

pub fn evaluate_provider(tool: &str, provider: &Provider) -> Vec<ModelCompatibility> {
    provider
        .models
        .iter()
        .filter(|model| !model.archived)
        .map(|model| evaluate_model(tool, provider, model))
        .collect()
}

pub fn selected(tool: &str, provider: &Provider) -> Option<ModelCompatibility> {
    if provider.model.trim().is_empty() {
        return None;
    }
    provider
        .models
        .iter()
        .find(|model| model.id == provider.model)
        .map(|model| evaluate_model(tool, provider, model))
}

pub fn preview_messages(tool: &str, provider: &Provider) -> Vec<String> {
    let Some(report) = selected(tool, provider) else { return Vec::new() };
    match report.status.as_str() {
        "incompatible" => vec![format!(
            "相容性阻擋：模型「{}」明確不符合 {} 的能力或協議需求。若確定要測試，請在模型 metadata 加入 compatibility_override: true。",
            report.model_name, report.tool_name
        )],
        "warning" => report.issues.into_iter().map(|issue| format!("相容性提醒：{issue}")).collect(),
        _ => Vec::new(),
    }
}

pub fn has_blocking(tool: &str, provider: &Provider) -> bool {
    selected(tool, provider).is_some_and(|report| report.status == "incompatible")
}

fn compact(value: u64) -> String {
    if value >= 1_000_000 {
        format!("{:.1}M", value as f64 / 1_000_000.0)
    } else if value >= 1_000 {
        format!("{}K", value / 1_000)
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::ModelProfile;

    fn provider(model: ModelProfile) -> Provider {
        Provider { id: "p".into(), name: "Demo".into(), kind: "responses".into(), model: model.id.clone(), models: vec![model], ..Provider::default() }
    }

    #[test]
    fn explicit_tool_contradiction_blocks_apply() {
        let p = provider(ModelProfile { id: "m".into(), tools: Some(false), context_window: Some(128_000), ..ModelProfile::default() });
        assert!(has_blocking("codex", &p));
    }

    #[test]
    fn override_turns_blocking_into_warning() {
        let p = provider(ModelProfile {
            id: "m".into(),
            tools: Some(false),
            context_window: Some(128_000),
            metadata: serde_json::json!({"compatibility_override": true}),
            ..ModelProfile::default()
        });
        assert!(!has_blocking("codex", &p));
        assert_eq!(selected("codex", &p).unwrap().status, "warning");
    }
}

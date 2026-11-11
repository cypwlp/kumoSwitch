//! Built-in provider catalog so users can pick a known endpoint instead of
//! typing base URLs from memory. Prices/URLs are public defaults, editable after
//! selection.

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    pub base_url: &'static str,
    pub kind: &'static str,
    pub models: &'static [&'static str],
    pub docs: &'static str,
    pub note: &'static str,
}

pub static PRESETS: &[Preset] = &[
    Preset { id: "openai", name: "OpenAI", base_url: "https://api.openai.com/v1", kind: "responses", models: &["gpt-5.2", "gpt-5.1", "gpt-4o"], docs: "https://platform.openai.com/docs", note: "官方" },
    Preset { id: "anthropic", name: "Anthropic", base_url: "https://api.anthropic.com", kind: "anthropic", models: &["claude-sonnet-5", "claude-opus-5", "claude-haiku-5"], docs: "https://docs.anthropic.com", note: "官方" },
    Preset { id: "deepseek", name: "DeepSeek", base_url: "https://api.deepseek.com/v1", kind: "openai", models: &["deepseek-chat", "deepseek-reasoner"], docs: "https://api-docs.deepseek.com", note: "官方" },
    Preset { id: "moonshot", name: "Moonshot Kimi", base_url: "https://api.moonshot.cn/v1", kind: "openai", models: &["kimi-k2-turbo", "kimi-latest"], docs: "https://platform.moonshot.cn", note: "官方" },
    Preset { id: "zhipu", name: "智譜 GLM", base_url: "https://open.bigmodel.cn/api/paas/v4", kind: "openai", models: &["glm-4.7", "glm-4.6"], docs: "https://open.bigmodel.cn", note: "官方" },
    Preset { id: "dashscope", name: "Qwen DashScope", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", kind: "openai", models: &["qwen3-coder-plus", "qwen-max"], docs: "https://help.aliyun.com/zh/model-studio", note: "官方" },
    Preset { id: "minimax", name: "MiniMax", base_url: "https://api.minimax.io/v1", kind: "openai", models: &["minimax-m2", "minimax-text-01"], docs: "https://platform.minimax.io", note: "官方" },
    Preset { id: "siliconflow", name: "SiliconFlow", base_url: "https://api.siliconflow.cn/v1", kind: "openai", models: &["deepseek-ai/DeepSeek-V3", "Qwen/Qwen3-Coder"], docs: "https://cloud.siliconflow.cn", note: "聚合" },
    Preset { id: "openrouter", name: "OpenRouter", base_url: "https://openrouter.ai/api/v1", kind: "openai", models: &["anthropic/claude-sonnet-4.5", "openai/gpt-5.1"], docs: "https://openrouter.ai/docs", note: "聚合" },
    Preset { id: "groq", name: "Groq", base_url: "https://api.groq.com/openai/v1", kind: "openai", models: &["llama-3.3-70b-versatile", "qwen/qwen3-32b"], docs: "https://console.groq.com", note: "官方" },
    Preset { id: "xai", name: "xAI Grok", base_url: "https://api.x.ai/v1", kind: "openai", models: &["grok-4", "grok-3"], docs: "https://docs.x.ai", note: "官方" },
    Preset { id: "gemini", name: "Google Gemini", base_url: "https://generativelanguage.googleapis.com/v1beta/openai", kind: "openai", models: &["gemini-2.5-pro", "gemini-2.5-flash"], docs: "https://ai.google.dev", note: "OpenAI 相容端點" },
    Preset { id: "opencode-zen", name: "OpenCode Zen", base_url: "https://opencode.ai/zen/go/v1", kind: "openai-responses", models: &["glm-5.3-flash", "deepseek-flash", "muse-spark-1.3-contributor"], docs: "https://opencode.ai", note: "聚合" },
    Preset { id: "commandcode", name: "Command Code", base_url: "https://api.commandcode.ai/provider/v1", kind: "openai", models: &["deepseek/deepseek-v4.1-flash", "z-ai/glm-5.3-flash"], docs: "https://commandcode.ai", note: "聚合" },
    Preset { id: "ollama", name: "Ollama（本機）", base_url: "http://127.0.0.1:11434/v1", kind: "openai", models: &["qwen2.5-coder:14b", "llama3.1:8b"], docs: "https://ollama.com", note: "本機、免金鑰" },
    Preset { id: "lmstudio", name: "LM Studio（本機）", base_url: "http://127.0.0.1:1234/v1", kind: "openai", models: &["local-model"], docs: "https://lmstudio.ai", note: "本機、免金鑰" },
];

pub fn list() -> &'static [Preset] {
    PRESETS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_have_urls_and_models() {
        assert!(PRESETS.len() >= 12);
        for p in PRESETS {
            assert!(p.base_url.starts_with("http"), "{}", p.id);
            assert!(!p.models.is_empty(), "{}", p.id);
        }
    }
}

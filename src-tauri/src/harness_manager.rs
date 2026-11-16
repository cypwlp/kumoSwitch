//! Harness installation and desktop-surface metadata.
//!
//! Package installation is intentionally allow-listed: the UI may only ask for a
//! known Harness id, and this module resolves that id to a fixed package-manager
//! invocation. No user-provided command, shell script, or extra argument is run.

use crate::adapters::{self, TOOLS};
use serde::Serialize;
use std::sync::Mutex;

static INSTALL_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Surface {
    Cli,
    #[allow(dead_code)]
    Desktop,
    Both,
}

impl Surface {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Cli => "cli",
            Self::Desktop => "desktop",
            Self::Both => "both",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Cli => "CLI",
            Self::Desktop => "桌面版",
            Self::Both => "CLI + 桌面版",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct InstallSpec {
    pub manager: &'static str,
    pub package: &'static str,
    pub extra_args: &'static [&'static str],
}

impl InstallSpec {
    fn program(self) -> &'static str {
        if cfg!(windows) { "npm.cmd" } else { "npm" }
    }

    fn args(self) -> Vec<&'static str> {
        let mut args = vec!["install", "-g", "--no-fund", "--no-audit"];
        args.extend(self.extra_args.iter().copied());
        args.push(self.package);
        args
    }

    fn command(self) -> String {
        std::iter::once(self.program())
            .chain(self.args())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

#[derive(Clone, Copy, Debug)]
pub struct HarnessManifest {
    pub id: &'static str,
    /// The configuration path represented by kumoSwitch. This is deliberately
    /// narrower than "a desktop product exists": it only says that the adapter
    /// covers the CLI, the desktop app, or both.
    pub surface: Surface,
    pub website_url: &'static str,
    pub docs_url: &'static str,
    pub desktop_url: Option<&'static str>,
    pub desktop_note: &'static str,
    pub bin: &'static str,
    pub install: Option<InstallSpec>,
}

const fn npm(package: &'static str, extra_args: &'static [&'static str]) -> Option<InstallSpec> {
    Some(InstallSpec { manager: "npm", package, extra_args })
}

static MANIFESTS: &[HarnessManifest] = &[
    HarnessManifest {
        id: "codex",
        surface: Surface::Both,
        website_url: "https://developers.openai.com/codex/",
        docs_url: "https://developers.openai.com/codex/config-basic",
        desktop_url: Some("https://developers.openai.com/codex/app"),
        desktop_note: "Codex CLI 與 ChatGPT 桌面版共用 Codex 設定；桌面版的 Codex 工作區可直接沿用這裡的 provider。",
        bin: "codex",
        install: npm("@openai/codex", &[]),
    },
    HarnessManifest {
        id: "claude",
        surface: Surface::Both,
        website_url: "https://code.claude.com/",
        docs_url: "https://code.claude.com/docs/en/desktop",
        desktop_url: Some("https://claude.com/download"),
        desktop_note: "Claude Desktop 的 Code 分頁與 CLI 共用 ~/.claude 設定，因此同一個 provider 會套用到兩邊。",
        bin: "claude",
        install: npm("@anthropic-ai/claude-code", &[]),
    },
    HarnessManifest {
        id: "gemini",
        surface: Surface::Cli,
        website_url: "https://geminicli.com/",
        docs_url: "https://github.com/google-gemini/gemini-cli",
        desktop_url: None,
        desktop_note: "官方 Gemini CLI 目前是終端 Harness；Google 的其他桌面產品不是同一套 CLI 設定。",
        bin: "gemini",
        install: npm("@google/gemini-cli", &[]),
    },
    HarnessManifest {
        id: "grok",
        surface: Surface::Cli,
        website_url: "https://x.ai/cli",
        docs_url: "https://github.com/xai-org/grok-build",
        desktop_url: None,
        desktop_note: "官方 Grok Build 是 TUI／CLI；目前沒有可驗證的同款第一方桌面設定 adapter。",
        bin: "grok",
        install: None,
    },
    HarnessManifest {
        id: "opencode",
        surface: Surface::Both,
        website_url: "https://opencode.ai/",
        docs_url: "https://opencode.ai/docs/config",
        desktop_url: Some("https://opencode.ai/download"),
        desktop_note: "OpenCode Desktop 與 CLI 讀取同一組使用者設定；桌面版目前是官方 Beta。",
        bin: "opencode",
        install: npm("@opencode/cli", &[]),
    },
    HarnessManifest {
        id: "qoder",
        surface: Surface::Both,
        website_url: "https://qoder.com/",
        docs_url: "https://qoder.com/cli",
        desktop_url: Some("https://qoder.com/download"),
        desktop_note: "Qoder Desktop 與 Qoder CLI 共用 ~/.qoder 的使用者設定；CLI 可用官方 npm 套件安裝。",
        bin: "qoder",
        install: npm("@qoder-ai/qodercli", &[]),
    },
    HarnessManifest {
        id: "dsh",
        surface: Surface::Both,
        website_url: "https://deepseek.com/harness",
        docs_url: "https://github.com/deepseek-ai/deepseek-harness",
        desktop_url: Some("https://deepseek.com/harness"),
        desktop_note: "DeepSeek Harness 以桌面版為主，也提供 dsh CLI；兩者使用同一個 ~/.dsh 設定目錄。",
        bin: "dsh",
        install: npm("@deepseek-ai/dsh", &[]),
    },
    HarnessManifest {
        id: "zcode",
        surface: Surface::Both,
        website_url: "https://zcode.z.ai/",
        docs_url: "https://github.com/zai-org/ZCode",
        desktop_url: Some("https://zcode.z.ai/"),
        desktop_note: "ZCode Desktop 內建同一套 ZCode agent runtime，provider 設定位於共用的 ~/.zcode 目錄。",
        bin: "zcode",
        install: None,
    },
    HarnessManifest {
        id: "hermes",
        surface: Surface::Both,
        website_url: "https://hermes-agent.nousresearch.com/",
        docs_url: "https://hermes-agent.nousresearch.com/docs/user-guide/configuration",
        desktop_url: Some("https://hermes-agent.nousresearch.com/"),
        desktop_note: "Hermes Desktop 與 CLI 都將設定保存在 ~/.hermes；桌面版可直接沿用同一份 config.yaml。",
        bin: "hermes",
        install: None,
    },
    HarnessManifest {
        id: "commandcode",
        surface: Surface::Cli,
        website_url: "https://commandcode.ai/",
        docs_url: "https://commandcode.ai/docs/quickstart",
        desktop_url: Some("https://commandcode.ai/"),
        desktop_note: "Command Code 已提供官方桌面版；目前 kumoSwitch 只驗證 CLI 的 providers.json 路徑，桌面版請從官網下載。",
        bin: "commandcode",
        install: npm("command-code", &[]),
    },
    HarnessManifest {
        id: "crush",
        surface: Surface::Cli,
        website_url: "https://charm.land/crush",
        docs_url: "https://github.com/charmbracelet/crush",
        desktop_url: None,
        desktop_note: "Crush 是終端 TUI；官方桌面通知功能不等於獨立桌面 Harness。",
        bin: "crush",
        install: npm("@charmland/crush", &[]),
    },
    HarnessManifest {
        id: "qwen",
        surface: Surface::Both,
        website_url: "https://qwenlm.github.io/qwen-code-docs/",
        docs_url: "https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/",
        desktop_url: Some("https://github.com/QwenLM/qwen-code/releases/tag/desktop-latest"),
        desktop_note: "Qwen Code Desktop 與 CLI 共用 ~/.qwen/settings.json；桌面版可從官方 release 下載。",
        bin: "qwen",
        install: npm("@qwen-code/qwen-code", &[]),
    },
    HarnessManifest {
        id: "kilo",
        surface: Surface::Cli,
        website_url: "https://kilo.ai/",
        docs_url: "https://github.com/Kilo-Org/kilocode",
        desktop_url: None,
        desktop_note: "Kilo Code 的編輯器擴充與 CLI 使用不同設定；kumoSwitch 目前管理並驗證 CLI 設定。",
        bin: "kilo",
        install: npm("@kilocode/cli", &[]),
    },
    HarnessManifest {
        id: "pi",
        surface: Surface::Cli,
        website_url: "https://pi.dev/",
        docs_url: "https://github.com/earendil-works/pi",
        desktop_url: None,
        desktop_note: "Pi 官方是終端 coding agent；社群有桌面 GUI，但不是第一方共用設定，因此不標示為桌面支援。",
        bin: "pi",
        install: npm("@earendil-works/pi-coding-agent", &["--ignore-scripts"]),
    },
    HarnessManifest {
        id: "omp",
        surface: Surface::Cli,
        website_url: "https://omp.sh/",
        docs_url: "https://github.com/can1357/oh-my-pi",
        desktop_url: None,
        desktop_note: "Oh My Pi 官方是 CLI；社群 GUI 不列入第一方桌面支援。",
        bin: "omp",
        install: npm("@oh-my-pi/pi-coding-agent", &[]),
    },
];

pub fn find(id: &str) -> Option<&'static HarnessManifest> {
    MANIFESTS.iter().find(|item| item.id == id)
}

pub fn surface_for(id: &str) -> Surface {
    find(id).map(|item| item.surface).unwrap_or(Surface::Cli)
}

#[derive(Clone, Debug, Serialize)]
pub struct HarnessManagerEntry {
    pub id: &'static str,
    pub name: &'static str,
    pub blurb: &'static str,
    pub surface: &'static str,
    pub surface_label: &'static str,
    pub config_path: String,
    pub config_dir: String,
    pub detected: bool,
    pub cli_path: Option<String>,
    pub installed: bool,
    pub website_url: &'static str,
    pub docs_url: &'static str,
    pub desktop_url: Option<&'static str>,
    pub desktop_available: bool,
    pub desktop_note: &'static str,
    pub install_manager: Option<&'static str>,
    pub install_package: Option<&'static str>,
    pub install_command: Option<String>,
    pub installable: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct HarnessInstallResult {
    pub ok: bool,
    pub command: String,
    pub output: String,
    pub exit_code: i32,
}

pub fn manager_entries() -> Vec<HarnessManagerEntry> {
    TOOLS
        .iter()
        .filter_map(|tool| {
            let manifest = find(tool.id)?;
            let config_dir = adapters::tool_dir(tool);
            let config_path = adapters::resolve_file(tool, tool.default_file);
            let cli_path = find_executable(manifest.bin);
            let detected = config_dir.exists();
            Some(HarnessManagerEntry {
                id: tool.id,
                name: tool.name,
                blurb: tool.blurb,
                surface: manifest.surface.as_str(),
                surface_label: manifest.surface.label(),
                config_path: adapters::display_path(&config_path),
                config_dir: adapters::display_path(&config_dir),
                detected,
                installed: detected || cli_path.is_some(),
                cli_path,
                website_url: manifest.website_url,
                docs_url: manifest.docs_url,
                desktop_url: manifest.desktop_url,
                desktop_available: manifest.desktop_url.is_some(),
                desktop_note: manifest.desktop_note,
                install_manager: manifest.install.map(|item| item.manager),
                install_package: manifest.install.map(|item| item.package),
                install_command: manifest.install.map(|item| item.command()),
                installable: manifest.install.is_some(),
            })
        })
        .collect()
}

pub fn install(id: &str) -> Result<HarnessInstallResult, String> {
    let manifest = find(id).ok_or_else(|| format!("未知的 Harness：{id}"))?;
    let installer = manifest
        .install
        .ok_or_else(|| format!("{} 尚無安全的內建安裝命令，請使用官方下載頁", manifest.id))?;
    if installer.manager != "npm" {
        return Err("目前只允許預先定義的 npm 安裝命令".into());
    }

    let _guard = INSTALL_LOCK
        .lock()
        .map_err(|_| "另一個 Harness 安裝工作仍在進行".to_string())?;
    let command_text = installer.command();
    crate::audit::record("harness.install.start", command_text.clone());

    let mut command = std::process::Command::new(installer.program());
    command.args(installer.args());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command
        .output()
        .map_err(|error| format!("找不到 npm，請先安裝 Node.js／npm：{error}"))?;
    let exit_code = output.status.code().unwrap_or(-1);
    let mut combined = String::new();
    if !output.stdout.is_empty() {
        combined.push_str(&String::from_utf8_lossy(&output.stdout));
    }
    if !output.stderr.is_empty() {
        if !combined.is_empty() && !combined.ends_with('\n') {
            combined.push('\n');
        }
        combined.push_str(&String::from_utf8_lossy(&output.stderr));
    }
    let output_text = tail_chars(combined.trim(), 12_000);
    let ok = output.status.success();
    crate::audit::record(
        if ok { "harness.install.ok" } else { "harness.install.failed" },
        format!("{command_text}; exit={exit_code}"),
    );
    Ok(HarnessInstallResult {
        ok,
        command: command_text,
        output: output_text,
        exit_code,
    })
}

fn tail_chars(text: &str, limit: usize) -> String {
    let count = text.chars().count();
    if count <= limit {
        return text.to_string();
    }
    let tail: String = text.chars().skip(count - limit).collect();
    format!("…（略過前面的輸出）\n{tail}")
}

fn find_executable(bin: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("where.exe");
        command.arg(bin);
        command
    };
    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut command = std::process::Command::new("which");
        command.arg(bin);
        command
    };
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    #[test]
    fn every_adapter_has_exactly_one_manifest() {
        let manifest_ids: BTreeSet<_> = MANIFESTS.iter().map(|item| item.id).collect();
        let tool_ids: BTreeSet<_> = TOOLS.iter().map(|item| item.id).collect();
        assert_eq!(manifest_ids, tool_ids);
        assert_eq!(MANIFESTS.len(), TOOLS.len());
    }

    #[test]
    fn package_installers_are_fixed_and_shell_free() {
        for manifest in MANIFESTS {
            if let Some(installer) = manifest.install {
                assert_eq!(installer.manager, "npm", "{}", manifest.id);
                assert!(installer.package.starts_with('@') || installer.package.contains('-'));
                assert!(installer.package.chars().all(|ch| {
                    ch.is_ascii_alphanumeric() || matches!(ch, '@' | '/' | '.' | '_' | '-')
                }), "unsafe package name for {}: {}", manifest.id, installer.package);
                let command = installer.command();
                assert!(command.starts_with("npm"));
                assert!(command.contains("install -g"));
                assert!(!command.chars().any(|ch| matches!(ch, ';' | '&' | '|' | '`' | '\n' | '\r')));
            }
        }
    }

    #[test]
    fn desktop_surfaces_have_a_download_or_product_url() {
        for manifest in MANIFESTS {
            if manifest.surface != Surface::Cli {
                let url = manifest.desktop_url.expect(manifest.id);
                assert!(url.starts_with("https://"), "{}", manifest.id);
            }
            assert!(manifest.website_url.starts_with("https://"), "{}", manifest.id);
            assert!(manifest.docs_url.starts_with("https://"), "{}", manifest.id);
        }
    }

    #[test]
    fn pi_and_omp_remain_first_class_cli_harnesses() {
        assert_eq!(surface_for("pi"), Surface::Cli);
        assert_eq!(surface_for("omp"), Surface::Cli);
        assert!(find("pi").unwrap().install.is_some());
        assert!(find("omp").unwrap().install.is_some());
    }
}

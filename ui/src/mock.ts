import type {
  AppInfo,
  ApplyResult,
  BackupInfo,
  ExportResult,
  FileDiff,
  Fmt,
  ImportResult,
  JsonImportResult,
  Preview,
  Provider,
  TestResult,
  ToolView,
} from "./types";

/**
 * Browser preview backend. Enabled with `?mock=1`; nothing here touches Tauri.
 * State lives in memory so save / delete / apply / import all behave believably
 * while someone clicks around in a plain browser.
 */

const HOME = "C:\\Users\\dev";

function p(
  id: string,
  configId: string,
  name: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  kind: string,
  note: string,
): Provider {
  return { id, config_id: configId, name, base_url: baseUrl, api_key: apiKey, model, kind, note };
}

const PROVIDERS: Record<string, Provider[]> = {
  codex: [
    p(
      "cx-1",
      "opencode-go",
      "OpenCode Go",
      "https://opencode.ai/zen/go/v1",
      "sk-zen-8f31c0d9f2a",
      "glm-5.3-flash",
      "responses",
      "主力",
    ),
    p(
      "cx-2",
      "command-code",
      "Command Code",
      "https://api.commandcode.ai/v1",
      "sk-cc-77b21e4041d7",
      "muse-spark-1.3",
      "chat",
      "command-code",
    ),
  ],
  claude: [
    p(
      "cl-1",
      "zen-anthropic",
      "Zen Anthropic",
      "https://opencode.ai/zen",
      "sk-ant-2b7ce19a4410",
      "claude-sonnet-4-6",
      "",
      "熱切換",
    ),
  ],
  gemini: [],
  grok: [],
  opencode: [
    p(
      "oc-1",
      "opencode-go",
      "OpenCode Go",
      "https://opencode.ai/zen/go/v1",
      "sk-zen-8f31c0d9f2a",
      "glm-5.3-flash",
      "openai",
      "",
    ),
  ],
  qoder: [
    p("qd-1", "zen-go", "Zen Go", "https://opencode.ai/zen/go/v1", "sk-zen-8f31c0d9f2a", "glm-5.3-flash", "openai", "日常"),
    p("qd-2", "dashscope", "DashScope", "https://dashscope.aliyuncs.com/compatible-mode/v1", "sk-ds-51a0bb73e2c8", "qwen3-coder-plus", "openai", "備援"),
    p("qd-3", "local-ollama", "本機 Ollama", "http://127.0.0.1:11434/v1", "ollama", "qwen2.5-coder:14b", "openai", "離線"),
  ],
  zcode: [],
  hermes: [],
  commandcode: [],
  dsh: [
    p("ds-1", "deepseek", "DeepSeek 官方", "https://api.deepseek.com/v1", "sk-dsk-90f4a1c73b6e", "deepseek-chat", "openai-completions", "官方"),
    p("ds-2", "zen-go", "Zen Go", "https://opencode.ai/zen/go/v1", "sk-zen-8f31c0d9f2a", "glm-5.3-flash", "openai-responses", ""),
  ],
};

const ACTIVE: Record<string, string | null> = {
  codex: "cx-1",
  claude: "cl-1",
  gemini: null,
  grok: null,
  opencode: "oc-1",
  qoder: "qd-1",
  zcode: null,
  hermes: null,
  commandcode: null,
  dsh: "ds-1",
};

interface Seed {
  id: string;
  name: string;
  blurb: string;
  file: string;
  format: Fmt;
  verified: boolean;
  restart: string;
  detected: boolean;
  takeover: boolean;
  kinds: string[];
  importable: number;
  current: { base_url: string; model: string; api_key_tail: string; source: string };
}

const SEEDS: Seed[] = [
  {
    id: "codex",
    name: "Codex",
    blurb: "OpenAI Codex CLI",
    file: ".codex/config.toml",
    format: "TOML",
    verified: true,
    restart: "需要重開終端或 Codex 才會生效",
    detected: true,
    takeover: false,
    kinds: ["responses", "chat"],
    importable: 2,
    current: {
      base_url: "https://opencode.ai/zen/go/v1",
      model: "glm-5.3-flash",
      api_key_tail: "••••9f2a",
      source: "model_providers.opencode-go.base_url",
    },
  },
  {
    id: "claude",
    name: "Claude Code",
    blurb: "Anthropic Claude Code CLI",
    file: ".claude/settings.json",
    format: "JSON",
    verified: true,
    restart: "Claude Code 支援熱切換，新開的 session 即生效",
    detected: true,
    takeover: true,
    kinds: [],
    importable: 1,
    current: {
      base_url: "https://opencode.ai/zen",
      model: "claude-sonnet-4-6",
      api_key_tail: "••••4410",
      source: "env.ANTHROPIC_BASE_URL",
    },
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    blurb: "Google Gemini CLI",
    file: ".gemini/settings.json",
    format: "JSON",
    verified: true,
    restart: "需要重開終端",
    detected: false,
    takeover: false,
    kinds: [],
    importable: 0,
    current: { base_url: "", model: "", api_key_tail: "", source: "" },
  },
  {
    id: "grok",
    name: "Grok Build",
    blurb: "xAI Grok Build CLI",
    file: ".grok/config.toml",
    format: "TOML",
    verified: true,
    restart: "需要重開終端",
    detected: false,
    takeover: false,
    kinds: [],
    importable: 0,
    current: { base_url: "", model: "", api_key_tail: "", source: "" },
  },
  {
    id: "opencode",
    name: "OpenCode",
    blurb: "sst/opencode",
    file: ".config/opencode/opencode.json",
    format: "JSON",
    verified: true,
    restart: "需要重開終端",
    detected: true,
    takeover: false,
    kinds: ["openai", "anthropic", "responses"],
    importable: 1,
    current: {
      base_url: "https://opencode.ai/zen/go/v1",
      model: "opencode-go/glm-5.3-flash",
      api_key_tail: "••••9f2a",
      source: "provider.opencode-go.options.baseURL",
    },
  },
  {
    id: "qoder",
    name: "Qoder",
    blurb: "Qoder CLI 自訂模型",
    file: ".qoder/settings.json",
    format: "JSON",
    verified: true,
    restart: "改完在 Qoder 重新載入模型設定",
    detected: true,
    takeover: false,
    kinds: ["openai", "openai-responses"],
    importable: 0,
    current: { base_url: "", model: "", api_key_tail: "", source: "" },
  },
  {
    id: "zcode",
    name: "ZCode",
    blurb: "Z.ai ZCode CLI",
    file: ".zcode/v2/config.json",
    format: "JSON",
    verified: false,
    restart: "需要重開終端",
    detected: false,
    takeover: false,
    kinds: [],
    importable: 0,
    current: { base_url: "", model: "", api_key_tail: "", source: "" },
  },
  {
    id: "hermes",
    name: "Hermes",
    blurb: "Nous Research Hermes CLI",
    file: ".hermes/config.yaml",
    format: "YAML",
    verified: false,
    restart: "需要重開終端",
    detected: false,
    takeover: false,
    kinds: [],
    importable: 0,
    current: { base_url: "", model: "", api_key_tail: "", source: "" },
  },
  {
    id: "commandcode",
    name: "Command Code",
    blurb: "Command Code CLI",
    file: ".commandcode/providers.json",
    format: "JSON",
    verified: false,
    restart: "需要重開終端",
    detected: false,
    takeover: false,
    kinds: ["openai", "anthropic", "responses"],
    importable: 0,
    current: { base_url: "", model: "", api_key_tail: "", source: "" },
  },
  {
    id: "dsh",
    name: "DSH",
    blurb: "DeepSeek Harness",
    file: ".dsh/settings.yaml",
    format: "YAML",
    verified: true,
    restart: "需要重開 DSH 桌面端",
    detected: true,
    takeover: false,
    kinds: ["openai-completions", "openai-responses", "anthropic-messages"],
    importable: 1,
    current: {
      base_url: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      api_key_tail: "••••3b6e",
      source: "llm-pi-ai.providers.deepseek.baseURL",
    },
  },
];

const BACKUPS: Record<string, BackupInfo[]> = {
  codex: [
    { id: "20261110-091422", created: "2026-11-10 09:14:22", files: [`${HOME}\\.codex\\config.toml`] },
    { id: "20261109-183007", created: "2026-11-09 18:30:07", files: [`${HOME}\\.codex\\config.toml`] },
    {
      id: "20261108-220155",
      created: "2026-11-08 22:01:55",
      files: [`${HOME}\\.codex\\config.toml`, `${HOME}\\.codex\\auth.json`],
    },
  ],
  claude: [{ id: "20261110-080512", created: "2026-11-10 08:05:12", files: [`${HOME}\\.claude\\settings.json`] }],
  dsh: [{ id: "20261107-141233", created: "2026-11-07 14:12:33", files: [`${HOME}\\.dsh\\settings.yaml`] }],
};

function displayPath(rel: string): string {
  return `~/${rel}`;
}

function toolViews(): ToolView[] {
  return SEEDS.map((s) => ({
    id: s.id,
    name: s.name,
    blurb: s.blurb,
    path: displayPath(s.file),
    format: s.format,
    verified: s.verified,
    restart: s.restart,
    detected: s.detected,
    takeover: s.takeover,
    provider_count: (PROVIDERS[s.id] ?? []).length,
    active_id: ACTIVE[s.id] ?? null,
    current: { ...s.current },
    kind_choices: [...s.kinds],
    importable: s.importable,
  }));
}

function seedOf(tool: string): Seed {
  const seed = SEEDS.find((s) => s.id === tool);
  if (!seed) throw new Error(`未知的工具：${tool}`);
  return seed;
}

function listOf(tool: string): Provider[] {
  return (PROVIDERS[tool] ?? []).map((x) => ({ ...x }));
}

function findProvider(tool: string, id: string): Provider {
  const found = (PROVIDERS[tool] ?? []).find((x) => x.id === id);
  if (!found) throw new Error("找不到這個供應商");
  return found;
}

function tail(key: string): string {
  return key ? `••••${key.slice(-4)}` : "";
}

/* ------------------------------------------------------------------ diffs */

function countDiff(lines: string[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
  }
  return { added, removed };
}

function fileDiff(file: string, fmt: Fmt, body: string[], existed = true): FileDiff {
  const lines = ["--- 目前", "+++ 套用後", ...body];
  const { added, removed } = countDiff(lines);
  return { file, fmt, existed, diff: lines.join("\n"), added, removed };
}

function tomlPreview(tool: string, target: Provider): FileDiff {
  const seed = seedOf(tool);
  const activeId = ACTIVE[tool];
  const from = activeId ? findProvider(tool, activeId) : target;
  const modelLine = target.model ? [`-model = "${from.model}"`, `+model = "${target.model}"`] : [];
  const body = [
    "@@ -1,8 +1,8 @@",
    " # Codex CLI — 供應商鍵位由 SwitchYard 維護",
    `-model_provider = "${from.config_id}"`,
    `+model_provider = "${target.config_id}"`,
    ...modelLine,
    ' approval_policy = "on-request"',
    " ",
    " [desktop]",
    ' theme = "dark"',
    " notifications = true",
    "@@ -14,9 +14,9 @@",
    " [history]",
    ' persistence = "save-all"',
    " ",
    `-[model_providers.${from.config_id}]`,
    `-name = "${from.name}"`,
    `-base_url = "${from.base_url}"`,
    `-wire_api = "${from.kind || "responses"}"`,
    `-experimental_bearer_token = "${from.api_key}"`,
    `+[model_providers.${target.config_id}]`,
    `+name = "${target.name}"`,
    `+base_url = "${target.base_url}"`,
    `+wire_api = "${target.kind || "responses"}"`,
    `+experimental_bearer_token = "${target.api_key}"`,
    " requires_openai_auth = false",
  ];
  return fileDiff(displayPath(seed.file), "TOML", body);
}

function jsonPreview(tool: string, target: Provider): FileDiff {
  const seed = seedOf(tool);
  const activeId = ACTIVE[tool];
  const from = activeId ? findProvider(tool, activeId) : target;
  let body: string[];
  if (tool === "claude") {
    body = [
      "@@ -2,9 +2,9 @@",
      " {",
      '   "permissions": { "allow": ["Bash", "Read"] },',
      '   "env": {',
      `-    "ANTHROPIC_BASE_URL": "${from.base_url}",`,
      `-    "ANTHROPIC_AUTH_TOKEN": "${from.api_key}",`,
      `-    "ANTHROPIC_MODEL": "${from.model}",`,
      `+    "ANTHROPIC_BASE_URL": "${target.base_url}",`,
      `+    "ANTHROPIC_AUTH_TOKEN": "${target.api_key}",`,
      `+    "ANTHROPIC_MODEL": "${target.model}",`,
      '     "CLAUDE_CODE_DISABLE_TELEMETRY": "1"',
      "   },",
      '   "includeCoAuthoredBy": false',
      " }",
    ];
  } else {
    body = [
      "@@ -3,12 +3,12 @@",
      " {",
      '   "$schema": "https://opencode.ai/config.json",',
      `-  "model": "${from.config_id}/${from.model}",`,
      `+  "model": "${target.config_id}/${target.model}",`,
      '   "provider": {',
      `+    "${target.config_id}": {`,
      ' +      "npm": "@ai-sdk/openai-compatible",',
      `+      "name": "${target.name}",`,
      `+      "options": { "baseURL": "${target.base_url}", "apiKey": "${target.api_key}" },`,
      `+      "models": { "${target.model}": { "name": "${target.model}" } }`,
      " +    },",
      `     "${from.config_id}": {`,
      '       "npm": "@ai-sdk/openai-compatible",',
      `       "options": { "baseURL": "${from.base_url}" }`,
      "     }",
      "   },",
      '   "autoshare": false',
      " }",
    ];
  }
  return fileDiff(displayPath(seed.file), "JSON", body);
}

function yamlPreview(tool: string, target: Provider): FileDiff {
  const seed = seedOf(tool);
  const activeId = ACTIVE[tool];
  const from = activeId ? findProvider(tool, activeId) : target;
  const body = [
    "@@ -1,10 +1,10 @@",
    " # DSH settings",
    " agent-default-model:",
    `-  provider: ${from.config_id}`,
    `-  model: ${from.model}`,
    `+  provider: ${target.config_id}`,
    `+  model: ${target.model}`,
    " llm-pi-ai:",
    "   providers:",
    `+    ${target.config_id}:`,
    `+      displayName: ${target.name}`,
    `+      api: ${target.kind || "openai-completions"}`,
    `+      baseURL: ${target.base_url}`,
    `+      apiKey: ${target.api_key}`,
    "+      models:",
    `+        - id: ${target.model}`,
    `+          name: ${target.model}`,
    `     ${from.config_id}:`,
    `       baseURL: ${from.base_url}`,
    " telemetry:",
    "   enabled: false",
  ];
  return fileDiff(displayPath(seed.file), "YAML", body);
}

function buildPreview(tool: string, providerId: string): Preview {
  const seed = seedOf(tool);
  const target = findProvider(tool, providerId);
  const file =
    seed.format === "TOML"
      ? tomlPreview(tool, target)
      : seed.format === "YAML"
        ? yamlPreview(tool, target)
        : jsonPreview(tool, target);

  const warnings: string[] = [];
  if (!target.model.trim()) {
    warnings.push(`此供應商未填模型，將沿用目前的 ${seed.current.model || "（工具預設）"}`);
  }
  if (!seed.verified) {
    warnings.push(`${seed.name} 的設定格式尚未實測，請逐行確認 diff 後再套用。`);
  }
  if (seed.takeover) {
    warnings.push("cc-switch 正在接管這個工具，套用後可能被它的代理模式覆蓋。");
  }
  const activeId = ACTIVE[tool];
  if (activeId && activeId !== providerId) {
    const from = findProvider(tool, activeId);
    warnings.push(`舊供應商「${from.name}」的區塊會原樣保留，SwitchYard 只更新目標供應商的鍵位。`);
  }
  if (!target.api_key.trim()) {
    warnings.push("此供應商未填 API Key，將寫入空字串；多數工具會回報 401。");
  }
  return { files: [file], warnings };
}

/* ----------------------------------------------------------------- invoke */

let counter = 100;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function slug(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `provider-${counter}`;
}

export async function mockInvoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  await delay(60);
  const tool = typeof args.tool === "string" ? args.tool : "";

  switch (cmd) {
    case "app_info":
      return {
        version: "0.1.0",
        dataDir: `${HOME}\\AppData\\Roaming\\io.github.switchyard`,
        encrypted: true,
      } satisfies AppInfo;

    case "tool_list":
      return toolViews();

    case "provider_list":
      return listOf(tool);

    case "provider_save": {
      const incoming = args.provider as Provider;
      if (!incoming.name.trim()) throw new Error("請填寫供應商名稱");
      if (!incoming.base_url.trim()) throw new Error("請填寫 Base URL");
      const seed = seedOf(tool);
      const bucket = PROVIDERS[tool] ?? (PROVIDERS[tool] = []);
      const saved: Provider = {
        ...incoming,
        id: incoming.id || `mock-${++counter}`,
        config_id: incoming.config_id || slug(incoming.name),
        kind: incoming.kind || seed.kinds[0] || "",
      };
      const at = bucket.findIndex((x) => x.id === saved.id);
      if (at >= 0) bucket[at] = saved;
      else bucket.push(saved);
      return { ...saved };
    }

    case "provider_delete": {
      const id = String(args.id ?? "");
      PROVIDERS[tool] = (PROVIDERS[tool] ?? []).filter((x) => x.id !== id);
      if (ACTIVE[tool] === id) ACTIVE[tool] = null;
      return undefined;
    }

    case "preview":
      return buildPreview(tool, String(args.providerId ?? ""));

    case "apply_provider": {
      const id = String(args.providerId ?? "");
      const target = findProvider(tool, id);
      const seed = seedOf(tool);
      const preview = buildPreview(tool, id);
      ACTIVE[tool] = id;
      seed.current = {
        base_url: target.base_url,
        model: target.model || seed.current.model,
        api_key_tail: tail(target.api_key),
        source: seed.current.source || `${target.config_id}.base_url`,
      };
      const stamp = "20261110-101500";
      const list = BACKUPS[tool] ?? (BACKUPS[tool] = []);
      list.unshift({ id: stamp, created: "2026-11-10 10:15:00", files: preview.files.map((f) => f.file) });
      return {
        changed: true,
        backup_id: stamp,
        written: preview.files.map((f) => f.file),
        message: `已套用「${target.name}」`,
      } satisfies ApplyResult;
    }

    case "backup_list":
      return (BACKUPS[tool] ?? []).map((b) => ({ ...b, files: [...b.files] }));

    case "backup_restore": {
      const id = String(args.id ?? "");
      const found = (BACKUPS[tool] ?? []).find((b) => b.id === id);
      if (!found) throw new Error("找不到這份備份");
      return [...found.files];
    }

    case "reveal_config":
      return undefined;

    case "import_from_config": {
      const seed = seedOf(tool);
      const bucket = PROVIDERS[tool] ?? (PROVIDERS[tool] = []);
      const imported: Provider[] = [];
      for (let i = 0; i < seed.importable; i += 1) {
        const candidate = p(
          `imp-${tool}-${++counter}`,
          `${tool}-from-config-${i + 1}`,
          `${seed.name} 設定檔供應商 ${i + 1}`,
          i === 0 ? "https://api.moonshot.cn/v1" : "https://open.bigmodel.cn/api/paas/v4",
          i === 0 ? "sk-ms-4471ba90c2e5" : "sk-zhipu-77c1d0a83f19",
          i === 0 ? "kimi-k2-turbo" : "glm-4.7",
          seed.kinds[0] ?? "",
          "從設定檔導入",
        );
        bucket.push(candidate);
        imported.push(candidate);
      }
      return { imported, skipped: seed.importable > 0 ? 1 : 0 } satisfies ImportResult;
    }

    case "test_provider": {
      const id = String(args.providerId ?? "");
      const target = findProvider(tool, id);
      await delay(320);
      const bad = /command-code|ollama/.test(target.config_id);
      const status = bad ? 401 : 200;
      return {
        ok: status === 200,
        status,
        ms: bad ? 412 : 128 + (target.name.length % 7) * 23,
        message: bad ? "Unauthorized：API Key 無效或已過期" : "OK",
      } satisfies TestResult;
    }

    case "export_providers": {
      const count = Object.values(PROVIDERS).reduce((n, list) => n + list.length, 0);
      return {
        path: `${HOME}\\Documents\\switchyard-providers-20261110.json`,
        count,
      } satisfies ExportResult;
    }

    case "import_providers_json": {
      const text = String(args.text ?? "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("檔案不是合法的 JSON");
      }
      const rows = Array.isArray(parsed) ? parsed : [];
      return { imported: Math.max(rows.length, 3), skipped: 1 } satisfies JsonImportResult;
    }

    default:
      throw new Error(`預覽模式沒有實作的指令：${cmd}`);
  }
}
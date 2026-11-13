import type {
  Sample,
  HistoryMap,
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
  ProxyConfig,
  ModelTestResult,
  ModelDiscovery,
  LiveTestPolicy,
  DriftReport,
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
  return {
    id,
    config_id: configId,
    name,
    base_url: baseUrl,
    api_key: apiKey,
    model,
    models: model ? [{ id: model, name: model }] : [],
    kind,
    note,
  };
}

const PROVIDERS: Record<string, Provider[]> = {
  codex: [
    {
      ...p(
        "cx-1",
        "opencode-go",
        "OpenCode Go",
        "https://opencode.ai/zen/go/v1",
        "sk-zen-8f31c0d9f2a",
        "glm-5.3-flash",
        "responses",
        "主力",
      ),
      models: [
        { id: "glm-5.3-flash", name: "GLM 5.3 Flash", context_window: 128000, max_output: 16384, reasoning: true, tools: true, favorite: true, last_used_at: Date.now() - 120000 },
        { id: "muse-spark-1.3", name: "Muse Spark 1.3", context_window: 128000, max_output: 16384, reasoning: true, tools: true, last_seen_at: Date.now() - 86400000 },
      ],
    },
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

const PREVIOUS: Record<string, string | null> = {};

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

function fakeSummary(seed: string): HistoryMap[string] {
  const now = Date.now();
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 997;
  const bad = /ollama|command-code/i.test(seed);
  const samples: Sample[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const fail = bad ? i % 3 === 0 : i === 4;
    samples.push({
      ts: now - i * 3600_000,
      ok: !fail,
      ms: fail ? 0 : 80 + ((h + i * 37) % 180),
      status: fail ? 500 : 200,
    });
  }
  const ok = samples.filter((s) => s.ok);
  return {
    samples,
    success_rate: ok.length / samples.length,
    avg_ms: ok.length ? Math.round(ok.reduce((n, s) => n + s.ms, 0) / ok.length) : 0,
    last_ts: now,
    total: samples.length,
  };
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
    previous_id: PREVIOUS[s.id] ?? null,
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
    " # Codex CLI — 供應商鍵位由 kumoSwitch 維護",
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
  return fileDiff(displayPath(seed.file), "TOML", redactPreviewKeys(body));
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
  return fileDiff(displayPath(seed.file), "JSON", redactPreviewKeys(body));
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
  return fileDiff(displayPath(seed.file), "YAML", redactPreviewKeys(body));
}

function redactPreviewKeys(lines: string[]): string[] {
  const keys = Object.values(PROVIDERS)
    .flat()
    .map((provider) => provider.api_key)
    .filter((key) => key.length >= 4)
    .sort((left, right) => right.length - left.length);
  return lines.map((line) => {
    let redacted = line;
    for (const key of keys) redacted = redacted.split(key).join(maskKey(key));
    return redacted;
  });
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
    warnings.push(`舊供應商「${from.name}」的區塊會原樣保留，kumoSwitch 只更新目標供應商的鍵位。`);
  }
  if (!target.api_key.trim()) {
    warnings.push("此供應商未填 API Key，將寫入空字串；多數工具會回報 401。");
  }
  const changedFields = ["供應商", "模型", "Base URL", "API Key"].filter((label) => {
    if (label === "模型") return file.diff.includes("model");
    if (label === "Base URL") return /base_?url|baseURL/i.test(file.diff);
    if (label === "API Key") return /api_?key|auth_token|bearer_token/i.test(file.diff);
    return /provider/i.test(file.diff);
  });
  return { files: [file], warnings, changed_fields: changedFields };
}

/* ----------------------------------------------------------------- invoke */

let counter = 100;
let liveTestDailyLimit = 20;
let liveTestMaxOutputTokens = 8;
let liveTestUsed24h = 3;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function slug(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `provider-${counter}`;
}

function maskKey(key: string): string {
  if (!key) return "";
  return `••••${key.slice(-4)}`;
}

function providerView(provider: Provider): Provider {
  return {
    ...provider,
    api_key: "",
    api_key_masked: maskKey(provider.api_key),
    has_api_key: provider.api_key.length > 0,
    clear_api_key: false,
    model_sync_interval_secs: provider.model_sync_interval_secs ?? 86_400,
    model_sync_jitter_secs: provider.model_sync_jitter_secs ?? 300,
    model_sync_next_at: provider.model_sync_next_at ?? Date.now() + 86_400_000,
    model_sync_retry_at: provider.model_sync_retry_at ?? 0,
    model_sync_failures: provider.model_sync_failures ?? 0,
    model_sync_last_error: provider.model_sync_last_error ?? "",
  };
}

export async function mockInvoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  await delay(60);
  const tool = typeof args.tool === "string" ? args.tool : "";

  switch (cmd) {
    case "app_info":
      return {
        version: "0.14.0",
        dataDir: `${HOME}\\AppData\\Roaming\\kumoSwitch`,
        encrypted: true,
        autoModelSync: false,
      } satisfies AppInfo;

    case "tool_list": {
      const views = toolViews();
      if (window.location.hash.includes("onboard")) {
        return views.map((t) => ({ ...t, provider_count: 0, active_id: null }));
      }
      return views;
    }

    case "drift_overview": {
      const views = toolViews();
      return views.slice(0, 4).map((view, index) => {
        const provider = (PROVIDERS[view.id] ?? [])[0];
        const status: DriftReport["status"] = index === 0 ? "clean" : index === 1 ? "drifted" : index === 2 ? "unmanaged" : "empty";
        return {
          tool: view.id,
          tool_name: view.name,
          status,
          active_id: provider?.id ?? null,
          expected_name: provider?.name ?? null,
          current_base_url: status === "empty" ? "" : index === 1 ? "https://changed.invalid/v1" : provider?.base_url ?? "",
          current_model: status === "empty" ? "" : index === 1 ? "changed-model" : provider?.model ?? "",
          current_key_tail: provider ? tail(provider.api_key) : "",
          expected_base_url: provider?.base_url ?? "",
          expected_model: provider?.model ?? "",
          expected_key_tail: provider ? tail(provider.api_key) : "",
          changed_fields: status === "drifted" ? ["Base URL", "模型"] : status === "unmanaged" ? ["供應商", "未納管供應商"] : [],
          unmanaged_providers: status === "unmanaged" ? ["external-provider"] : [],
          message: status === "clean" ? "kumoSwitch 與實際設定一致" : status === "drifted" ? "實際設定與 kumoSwitch 紀錄不同" : status === "unmanaged" ? "目前設定不在 kumoSwitch 清單中" : "尚未偵測到目前套用的供應商",
        } satisfies DriftReport;
      });
    }

    case "provider_search_index":
      return toolViews().flatMap((view) => (PROVIDERS[view.id] ?? []).map((provider) => ({
        tool: view.id,
        tool_name: view.name,
        provider: providerView(provider),
      })));

    case "provider_list":
      return listOf(tool).map(providerView);

    case "provider_save": {
      const incoming = args.provider as Provider;
      if (!incoming.name.trim()) throw new Error("請填寫供應商名稱");
      if (!incoming.base_url.trim()) throw new Error("請填寫 Base URL");
      const seed = seedOf(tool);
      const bucket = PROVIDERS[tool] ?? (PROVIDERS[tool] = []);
      const id = incoming.id || `mock-${++counter}`;
      const existing = bucket.find((provider) => provider.id === id);
      let apiKey = incoming.api_key.trim();
      if (incoming.clear_api_key) apiKey = "";
      else if (!apiKey && existing) apiKey = existing.api_key;
      const saved: Provider = {
        ...incoming,
        id,
        config_id: incoming.config_id || slug(incoming.name),
        api_key: apiKey,
        kind: incoming.kind || seed.kinds[0] || "",
        clear_api_key: false,
      };
      const at = bucket.findIndex((x) => x.id === saved.id);
      if (at >= 0) bucket[at] = saved;
      else bucket.push(saved);
      return providerView(saved);
    }

    case "provider_clone": {
      const id = String(args.id ?? "");
      const source = findProvider(tool, id);
      const seed = seedOf(tool);
      const bucket = PROVIDERS[tool] ?? (PROVIDERS[tool] = []);
      const saved: Provider = {
        ...source,
        id: `mock-${++counter}`,
        config_id: slug(`${source.name}-copy-${counter}`),
        name: `${source.name} 副本`,
        kind: source.kind || seed.kinds[0] || "",
        last_used: 0,
      };
      bucket.push(saved);
      return providerView(saved);
    }

    case "reveal_provider_key": {
      const id = String(args.id ?? "");
      const provider = findProvider(tool, id);
      if (!provider.api_key) throw new Error("這個供應商沒有可用的 API Key");
      return provider.api_key;
    }

    case "provider_config_preview": {
      const id = String(args.id ?? "");
      const provider = findProvider(tool, id);
      const seed = seedOf(tool);
      const diff = buildPreview(tool, provider.id).files[0];
      return [{ file: displayPath(seed.file), fmt: diff.fmt, content: diff.diff }];
    }

    case "provider_select_model": {
      const id = String(args.id ?? "");
      const model = String(args.model ?? "");
      const provider = findProvider(tool, id);
      const models = provider.models ?? [{ id: provider.model, name: provider.model }];
      if (!models.some((item) => item.id === model)) throw new Error(`這個供應商沒有模型「${model}」`);
      if (provider.model && provider.model !== model) provider.previous_model = provider.model;
      provider.model = model;
      provider.models = models.map((item) => item.id === model ? { ...item, last_used_at: Date.now() } : item);
      return providerView(provider);
    }

    case "toggle_model_favorite": {
      const id = String(args.id ?? "");
      const modelId = String(args.modelId ?? "");
      const favorite = Boolean(args.favorite);
      const provider = findProvider(tool, id);
      const model = (provider.models ?? []).find((item) => item.id === modelId);
      if (!model) throw new Error(`這個供應商沒有模型「${modelId}」`);
      model.favorite = favorite;
      return { ...model };
    }

    case "archive_model": {
      const id = String(args.id ?? "");
      const modelId = String(args.modelId ?? "");
      const archived = Boolean(args.archived);
      const provider = findProvider(tool, id);
      const model = (provider.models ?? []).find((item) => item.id === modelId);
      if (!model) throw new Error(`這個供應商沒有模型「${modelId}」`);
      model.archived = archived;
      return { ...model };
    }

    case "discover_provider_models": {
      const providerId = String(args.providerId ?? "");
      const provider = findProvider(tool, providerId);
      await delay(460);
      const models = [
        {
          id: "glm-5.3-flash",
          name: "GLM 5.3 Flash",
          context_window: 256000,
          max_output: 16384,
          reasoning: true,
          tools: true,
          metadata: { source: "mock-models-endpoint" },
        },
        {
          id: "deepseek-v4.1-flash",
          name: "DeepSeek v4.1 Flash",
          context_window: 128000,
          max_output: 16384,
          reasoning: true,
          tools: true,
          metadata: { source: "mock-models-endpoint" },
        },
        {
          id: "qwen3-coder-plus",
          name: "Qwen3 Coder Plus",
          context_window: 262144,
          max_output: 32768,
          reasoning: false,
          tools: true,
          metadata: { source: "mock-models-endpoint" },
        },
      ];
      const returned = new Set(models.map((model) => model.id));
      const missing = (provider.models ?? []).map((model) => model.id).filter((id) => !returned.has(id));
      return {
        models,
        missing,
        endpoint: `${provider.base_url.replace(/\/$/, "")}/models`,
        message: `共找到 ${models.length} 個模型`,
      } satisfies ModelDiscovery;
    }

    case "test_model": {
      const providerId = String(args.providerId ?? "");
      const modelId = String(args.modelId ?? "");
      const provider = findProvider(tool, providerId);
      const model = (provider.models ?? []).find((item) => item.id === modelId);
      if (!model) throw new Error(`這個供應商沒有模型「${modelId}」`);
      await delay(220);
      const bad = /command-code|ollama/.test(provider.config_id);
      const status = bad ? 401 : 200;
      const result = {
        ok: status === 200,
        status,
        ms: bad ? 412 : 128 + (modelId.length % 7) * 23,
        message: bad ? "Unauthorized：API Key 無效或已過期" : `HTTP 200 · 模型「${modelId}」可用`,
      } satisfies TestResult;
      const checks = [...(model.checks ?? []), { ts: Date.now(), ok: result.ok, ms: result.ms, status }].slice(-20);
      const updated = { ...model, checks };
      provider.models = (provider.models ?? []).map((item) => item.id === modelId ? updated : item);
      return { model: updated, result } satisfies ModelTestResult;
    }

    case "live_test_policy":
      return {
        daily_limit: liveTestDailyLimit,
        used_24h: liveTestUsed24h,
        remaining_24h: Math.max(0, liveTestDailyLimit - liveTestUsed24h),
        max_output_tokens: liveTestMaxOutputTokens,
      } satisfies LiveTestPolicy;

    case "set_live_test_policy":
      liveTestDailyLimit = Math.max(1, Math.min(200, Number(args.dailyLimit) || 20));
      liveTestMaxOutputTokens = Math.max(1, Math.min(128, Number(args.maxOutputTokens) || 8));
      return {
        daily_limit: liveTestDailyLimit,
        used_24h: liveTestUsed24h,
        remaining_24h: Math.max(0, liveTestDailyLimit - liveTestUsed24h),
        max_output_tokens: liveTestMaxOutputTokens,
      } satisfies LiveTestPolicy;

    case "live_test_model": {
      const providerId = String(args.providerId ?? "");
      const modelId = String(args.modelId ?? "");
      if (liveTestUsed24h >= liveTestDailyLimit) {
        throw new Error(`近 24 小時實測配額已用完（${liveTestUsed24h}／${liveTestDailyLimit}）。請稍後再試或調整配額。`);
      }
      liveTestUsed24h += 1;
      const provider = findProvider(tool, providerId);
      const model = (provider.models ?? []).find((item) => item.id === modelId);
      if (!model) throw new Error(`這個供應商沒有模型「${modelId}」`);
      await delay(750);
      const bad = /command-code|ollama/.test(provider.config_id);
      const result = {
        ok: !bad,
        status: bad ? 401 : 200,
        ms: bad ? 618 : 842,
        message: bad ? "Unauthorized：實測金鑰無效" : `HTTP 200 · 最小推論請求成功（輸出上限 ${liveTestMaxOutputTokens} tokens）`,
      } satisfies TestResult;
      const updated = {
        ...model,
        checks: [...(model.checks ?? []), { ts: Date.now(), ok: result.ok, ms: result.ms, status: result.status }].slice(-20),
      };
      provider.models = (provider.models ?? []).map((item) => item.id === modelId ? updated : item);
      return { model: updated, result } satisfies ModelTestResult;
    }

    case "provider_reorder": {
      const ids = Array.isArray(args.ids) ? args.ids.map(String) : [];
      const bucket = PROVIDERS[tool] ?? (PROVIDERS[tool] = []);
      bucket.sort((left, right) => {
        const a = ids.indexOf(left.id);
        const b = ids.indexOf(right.id);
        return (a < 0 ? Number.MAX_SAFE_INTEGER : a) - (b < 0 ? Number.MAX_SAFE_INTEGER : b);
      });
      return bucket.map(providerView);
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
      if (ACTIVE[tool] && ACTIVE[tool] !== id) PREVIOUS[tool] = ACTIVE[tool] ?? null;
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

    case "set_auto_model_sync":
      return Boolean(args.enabled);

    case "proxy_status":
      return {
        enabled: false,
        port: 17890,
        stack: [],
        strategy: "ordered",
        policies: {},
      } satisfies ProxyConfig;
    case "proxy_save":
      return args.config;
    case "proxy_reset_metrics":
      return undefined;
    case "proxy_metrics":
      return {
        strategy: "health",
        targets: {
          "codex:cx-1": {
            active: 1,
            requests: 48,
            successes: 46,
            failures: 2,
            failovers: 3,
            success_rate: 0.958,
            consecutive_failures: 0,
            circuit_open_until: 0,
            last_ttfb_ms: 112,
            avg_ttfb_ms: 138,
            last_status: 200,
            last_used: Date.now(),
          },
        },
        logs: [
          { ts: Date.now(), target: "codex:cx-1", event: "success", status: 200, ttfb_ms: 112, message: "OK" },
          { ts: Date.now() - 5000, target: "codex:cx-2", event: "failover", status: 429, ttfb_ms: 86, message: "upstream rate limited (429); cooling down" },
        ],
        traces: [{
          id: 42,
          ts: Date.now(),
          method: "POST",
          path: "/v1/responses",
          requested_model: "glm-5.3-flash",
          strategy: "health",
          candidate_order: ["codex:cx-2", "codex:cx-1"],
          attempts: [
            { target: "codex:cx-2", order: 0, outcome: "rate_limited", reason: "429 限流，進入冷卻", status: 429, ttfb_ms: 86, circuit_open_until: Date.now() + 30_000, model: "glm-5.3-flash" },
            { target: "codex:cx-1", order: 1, outcome: "success", reason: "選中並成功回應", status: 200, ttfb_ms: 112, circuit_open_until: 0, model: "glm-5.3-flash" },
          ],
          selected: "codex:cx-1",
          final_status: 200,
          total_ms: 221,
          outcome: "success",
        }],
      };
    case "proxy_attach":
      return { changed: true, backup_id: "mock", written: ["config"], message: "已掛載代理" };

    case "import_scan":
      return Object.entries(PROVIDERS).flatMap(([tool, list]) =>
        list.map((provider) => ({
          tool,
          tool_name: seedOf(tool).name,
          config_id: provider.config_id,
          name: provider.name,
          base_url: provider.base_url,
          model: provider.model,
          models: provider.models ?? [],
          kind: provider.kind,
          conflict: true,
          differences: tool === "codex" ? ["目前模型"] : [],
        })),
      );

    case "import_apply": {
      const decisions = Array.isArray(args.decisions) ? args.decisions : [];
      const imported = decisions.filter((item) => item && typeof item === "object" && "action" in item && item.action !== "skip").length;
      return { imported, skipped: decisions.length - imported } satisfies JsonImportResult;
    }

    case "provider_presets":
      return [
        { id: "deepseek", name: "DeepSeek", base_url: "https://api.deepseek.com/v1", kind: "openai", models: ["deepseek-chat", "deepseek-reasoner"], docs: "https://api-docs.deepseek.com", note: "官方" },
        { id: "zhipu", name: "智譜 GLM", base_url: "https://open.bigmodel.cn/api/paas/v4", kind: "openai", models: ["glm-4.7"], docs: "https://open.bigmodel.cn", note: "官方" },
        { id: "opencode-zen", name: "OpenCode Zen", base_url: "https://opencode.ai/zen/go/v1", kind: "openai-responses", models: ["glm-5.3-flash"], docs: "https://opencode.ai", note: "聚合" },
        { id: "ollama", name: "Ollama（本機）", base_url: "http://127.0.0.1:11434/v1", kind: "openai", models: ["qwen2.5-coder:14b"], docs: "https://ollama.com", note: "本機、免金鑰" },
      ];

    case "health_overview":
      return { tests: 48, ok: 45, avg_ms: 162, providers_tested: 6 };

    case "usage_report": {
      const days = Number(args.days ?? 30);
      const rows = [
        { source: "claude", model: "deepseek-v4.1-flash", input: 4_200_000, output: 310_000, cache_read: 3_600_000, cache_write: 120_000, records: 2100, cost: 2.6 },
        { source: "claude", model: "muse-spark-1.3-contributor", input: 1_800_000, output: 150_000, cache_read: 1_500_000, cache_write: 60_000, records: 900, cost: null },
        { source: "codex", model: "codex-session", input: 2_600_000, output: 220_000, cache_read: 2_300_000, cache_write: 0, records: 700, cost: null },
      ];
      const dayRows = [];
      const now = Date.now();
      for (let i = Math.min(days, 14) - 1; i >= 0; i -= 1) {
        const d = new Date(now - i * 86400_000).toISOString().slice(0, 10);
        const input = 120_000 + ((i * 37) % 90) * 1000;
        const output = 9000 + ((i * 13) % 40) * 100;
        dayRows.push({ day: d, input, output, total: input + output });
      }
      return {
        rows, days: dayRows, files: 132, records: 3700,
        total_input: 8_600_000, total_output: 680_000, total_cache: 7_580_000,
        total_cost: 2.6, days_scanned: days,
      };
    }

    case "test_history": {
      const out: HistoryMap = {};
      for (const list of Object.values(PROVIDERS)) {
        for (const prov of list) out[prov.id] = fakeSummary(prov.id);
      }
      return out;
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

    case "export_diagnostics":
      return {
        path: `${HOME}\\Documents\\kumoswitch-diagnostics-20261110.txt`,
        count: 6,
      } satisfies ExportResult;

    case "export_providers_encrypted": {
      const password = String(args.password ?? "");
      if (password.length < 8) throw new Error("備份密碼至少需要 8 個字元");
      const count = Object.values(PROVIDERS).reduce((n, list) => n + list.length, 0);
      return {
        path: `${HOME}\\Documents\\kumoswitch-backup-20261110.kumoswitch`,
        count,
        sha256: "b5f95a42a2a69f36ed4e789f3b9a12bf03ef86384ddb6e97f340ff6ab0f20e1c",
      } satisfies ExportResult;
    }

    case "inspect_encrypted_backup":
      if (!String(args.text ?? "").includes("kumoswitch-export")) throw new Error("不是有效的 kumoSwitch 加密備份");
      return {
        format: "kumoswitch-export",
        version: 1,
        created_at: 1762790400000,
        provider_count: 9,
        plaintext_sha256: "4a63dfe8f901b4f5bc3b0b50d93f8cba7dc3f6a60948f6f63e21ad0f8e382a67",
        has_checksum: true,
      };

    case "import_providers_encrypted": {
      const password = String(args.password ?? "");
      const text = String(args.text ?? "");
      if (password.length < 8) throw new Error("備份密碼至少需要 8 個字元");
      if (!text.includes("kumoswitch-export")) throw new Error("密碼錯誤或備份檔案已損毀");
      return { imported: 3, skipped: 1 } satisfies JsonImportResult;
    }

    case "reveal_path":
      return undefined;

    case "audit_log":
      return [
        { ts: Date.now(), action: "provider.reveal_key", detail: "codex:cx-1", version: "0.14.0" },
        { ts: Date.now() - 60000, action: "backup.export", detail: "providers=9", version: "0.14.0" },
        { ts: Date.now() - 120000, action: "provider.apply", detail: "codex:cx-1", version: "0.14.0" },
      ];

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
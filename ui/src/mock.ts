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
  Preset,
  HarnessManagerEntry,
  ProxyConfig,
  ModelTestResult,
  ModelDiscovery,
  LiveTestPolicy,
  DriftReport,
  BackupCenter,
  GuardianOverview,
  SharedProfileView,
  ModelCompatibility,
  ProxyMetrics,
} from "./types";

/**
 * Browser preview backend. Enabled with `?mock=1`; nothing here touches Tauri.
 * State lives in memory so save / delete / apply / import all behave believably
 * while someone clicks around in a plain browser.
 */

const HOME = "C:\\Users\\dev";

const HARNESS_SURFACES: Record<string, "cli" | "desktop" | "both"> = {
  codex: "both",
  claude: "both",
  gemini: "cli",
  grok: "cli",
  opencode: "both",
  qoder: "both",
  dsh: "both",
  zcode: "both",
  hermes: "both",
  commandcode: "cli",
  crush: "cli",
  qwen: "both",
  kilo: "cli",
  pi: "cli",
  omp: "cli",
};

const INSTALLED_HARNESSES = new Set<string>();

const MOCK_REASONING_LEVELS: Record<string, string[]> = {
  codex: ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"],
  claude: ["low", "medium", "high", "xhigh", "max"],
  opencode: ["minimal", "low", "medium", "high", "xhigh", "max"],
  kilo: ["minimal", "low", "medium", "high", "xhigh", "max"],
  pi: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
  omp: ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto", "inherit"],
};

const MOCK_REASONING_TARGETS: Record<string, string> = {
  codex: "config.toml → model_reasoning_effort",
  claude: "settings.json → env.CLAUDE_CODE_EFFORT_LEVEL",
  opencode: "opencode.json → provider.models.*.options.reasoningEffort",
  kilo: "kilo.jsonc → provider.models.*.options.reasoningEffort",
  pi: "settings.json → modelThinkingLevels",
  omp: "config.yml → modelRoles.default",
};

const INSTALL_PACKAGES: Record<string, string> = {
  codex: "@openai/codex",
  claude: "@anthropic-ai/claude-code",
  gemini: "@google/gemini-cli",
  opencode: "@opencode/cli",
  qoder: "@qoder-ai/qodercli",
  dsh: "@deepseek-ai/dsh",
  commandcode: "command-code",
  crush: "@charmland/crush",
  qwen: "@qwen-code/qwen-code",
  kilo: "@kilocode/cli",
  pi: "@earendil-works/pi-coding-agent",
  omp: "@oh-my-pi/pi-coding-agent",
};

function surfaceLabel(surface: "cli" | "desktop" | "both") {
  if (surface === "both") return "CLI + 桌面版";
  if (surface === "desktop") return "桌面版";
  return "CLI";
}

function mockPreset(
  id: string,
  name: string,
  base_url: string,
  kind: string,
  models: string[],
  category: Preset["category"],
  note: string,
  extra: Partial<Preset> = {},
): Preset {
  return {
    id,
    name,
    base_url,
    kind,
    models,
    docs: "https://example.com/docs",
    note,
    category,
    auth_type: "api_key",
    icon: id,
    icon_color: "#38bdf8",
    website_url: "https://example.com/",
    requires_routing: false,
    login_hint: "",
    ...extra,
  };
}

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
    models: model ? [{ id: model, name: model, reasoning: true, reasoning_levels: ["minimal", "low", "medium", "high", "xhigh", "max"], reasoning_level: "" }] : [],
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
        { id: "glm-5.3-flash", name: "GLM 5.3 Flash", context_window: 128000, max_output: 16384, reasoning: true, reasoning_levels: ["minimal", "low", "medium", "high", "xhigh", "max"], reasoning_level: "medium", tools: true, favorite: true, last_used_at: Date.now() - 120000 },
        { id: "muse-spark-1.3", name: "Muse Spark 1.3", context_window: 128000, max_output: 16384, reasoning: true, reasoning_levels: ["low", "medium", "high", "xhigh"], tools: true, last_seen_at: Date.now() - 86400000 },
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
    id: "crush",
    name: "Crush",
    blurb: "Charmbracelet Crush",
    file: ".config/crush/crush.json",
    format: "JSON",
    verified: true,
    restart: "需要重開終端",
    detected: false,
    takeover: false,
    kinds: ["openai"],
    importable: 0,
    current: { base_url: "", model: "", api_key_tail: "", source: "" },
  },
  {
    id: "qwen",
    name: "Qwen Code",
    blurb: "QwenLM qwen-code",
    file: ".qwen/settings.json",
    format: "JSON",
    verified: true,
    restart: "需要重開終端",
    detected: false,
    takeover: false,
    kinds: ["openai"],
    importable: 0,
    current: { base_url: "", model: "", api_key_tail: "", source: "" },
  },
  {
    id: "kilo",
    name: "Kilo Code",
    blurb: "Kilo-Org kilocode CLI",
    file: ".config/kilo/kilo.jsonc",
    format: "JSON",
    verified: false,
    restart: "需要重開終端",
    detected: false,
    takeover: false,
    kinds: ["openai", "anthropic"],
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
  {
    id: "pi",
    name: "Pi",
    blurb: "Pi coding agent",
    file: ".pi/agent/models.json",
    format: "JSON",
    verified: true,
    restart: "重新啟動 Pi，或在目前 session 執行 /reload",
    detected: true,
    takeover: false,
    kinds: ["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"],
    importable: 0,
    current: { base_url: "", model: "", api_key_tail: "", source: "" },
  },
  {
    id: "omp",
    name: "Oh My Pi",
    blurb: "Oh My Pi (omp) coding agent",
    file: ".omp/agent/models.yml",
    format: "YAML",
    verified: true,
    restart: "重新啟動 omp／Oh My Pi session",
    detected: true,
    takeover: false,
    kinds: ["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"],
    importable: 0,
    current: { base_url: "", model: "", api_key_tail: "", source: "" },
  },
];

const MOCK_PROFILES: SharedProfileView[] = [{
  id: "sp-zen",
  name: "OpenCode Zen",
  base_url: "https://opencode.ai/zen/go/v1",
  kind: "responses",
  model: "glm-5.3-flash",
  models: [{ id: "glm-5.3-flash", name: "GLM 5.3 Flash", context_window: 128000, max_output: 16384, reasoning: true, tools: true }],
  note: "可重用到多個工具的共用端點",
  tags: ["personal", "fallback"],
  targets: [
    { tool: "codex", provider_id: "cx-1", model: "glm-5.3-flash", kind: "responses", enabled: true, last_synced_at: Date.now() - 60000 },
    { tool: "claude", provider_id: "", model: "claude-sonnet-4-6", kind: "", enabled: true, last_synced_at: 0 },
    { tool: "opencode", provider_id: "oc-1", model: "glm-5.3-flash", kind: "openai", enabled: true, last_synced_at: Date.now() - 30000 },
  ],
  key_count: 2,
  active_key_label: "主力金鑰",
  api_key_masked: "••••f2a",
  has_api_key: true,
  created_at: Date.now() - 86400000 * 9,
  updated_at: Date.now() - 60000,
}];

const MOCK_BACKUP_POLICY = { scheduled: true, interval_hours: 24, keep: 30, last_run: Date.now() - 7200000 };

const BACKUPS: Record<string, BackupInfo[]> = {
  codex: [
    { id: "20261110-091422", created: "2026-11-10 09:14:22", files: [`${HOME}\\.codex\\config.toml`], tool: "codex", tool_name: "Codex", reason: "provider-apply", version: "0.18.0", size_bytes: 18420, checksum: "1f74a9c72f11" },
    { id: "20261109-183007", created: "2026-11-09 18:30:07", files: [`${HOME}\\.codex\\config.toml`], tool: "codex", tool_name: "Codex", reason: "manual", version: "0.17.0", size_bytes: 18102, checksum: "bc91a13cb2de" },
    {
      id: "20261108-220155",
      created: "2026-11-08 22:01:55",
      files: [`${HOME}\\.codex\\config.toml`, `${HOME}\\.codex\\auth.json`],
      tool: "codex", tool_name: "Codex", reason: "pre-update", version: "0.17.0", size_bytes: 24904, checksum: "f09e31ab424c",
    },
  ],
  claude: [{ id: "20261110-080512", created: "2026-11-10 08:05:12", files: [`${HOME}\\.claude\\settings.json`], tool: "claude", tool_name: "Claude Code", reason: "provider-apply", version: "0.18.0", size_bytes: 4510, checksum: "872adfe38db1" }],
  dsh: [{ id: "20261107-141233", created: "2026-11-07 14:12:33", files: [`${HOME}\\.dsh\\settings.yaml`], tool: "dsh", tool_name: "DSH", reason: "manual", version: "0.17.0", size_bytes: 3380, checksum: "5c1a9a8c412e" }],
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
    surface: HARNESS_SURFACES[s.id] ?? "cli",
    reasoning_levels: MOCK_REASONING_LEVELS[s.id] ?? [],
    reasoning_target: MOCK_REASONING_TARGETS[s.id] ?? "",
    restart: s.restart,
    detected: s.detected,
    takeover: s.takeover,
    provider_count: (PROVIDERS[s.id] ?? []).length,
    active_id: ACTIVE[s.id] ?? null,
    previous_id: PREVIOUS[s.id] ?? null,
    current: { ...s.current },
    kind_choices: [...s.kinds],
    importable: s.importable,
    cc_switch: s.id === "codex" ? {
      available: true,
      mode: "proxy",
      attached: true,
      db_path: `${HOME}\\.cc-switch\\cc-switch.db`,
      error: null,
      last_refreshed: Date.now(),
      providers: [
        { id: "cc-opencode", name: "OpenCode Go", base_url: "https://opencode.ai/zen/go/v1", model: "deepseek-v4.1-flash", models: [{ id: "deepseek-v4.1-flash", name: "DeepSeek v4.1 Flash" }, { id: "muse-spark-1.3-contributor", name: "Muse Spark 1.3" }], kind: "responses", website_url: "https://opencode.ai/go", category: "third_party", icon: "opencode", icon_color: "#211E1E", is_current: true, in_failover_queue: true, has_api_key: true, already_imported: false },
        { id: "cc-commandcode", name: "CommandCode", base_url: "https://api.commandcode.ai/provider/v1", model: "deepseek/deepseek-v4.1-flash", models: [{ id: "deepseek/deepseek-v4.1-flash", name: "deepseek-flash" }, { id: "meta/muse-spark-1.3-contributor", name: "Muse Spark" }], kind: "responses", website_url: "https://commandcode.ai", category: "third_party", icon: "commandcode", icon_color: "", is_current: false, in_failover_queue: true, has_api_key: true, already_imported: false },
        { id: "cc-openrouter", name: "OpenRouter", base_url: "https://openrouter.ai/api/v1", model: "stealth/crouton-alpha", models: [{ id: "stealth/crouton-alpha", name: "Crouton Alpha" }, { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Nemotron 3 Ultra" }], kind: "responses", website_url: "https://openrouter.ai", category: "aggregator", icon: "openrouter", icon_color: "#6566F1", is_current: false, in_failover_queue: false, has_api_key: true, already_imported: false },
      ],
    } : null,
  }));
}

function mockHarnessEntries(): HarnessManagerEntry[] {
  return SEEDS.map((seed) => {
    const surface = HARNESS_SURFACES[seed.id] ?? "cli";
    const pkg = INSTALL_PACKAGES[seed.id];
    const installed = seed.detected || INSTALLED_HARNESSES.has(seed.id);
    const configDir = seed.file.includes("/") ? seed.file.slice(0, seed.file.lastIndexOf("/")) : seed.file;
    return {
      id: seed.id,
      name: seed.name,
      blurb: seed.blurb,
      surface,
      surface_label: surfaceLabel(surface),
      config_path: displayPath(seed.file),
      config_dir: displayPath(configDir),
      detected: seed.detected,
      cli_path: installed ? `${HOME}\\AppData\\Roaming\\npm\\${seed.id}.cmd` : null,
      installed,
      website_url: `https://example.com/${seed.id}`,
      docs_url: `https://example.com/${seed.id}/docs`,
      desktop_url: surface === "cli" ? null : `https://example.com/${seed.id}/download`,
      desktop_available: surface !== "cli",
      desktop_note: surface === "cli" ? "這個工具目前只管理 CLI 設定。" : "CLI 與桌面版共用同一份使用者設定；套用後重新啟動即可。",
      install_manager: pkg ? "npm" : null,
      install_package: pkg ?? null,
      install_command: pkg ? `npm install -g --no-fund --no-audit ${pkg}` : null,
      installable: Boolean(pkg),
    } satisfies HarnessManagerEntry;
  });
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
  const targetLevel = target.models?.find((model) => model.id === target.model)?.reasoning_level ?? "";
  const fromLevel = from.models?.find((model) => model.id === from.model)?.reasoning_level ?? "medium";
  const reasoningLine = targetLevel ? [`-model_reasoning_effort = "${fromLevel}"`, `+model_reasoning_effort = "${targetLevel}"`] : [];
  const body = [
    "@@ -1,8 +1,8 @@",
    " # Codex CLI — 供應商鍵位由 kumoSwitch 維護",
    `-model_provider = "${from.config_id}"`,
    `+model_provider = "${target.config_id}"`,
    ...modelLine,
    ...reasoningLine,
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
      ...(() => {
        const level = target.models?.find((model) => model.id === target.model)?.reasoning_level;
        return level ? [`+    "CLAUDE_CODE_EFFORT_LEVEL": "${level}",`] : [];
      })(),
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
      `+      "models": { "${target.model}": { "name": "${target.model}"${target.models?.find((model) => model.id === target.model)?.reasoning_level ? `, "options": { "reasoningEffort": "${target.models.find((model) => model.id === target.model)!.reasoning_level}" }` : ""} }`,
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
    warnings.push(`${seed.name} 的設定格式尚未實測，請逐行確認變更預覽 後再套用。`);
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
let CC_BRIDGE_ENABLED = false;
let PROXY_QUICK_ENABLED = false;
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
    api_keys: provider.api_key ? [{
      id: `${provider.id}-key-active`,
      label: "目前金鑰",
      fingerprint: provider.api_key.slice(-8),
      created_at: Date.now() - 86_400_000 * 42,
      expires_at: 0,
      last_tested_at: Date.now() - 3_600_000,
      last_ok_at: Date.now() - 3_600_000,
      last_status: 200,
      status: "active",
      note: "Mock 預覽資料",
      active: true,
      expired: false,
    }] : [],
  };
}

export async function mockInvoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  await delay(60);
  const tool = typeof args.tool === "string" ? args.tool : "";

  switch (cmd) {
    case "open_install_page":
    case "open_external_url":
      return undefined;
    case "app_info":
      return {
        version: "0.27.11",
        dataDir: `${HOME}\\AppData\\Roaming\\kumoSwitch`,
        encrypted: true,
        autoModelSync: false,
        updateChannel: "stable",
        preUpdateBackup: true,
        ccSwitchBridge: CC_BRIDGE_ENABLED,
        releaseChannel: "stable",
        buildCommit: "mock-build",
        signing: "optional",
      } satisfies AppInfo;

    case "tool_list": {
      const views = toolViews().map((t) => (
        CC_BRIDGE_ENABLED ? t : { ...t, cc_switch: null, takeover: false }
      ));
      if (window.location.hash.includes("onboard")) {
        return views.map((t) => ({ ...t, provider_count: 0, active_id: null }));
      }
      return views;
    }

    case "set_cc_switch_bridge":
      CC_BRIDGE_ENABLED = Boolean(args.enabled);
      return CC_BRIDGE_ENABLED;

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

    case "import_cc_switch_provider": {
      const providerId = String(args.providerId ?? "");
      const source = toolViews().find((view) => view.id === tool)?.cc_switch?.providers.find((item) => item.id === providerId);
      if (!source) throw new Error("CC Switch 已找不到這個供應商");
      const bucket = PROVIDERS[tool] ?? (PROVIDERS[tool] = []);
      const existing = bucket.find((item) => item.name.toLowerCase() === source.name.toLowerCase() || item.base_url.replace(/\/$/, "") === source.base_url.replace(/\/$/, ""));
      if (existing) return { provider: providerView(existing), already_imported: true };
      const saved: Provider = {
        ...p(`cc-import-${++counter}`, `cc-switch-${slug(source.name)}`, source.name, source.base_url, "sk-ccswitch-import", source.model, source.kind, "從 CC Switch 匯入"),
        models: source.models,
      };
      bucket.push(saved);
      return { provider: providerView(saved), already_imported: false };
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
      target.last_used = Date.now();
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
      list.unshift({ id: stamp, created: "2026-11-10 10:15:00", files: preview.files.map((f) => f.file), tool, tool_name: seed.name, reason: "provider-apply", version: "0.18.0", size_bytes: 18420, checksum: "1f74a9c72f11" });
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
      const previous = PREVIOUS[tool];
      if (previous) {
        ACTIVE[tool] = previous;
        const restored = findProvider(tool, previous);
        const seed = seedOf(tool);
        seed.current = {
          base_url: restored.base_url,
          model: restored.model || seed.current.model,
          api_key_tail: tail(restored.api_key),
          source: seed.current.source || `${restored.config_id}.base_url`,
        };
      }
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
        enabled: PROXY_QUICK_ENABLED,
        port: 17890,
        stack: PROXY_QUICK_ENABLED ? ["codex:cx-1", "codex:cx-2"] : [],
        strategy: "ordered",
        policies: {},
        attached: PROXY_QUICK_ENABLED ? { codex: "https://opencode.ai/zen/go/v1" } : {},
        alerts: { enabled: true, notify: true, min_requests: 5, success_rate_below_pct: 70, slow_ttfb_ms: 8000, cooldown_secs: 300 },
      } satisfies ProxyConfig;
    case "proxy_save":
      PROXY_QUICK_ENABLED = Boolean((args.config as ProxyConfig).enabled);
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
        alerts: [
          { id: 1, ts: Date.now() - 5000, target: "codex:cx-2", kind: "rate_limit", severity: "warning", message: "上游回傳 429 rate limit", value: "429", circuit_open_until: Date.now() + 30000 },
          { id: 2, ts: Date.now() - 42000, target: "codex:cx-2", kind: "slow_ttfb", severity: "warning", message: "平均 TTFB 超過 8000ms", value: "8240ms", circuit_open_until: 0 },
        ],
        summary: { targets_configured: 3, targets_reporting: 1, requests: 48, success_rate: 0.958, avg_ttfb_ms: 138, failovers: 3, active_alerts: 2 },
        rules: { enabled: true, notify: true, min_requests: 5, success_rate_below_pct: 70, slow_ttfb_ms: 8000, cooldown_secs: 300 },
      } satisfies ProxyMetrics;
    case "proxy_attach":
      return { changed: true, backup_id: "mock", written: ["config"], message: "已掛載代理" };
    case "proxy_quick_start":
      PROXY_QUICK_ENABLED = true;
      return { changed: true, backup_id: "mock", written: ["config"], message: "已啟用即時切換" };

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

    case "discover_model_reasoning": {
      const levels = MOCK_REASONING_LEVELS[tool] ?? [];
      if (!levels.length) throw new Error("這個工具尚未定義思考等級");
      return {
        levels,
        default_level: levels.includes("medium") ? "medium" : levels[0],
        source: "catalog",
        supported: Boolean(MOCK_REASONING_TARGETS[tool]),
        target: MOCK_REASONING_TARGETS[tool] ?? "",
        context_window: 262144,
        max_output: 32768,
        message: `Mock：已取得 Context 262144、Max output 32768 與 ${levels.length} 個思考等級`,
      };
    }

    case "harness_manager_list":
      return mockHarnessEntries();

    case "harness_install": {
      const id = typeof args.id === "string" ? args.id : "";
      const pkg = INSTALL_PACKAGES[id];
      if (!pkg) throw new Error("這個工具沒有內建安裝命令");
      INSTALLED_HARNESSES.add(id);
      return {
        ok: true,
        command: `npm install -g --no-fund --no-audit ${pkg}`,
        output: `added ${pkg} (mock install)`,
        exit_code: 0,
      };
    }

    case "provider_presets":
      return [
        mockPreset("openai-oauth", "OpenAI Official", "", "responses", [], "account", "ChatGPT 帳號登入", {
          auth_type: "oauth", icon: "openai", icon_color: "#10a37f", website_url: "https://chatgpt.com/codex",
          login_hint: "開啟官方 Codex 登入頁，或先執行 `codex login`。",
        }),
        mockPreset("github-copilot", "GitHub Copilot", "", "openai", [], "account", "用 GitHub 帳號登入", {
          auth_type: "oauth", icon: "github", icon_color: "#8b5cf6", website_url: "https://github.com/features/copilot",
          login_hint: "先用官方 Copilot CLI 完成 GitHub 裝置登入。",
        }),
        mockPreset("xai-oauth", "xAI (Grok) OAuth", "", "openai", [], "account", "用 xAI 帳號登入", {
          auth_type: "oauth", icon: "xai", icon_color: "#e5e7eb", website_url: "https://x.ai/",
          requires_routing: true, login_hint: "在 Grok Build 完成 xAI 帳號登入。",
        }),
        mockPreset("openai", "OpenAI API", "https://api.openai.com/v1", "responses", ["gpt-5.2", "gpt-5.1"], "official", "官方 API Key", {
          icon: "openai", icon_color: "#10a37f", website_url: "https://platform.openai.com/",
        }),
        mockPreset("anthropic", "Anthropic API", "https://api.anthropic.com", "anthropic", ["claude-sonnet-5"], "official", "官方 API Key", {
          icon: "anthropic", icon_color: "#d97757", website_url: "https://console.anthropic.com/",
        }),
        mockPreset("gemini", "Google Gemini", "https://generativelanguage.googleapis.com/v1beta/openai", "openai", ["gemini-2.5-pro"], "official", "OpenAI 相容端點", {
          icon: "gemini", icon_color: "#4285f4", website_url: "https://ai.google.dev/", requires_routing: true,
        }),
        mockPreset("xai", "xAI Grok", "https://api.x.ai/v1", "openai", ["grok-4"], "official", "官方 API Key", {
          icon: "xai", icon_color: "#e5e7eb", website_url: "https://x.ai/",
        }),
        mockPreset("deepseek", "DeepSeek", "https://api.deepseek.com/v1", "openai", ["deepseek-chat", "deepseek-reasoner"], "official", "官方 API Key", {
          icon: "deepseek", icon_color: "#4d6bfe", website_url: "https://platform.deepseek.com/",
        }),
        mockPreset("moonshot", "Kimi / Moonshot", "https://api.moonshot.cn/v1", "openai", ["kimi-k2-turbo"], "official", "官方 API Key", {
          icon: "kimi", icon_color: "#22c55e", website_url: "https://platform.moonshot.cn/",
        }),
        mockPreset("zhipu", "智譜 GLM", "https://open.bigmodel.cn/api/paas/v4", "openai", ["glm-4.7"], "official", "官方 API Key", {
          icon: "glm", icon_color: "#7c5cff", website_url: "https://open.bigmodel.cn/",
        }),
        mockPreset("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "openai", ["anthropic/claude-sonnet-4.5"], "unified", "跨模型聚合", {
          icon: "openrouter", icon_color: "#6566f1", website_url: "https://openrouter.ai/",
        }),
        mockPreset("siliconflow", "SiliconFlow", "https://api.siliconflow.cn/v1", "openai", ["deepseek-ai/DeepSeek-V3"], "unified", "跨模型聚合", {
          icon: "siliconflow", icon_color: "#06b6d4", website_url: "https://cloud.siliconflow.cn/",
        }),
        mockPreset("opencode-zen", "OpenCode Zen", "https://opencode.ai/zen/go/v1", "openai-responses", ["glm-5.3-flash"], "unified", "跨應用路由", {
          icon: "opencode", icon_color: "#e5e7eb", website_url: "https://opencode.ai/", requires_routing: true,
        }),
        mockPreset("commandcode", "Command Code", "https://api.commandcode.ai/provider/v1", "openai", ["deepseek/deepseek-v4.1-flash"], "unified", "跨應用路由", {
          icon: "commandcode", icon_color: "#f43f5e", website_url: "https://commandcode.ai/", requires_routing: true,
        }),
        mockPreset("ollama", "Ollama", "http://127.0.0.1:11434/v1", "openai", ["qwen2.5-coder:14b"], "local", "本機、免金鑰", {
          auth_type: "local", icon: "ollama", icon_color: "#e5e7eb", website_url: "https://ollama.com/",
        }),
        mockPreset("lmstudio", "LM Studio", "http://127.0.0.1:1234/v1", "openai", ["local-model"], "local", "本機、免金鑰", {
          auth_type: "local", icon: "lmstudio", icon_color: "#a78bfa", website_url: "https://lmstudio.ai/",
        }),
      ];

    case "health_overview":
      return { tests: 48, ok: 45, avg_ms: 162, providers_tested: 6 };

    case "usage_report": {
      const days = Number(args.days ?? 30);
      const rows = [
        { source: "claude", model: "deepseek-v4.1-flash", input: 4_200_000, output: 310_000, cache_read: 3_600_000, cache_write: 120_000, records: 980, cost: 2.6, duration_ms: 690_000, timed_output: 310_000, timed_records: 980, avg_duration_ms: 704, output_per_sec: 449.3, median_output_per_sec: 412.0, decode_output_per_sec: 465.0, fixed_overhead_ms: 520, slow_records: 3, ttft_ms: 1_240, ttft_records: 980, reasoning: 0 },
        { source: "claude", model: "muse-spark-1.3-contributor", input: 1_800_000, output: 150_000, cache_read: 1_500_000, cache_write: 60_000, records: 420, cost: null, duration_ms: 355_000, timed_output: 150_000, timed_records: 420, avg_duration_ms: 845, output_per_sec: 422.5, median_output_per_sec: 388.0, decode_output_per_sec: 438.0, fixed_overhead_ms: 610, slow_records: 1, ttft_ms: 1_510, ttft_records: 420, reasoning: 0 },
        { source: "codex", model: "codex-session", input: 2_600_000, output: 220_000, cache_read: 2_300_000, cache_write: 0, records: 620, cost: null, duration_ms: 0, timed_output: 0, timed_records: 0, avg_duration_ms: null, output_per_sec: null, median_output_per_sec: null, decode_output_per_sec: null, fixed_overhead_ms: null, slow_records: 0, ttft_ms: null, ttft_records: 0, reasoning: 0 },
        { source: "pi", model: "deepseek-v4.1-flash", input: 780_000, output: 64_000, cache_read: 610_000, cache_write: 0, records: 310, cost: 0.26, duration_ms: 248_000, timed_output: 64_000, timed_records: 310, avg_duration_ms: 800, output_per_sec: 258.1, median_output_per_sec: 241.0, decode_output_per_sec: 174.0, fixed_overhead_ms: 13_210, slow_records: 2, ttft_ms: null, ttft_records: 0, reasoning: 38_000 },
        { source: "dsh", model: "glm-5.3-flash", input: 1_240_000, output: 96_000, cache_read: 980_000, cache_write: 0, records: 260, cost: 0.38, duration_ms: 201_000, timed_output: 96_000, timed_records: 260, avg_duration_ms: 773, output_per_sec: 477.6, median_output_per_sec: 452.0, decode_output_per_sec: 254.0, fixed_overhead_ms: 2_185, slow_records: 2, ttft_ms: null, ttft_records: 0, reasoning: 55_000 },
      ];
      const dayRows = [];
      const now = Date.now();
      for (let i = Math.min(days || 1, 14) - 1; i >= 0; i -= 1) {
        const d = new Date(now - i * 86400_000).toISOString().slice(0, 10);
        const input = 120_000 + ((i * 37) % 90) * 1000;
        const output = 9000 + ((i * 13) % 40) * 100;
        const cache = Math.round(input * 0.8);
        dayRows.push({ day: d, source: "claude", input, output, cache, total: input + output + cache });
        const inCodex = Math.round(input * 0.4), outCodex = Math.round(output * 0.3), cacheCodex = Math.round(inCodex * 0.7);
        dayRows.push({ day: d, source: "codex", input: inCodex, output: outCodex, cache: cacheCodex, total: inCodex + outCodex + cacheCodex });
        const inPi = Math.round(input * 0.15), outPi = Math.round(output * 0.12), cachePi = Math.round(inPi * 0.6);
        dayRows.push({ day: d, source: "pi", input: inPi, output: outPi, cache: cachePi, total: inPi + outPi + cachePi });
        const inDsh = Math.round(input * 0.22), outDsh = Math.round(output * 0.18), cacheDsh = Math.round(inDsh * 0.5);
        dayRows.push({ day: d, source: "dsh", input: inDsh, output: outDsh, cache: cacheDsh, total: inDsh + outDsh + cacheDsh });
      }
      const requests = [
        { ts: Date.now() - 12 * 60_000, source: "pi", provider: "commandcode", model: "deepseek/deepseek-v4.1-flash", status: "toolUse", input: 603_544, output: 276, cache: 0, reasoning: 0, duration_ms: 6594, cost: 0.00419, id: "7f3c5fc0" },
        { ts: Date.now() - 13 * 60_000, source: "pi", provider: "commandcode", model: "deepseek/deepseek-v4.1-flash", status: "completed", input: 602_872, output: 61, cache: 0, reasoning: 0, duration_ms: 4657, cost: 0.00395, id: "ad47b067" },
        { ts: Date.now() - 18 * 60_000, source: "dsh", provider: "openConfig", model: "hy4-flash", status: "completed", input: 429_300, output: 0, cache: 0, reasoning: 0, duration_ms: 76_000, cost: null, id: "dsh-hy4-1" },
        { ts: Date.now() - 19 * 60_000, source: "dsh", provider: "deepseek-official", model: "DeepSeek V4.1 Flash 1017", status: "completed", input: 198_500, output: 0, cache: 0, reasoning: 0, duration_ms: 11_170, cost: 0.0034, id: "dsh-ds-1" },
      ];
      return {
        rows, requests, days: dayRows, files: 142, records: 2590,
        total_input: 10_620_000, total_output: 840_000, total_cache: 8_990_000,
        total_cost: 3.28,
        total_reasoning: 93_000,
        total_duration_ms: 1_494_000, timed_records: 1970, timed_output: 620_000,
        avg_duration_ms: 758, output_per_sec: 414.9, decode_output_per_sec: 149.0, fixed_overhead_ms: 5_488, slow_records: 8, ttft_ms: 1_321,
        days_scanned: days,
        roots: [
          { source: "claude", path: `${HOME}\.claude\projects`, exists: true, files: 74, scanned_files: 62 },
          { source: "codex", path: `${HOME}\.codex\sessions`, exists: true, files: 58, scanned_files: 51 },
          { source: "pi", path: `${HOME}\.pi\agent\sessions`, exists: true, files: 9, scanned_files: 9 },
          { source: "omp", path: `${HOME}\.omp\agent\sessions`, exists: false, files: 0, scanned_files: 0 },
          { source: "dsh", path: `${HOME}\.dsh\storages\model-usage.jsonl`, exists: true, files: 1, scanned_files: 1 },
        ],
        skipped_files: 19,
        errors: [],
        elapsed_ms: 184,
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
        { ts: Date.now(), action: "provider.reveal_key", detail: "codex:cx-1", version: "0.17.0" },
        { ts: Date.now() - 60000, action: "backup.export", detail: "providers=9", version: "0.17.0" },
        { ts: Date.now() - 120000, action: "provider.apply", detail: "codex:cx-1", version: "0.17.0" },
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

    case "cc_switch_refresh":
      return true;

    case "import_cc_switch_batch": {
      const ids = Array.isArray(args.providerIds) ? args.providerIds.map(String) : [];
      const source = toolViews().find((view) => view.id === tool)?.cc_switch?.providers ?? [];
      const imported: Provider[] = [];
      for (const id of ids) {
        const candidate = source.find((item) => item.id === id);
        if (!candidate) continue;
        const row = p(`cc-import-${++counter}`, `cc-switch-${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, candidate.name, candidate.base_url, "sk-ccswitch-import", candidate.model, candidate.kind, "從 CC Switch 批次匯入");
        row.models = candidate.models;
        (PROVIDERS[tool] ?? (PROVIDERS[tool] = [])).push(row);
        imported.push(providerView(row));
      }
      return { imported: imported.length, skipped: ids.length - imported.length, providers: imported };
    }

    case "cc_switch_import_route_stack": {
      const source = toolViews().find((view) => view.id === tool)?.cc_switch?.providers ?? [];
      const rows = source.map((candidate) => p(`cc-route-${++counter}`, `cc-switch-route-${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, candidate.name, candidate.base_url, "sk-ccswitch-route", candidate.model, candidate.kind, "CC Switch 路由鏡像"));
      (PROVIDERS[tool] ?? (PROVIDERS[tool] = [])).push(...rows);
      return { imported: rows.length, stack: rows.map((row) => `${tool}:${row.id}`), providers: rows.map(providerView) };
    }

    case "model_compatibility": {
      const providerId = String(args.providerId ?? "");
      const provider = findProvider(tool, providerId);
      const out: ModelCompatibility[] = (provider.models ?? []).map((model) => ({
        tool,
        tool_name: seedOf(tool).name,
        provider_id: provider.id,
        provider_name: provider.name,
        model_id: model.id,
        model_name: model.name || model.id,
        status: model.tools === false ? "incompatible" : model.context_window && model.context_window < 32000 ? "warning" : model.tools == null ? "warning" : "compatible",
        score: model.tools === false ? 40 : model.tools == null ? 82 : 96,
        checks: [
          { key: "context", label: "Context window", status: (model.context_window ?? 0) >= 32000 ? "ok" : "warn", detail: model.context_window ? `${model.context_window} tokens` : "尚未標記" },
          { key: "tools", label: "Tool calling", status: model.tools === false ? "fail" : model.tools ? "ok" : "warn", detail: model.tools === false ? "工具需要工具呼叫" : "工具能力符合" },
          { key: "protocol", label: "Protocol", status: "ok", detail: provider.kind || "工具預設" },
        ],
        issues: model.tools == null ? ["工具能力未知；建議先實測"] : [],
      }));
      return out;
    }

    case "api_key_add": {
      const input = (args.input ?? {}) as Record<string, unknown>;
      return {
        id: `key-${++counter}`,
        label: String(input.label || "輪替金鑰"),
        fingerprint: String(input.secret ?? "mock-key").slice(-8),
        created_at: Date.now(),
        expires_at: Number(input.expires_at ?? 0),
        last_tested_at: 0,
        last_ok_at: 0,
        last_status: 0,
        status: "active",
        note: String(input.note ?? ""),
        active: true,
        expired: false,
      };
    }
    case "api_key_update":
    case "api_key_activate": {
      const providerId = String(args.providerId ?? "");
      const keyId = String(args.keyId ?? "key-active");
      const provider = findProvider(tool, providerId);
      const existing = providerView(provider).api_keys?.find((key) => key.id === keyId);
      return existing ?? { id: keyId, label: "輪替金鑰", fingerprint: "9f2ac112", created_at: Date.now() - 86400000, expires_at: 0, last_tested_at: 0, last_ok_at: 0, last_status: 0, status: "active", note: "", active: true, expired: false };
    }
    case "api_key_remove":
      return undefined;
    case "api_key_test": {
      const providerId = String(args.providerId ?? "");
      const provider = findProvider(tool, providerId);
      const key = providerView(provider).api_keys?.[0] ?? { id: "key-active", label: "目前金鑰", fingerprint: "9f2ac112", created_at: Date.now() - 86400000, expires_at: 0, last_tested_at: 0, last_ok_at: 0, last_status: 0, status: "active", note: "", active: true, expired: false };
      return { key: { ...key, last_tested_at: Date.now(), last_ok_at: Date.now(), last_status: 200 }, result: { ok: true, status: 200, ms: 126, message: "OK" } };
    }

    case "guardian_status": {
      const statuses = SEEDS.map((seed, index) => ({
        tool: seed.id,
        tool_name: seed.name,
        status: index === 1 ? "drifted" : index === 7 ? "unmanaged" : seed.current.base_url ? "clean" : "empty",
        active_id: ACTIVE[seed.id] ?? null,
        expected_name: seed.current.base_url ? `${seed.name} 主力` : null,
        current_base_url: seed.current.base_url,
        current_model: seed.current.model,
        current_key_tail: seed.current.api_key_tail,
        expected_base_url: seed.current.base_url,
        expected_model: seed.current.model,
        changed_fields: index === 1 ? ["模型"] : index === 7 ? ["未納管供應商"] : [],
        unmanaged_providers: index === 7 ? ["external-provider"] : [],
        message: index === 1 ? "實際設定與 kumoSwitch 紀錄不同" : index === 7 ? "設定檔中存在尚未納管的供應商" : seed.current.base_url ? "kumoSwitch 與實際設定一致" : "尚未偵測到目前套用的供應商",
        actor: "external",
        files: [{ file: seed.file, path: displayPath(seed.file), exists: seed.detected, modified_at: Date.now() - index * 120000, fingerprint: `fp-${index}` }],
        drift_signature: `mock-${seed.id}-${index}`,
        last_checked: Date.now(),
      }));
      const overview: GuardianOverview = {
        policy: { enabled: true, auto_repair: false, notify: true, poll_secs: 5, retention: 200 },
        watching: true,
        last_scan: Date.now(),
        last_self_write: Date.now() - 600000,
        summary: {
          clean: statuses.filter((item) => item.status === "clean").length,
          drifted: statuses.filter((item) => item.status === "drifted").length,
          unmanaged: statuses.filter((item) => item.status === "unmanaged").length,
          empty: statuses.filter((item) => item.status === "empty").length,
          error: 0,
          watched_tools: statuses.length,
        },
        statuses,
        events: [
          { id: "ev-3", ts: Date.now() - 180000, tool: "claude", tool_name: "Claude Code", kind: "drift", status: "drifted", severity: "warning", actor: "external", changed_fields: ["模型"], message: "偵測到外部設定偏離", current_base_url: "https://api.example.com/v1", current_model: "claude-sonnet-4-6", expected_name: "Zen Anthropic", file_modified_at: Date.now() - 190000 },
          { id: "ev-2", ts: Date.now() - 900000, tool: "codex", tool_name: "Codex", kind: "resolved", status: "clean", severity: "success", actor: "kumoSwitch", changed_fields: [], message: "設定已恢復，且與 kumoSwitch 紀錄一致", current_base_url: "https://opencode.ai/zen/go/v1", current_model: "glm-5.3-flash", expected_name: "OpenCode Go", file_modified_at: Date.now() - 910000 },
        ],
      };
      return overview;
    }
    case "guardian_set_policy":
      return args.policy;
    case "guardian_repair":
      return { changed: true, backup_id: "mock", written: ["config"], message: "守護中心已重新套用設定" } satisfies ApplyResult;
    case "guardian_clear_events":
      return undefined;

    case "profile_list":
      return MOCK_PROFILES;
    case "profile_save": {
      const input = (args.input ?? {}) as Record<string, unknown>;
      const view: SharedProfileView = {
        id: String(input.id || `sp-${++counter}`),
        name: String(input.name || "新 Profile"),
        base_url: String(input.base_url || ""),
        kind: String(input.kind || "responses"),
        model: String(input.model || ""),
        models: Array.isArray(input.models) ? input.models as SharedProfileView["models"] : [],
        note: String(input.note || ""),
        tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
        targets: Array.isArray(input.targets) ? input.targets as SharedProfileView["targets"] : [],
        key_count: 1,
        active_key_label: "Profile 金鑰",
        api_key_masked: "••••mock",
        has_api_key: true,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      const index = MOCK_PROFILES.findIndex((profile) => profile.id === view.id);
      if (index >= 0) MOCK_PROFILES[index] = view; else MOCK_PROFILES.push(view);
      return view;
    }
    case "profile_delete": {
      const id = String(args.id ?? "");
      const index = MOCK_PROFILES.findIndex((profile) => profile.id === id);
      if (index >= 0) MOCK_PROFILES.splice(index, 1);
      return undefined;
    }
    case "profile_import_provider": {
      const providerId = String(args.providerId ?? "");
      const provider = findProvider(tool, providerId);
      const view: SharedProfileView = {
        id: `sp-${++counter}`,
        name: provider.name,
        base_url: provider.base_url,
        kind: provider.kind,
        model: provider.model,
        models: provider.models ?? [],
        note: provider.note,
        tags: ["imported"],
        targets: [{ tool, provider_id: provider.id, model: provider.model, kind: provider.kind, enabled: true, last_synced_at: Date.now() }],
        key_count: 1,
        active_key_label: "目前金鑰",
        api_key_masked: providerView(provider).api_key_masked ?? "",
        has_api_key: Boolean(provider.api_key),
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      MOCK_PROFILES.push(view);
      return view;
    }
    case "profile_sync":
      return {
        profile_id: String(args.profileId ?? ""),
        synced: [{ tool: "codex", provider_id: "cx-1", provider_name: "OpenCode Go", model: "glm-5.3-flash", created: false }],
        skipped: [],
      };

    case "backup_center": {
      const backups = Object.values(BACKUPS).flat();
      const center: BackupCenter = {
        backups,
        stats: { snapshots: backups.length, tools: Object.keys(BACKUPS).length, files: backups.reduce((sum, backup) => sum + backup.files.length, 0), size_bytes: backups.reduce((sum, backup) => sum + backup.size_bytes, 0), newest: backups[0]?.created ?? "", oldest: backups.at(-1)?.created ?? "" },
        policy: MOCK_BACKUP_POLICY,
      };
      return center;
    }
    case "backup_create": {
      const seed = seedOf(tool);
      const created: BackupInfo = { id: `20261110-${String(++counter).padStart(6, "0")}`, created: new Date().toISOString().slice(0, 19).replace("T", " "), files: [displayPath(seed.file)], tool, tool_name: seed.name, reason: "manual", version: "0.18.0", size_bytes: 16420, checksum: "9ac6d31b7af2" };
      (BACKUPS[tool] ?? (BACKUPS[tool] = [])).unshift(created);
      return created;
    }
    case "backup_delete": {
      const id = String(args.id ?? "");
      BACKUPS[tool] = (BACKUPS[tool] ?? []).filter((backup) => backup.id !== id);
      return undefined;
    }
    case "backup_set_policy":
      Object.assign(MOCK_BACKUP_POLICY, args.policy ?? {});
      return MOCK_BACKUP_POLICY;
    case "prepare_update_backup":
      return { snapshots: 3, tools: 3 };
    case "set_update_preferences":
      return { channel: String(args.channel ?? "stable"), preUpdateBackup: Boolean(args.preUpdateBackup) };

    case "proxy_export_diagnostics":
      return { path: `${HOME}\\Documents\\proxy-diagnostics-20261110.json`, count: 42, sha256: "71b10fa87f45" } satisfies ExportResult;

    default:
      throw new Error(`預覽模式沒有實作的指令：${cmd}`);
  }
}

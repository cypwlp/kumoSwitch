import type { CSSProperties } from "react";

type HarnessId = string;

const HARNESS_COLORS: Record<string, string> = {
  codex: "#5ee0ad",
  claude: "#e58a68",
  gemini: "#6ea8fe",
  grok: "#e5e7eb",
  opencode: "#f8fafc",
  qoder: "#2dd4bf",
  dsh: "#6f88ff",
  zcode: "#a78bfa",
  hermes: "#e6b980",
  commandcode: "#fb7185",
  crush: "#f472b6",
  qwen: "#8b8ff8",
  kilo: "#facc15",
  pi: "#fbbf24",
  omp: "#4ade80",
};

function HarnessGlyph({ id }: { id: HarnessId }) {
  switch (id) {
    case "codex":
      return <><path d="M5 7.5h8.5M10.5 4.5l3 3-3 3" /><path d="M19 16.5h-8.5M13.5 13.5l-3 3 3 3" /><circle cx="19" cy="6" r="1.4" fill="currentColor" stroke="none" /></>;
    case "claude":
      return <><path d="M12 4.2v15.6M4.2 12h15.6M6.5 6.5l11 11M17.5 6.5l-11 11" /><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" /></>;
    case "gemini":
      return <><path d="M12 3.5c.7 4.8 3.7 7.8 8.5 8.5-4.8.7-7.8 3.7-8.5 8.5-.7-4.8-3.7-7.8-8.5-8.5 4.8-.7 7.8-3.7 8.5-8.5Z" fill="currentColor" stroke="none" /><path d="M19.2 3.4v3.2M17.6 5h3.2" /></>;
    case "grok":
      return <><path d="M5.2 5.2 18.8 18.8M18.8 5.2 5.2 18.8" strokeWidth="2.7" /><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" /></>;
    case "opencode":
      return <><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M8 10.2 10.4 12 8 13.8M12.5 14h3.5" /></>;
    case "qoder":
      return <><circle cx="11.5" cy="11.5" r="6.5" /><path d="m15.5 15.5 4 4" strokeWidth="2.4" /><path d="M9 10h5v3H9z" fill="currentColor" stroke="none" /></>;
    case "dsh":
      return <><path d="M7 5h4.7c4.3 0 6.3 2.4 6.3 7s-2 7-6.3 7H7V5Z" /><path d="M10 8.5h1.7c2.4 0 3.3 1.1 3.3 3.5s-.9 3.5-3.3 3.5H10" /></>;
    case "zcode":
      return <><path d="M5.5 6h13L8 18h10.5" strokeWidth="2.2" /><path d="M16.2 4.2h3.2v3.2" /></>;
    case "hermes":
      return <><path d="M5 19c4.7-.4 8.8-2.7 11.5-7.4M7.2 14.8l-2.6-2.1 3.5-.2M10.4 12.7 9 9.2l3.1 1.7M13 10.1 12.2 6l2.3 2.5M15.6 7.1l1-2.6 1.2 2.8" /><path d="M5 19c2.7-.8 5.2-2.7 7-5.6" /></>;
    case "commandcode":
      return <><path d="m5.5 8 4 4-4 4M11 16h6" /><rect x="3.5" y="4" width="17" height="16" rx="3" opacity=".45" /></>;
    case "crush":
      return <path d="M12 19.5S4.5 15 4.5 9.8A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7.5 1.8c0 5.2-7.5 9.7-7.5 9.7Z" fill="currentColor" stroke="none" />;
    case "qwen":
      return <><circle cx="11.3" cy="11.3" r="6.1" /><path d="m15.6 15.6 4 4" strokeWidth="2.3" /><path d="M8.6 9.2h5.5M9.4 12h4.8M10.2 14.8h3.2" /></>;
    case "kilo":
      return <><path d="M6 4.5v15M18 5.5l-7 6.5 7 7" strokeWidth="2.2" /><path d="M9.5 12h2" /></>;
    case "pi":
      return <><path d="M5 7.2h14M8 7.2l1.3 10M16 7.2l-1.3 10" strokeWidth="2.2" /><path d="M9.3 7.2c.3-1.7 4.8-1.7 5.4 0" /></>;
    case "omp":
      return <><path d="M7.1 18.5h9.8M8.2 17c-2.4-1.3-3.7-3.3-3.7-5.8a7.5 7.5 0 0 1 15 0c0 2.5-1.3 4.5-3.7 5.8" /><path d="M9.2 19.5h5.6" /><circle cx="12" cy="10.7" r="1.4" fill="currentColor" stroke="none" /></>;
    default:
      return <text x="12" y="16" textAnchor="middle" fontSize="10" fill="currentColor" stroke="none">?</text>;
  }
}

export function HarnessIcon({ id, name, size = 28, className = "" }: {
  id: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const color = HARNESS_COLORS[id] ?? "#38bdf8";
  return (
    <span
      className={`harness-icon ${className}`.trim()}
      data-harness={id}
      title={name}
      aria-hidden="true"
      style={{ "--mark": color, width: size, height: size } as CSSProperties}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <HarnessGlyph id={id} />
      </svg>
    </span>
  );
}

const PROVIDER_GLYPHS: Record<string, string> = {
  openai: "◉",
  anthropic: "A",
  gemini: "✦",
  xai: "X",
  deepseek: "D",
  kimi: "K",
  glm: "G",
  qwen: "Q",
  minimax: "M",
  openrouter: "⇄",
  groq: "G",
  mistral: "M",
  siliconflow: "S",
  opencode: "O",
  commandcode: ">_",
  ollama: "O",
  lmstudio: "L",
  github: "GH",
  vllm: "V",
  together: "T",
  fireworks: "F",
  novita: "N",
  tencent: "T",
  volcengine: "V",
  baidu: "B",
  custom: "+",
};

export function ProviderMark({ icon, name, color = "#38bdf8", size = 38 }: {
  icon: string;
  name: string;
  color?: string;
  size?: number;
}) {
  const glyph = PROVIDER_GLYPHS[icon] ?? (name.trim().slice(0, 2).toUpperCase() || "?");
  return (
    <span
      className="provider-mark"
      aria-hidden="true"
      style={{ "--mark": color, width: size, height: size, fontSize: glyph.length > 1 ? Math.max(10, size * 0.28) : size * 0.43 } as CSSProperties}
    >
      {glyph}
    </span>
  );
}

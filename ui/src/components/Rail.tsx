import type { ReactNode } from "react";
import type { AppInfo, ToolView } from "../types";
import type { ThemeMode } from "../theme";
import { LangToggle } from "./LangToggle";
import { AutoIcon, Logo, MoonIcon, SunIcon } from "./Icons";

interface RailProps {
  tools: ToolView[];
  selectedId: string | null;
  filter: string;
  info: AppInfo | null;
  theme: ThemeMode;
  busy: boolean;
  onFilter: (value: string) => void;
  onSelect: (id: string) => void;
  onRescan: () => void;
  onTheme: (mode: ThemeMode) => void;
  onExport: () => void;
  onImport: () => void;
}

const THEMES: { mode: ThemeMode; label: string; icon: ReactNode }[] = [
  { mode: "dark", label: "暗色", icon: <MoonIcon /> },
  { mode: "light", label: "亮色", icon: <SunIcon /> },
  { mode: "system", label: "系統", icon: <AutoIcon /> },
];

export function Rail({
  tools,
  selectedId,
  filter,
  info,
  theme,
  busy,
  onFilter,
  onSelect,
  onRescan,
  onTheme,
  onExport,
  onImport,
}: RailProps) {
  const q = filter.trim().toLowerCase();
  const visible = tools.filter(
    (t) =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.blurb.toLowerCase().includes(q) ||
      t.id.includes(q),
  );

  return (
    <aside className="rail">
      <div className="brand">
        <Logo />
        <div>
          <h1>SwitchYard</h1>
          <p>AI CLI 供應商切換</p>
        </div>
      </div>

      <input
        className="rail-search"
        type="search"
        placeholder="篩選工具…"
        autoComplete="off"
        value={filter}
        aria-label="篩選工具"
        onChange={(event) => onFilter(event.target.value)}
      />

      <nav className="tools" aria-label="工具清單">
        {visible.map((t) => (
          <button
            key={t.id}
            className={`tool${selectedId === t.id ? " active" : ""}`}
            onClick={() => onSelect(t.id)}
            aria-current={selectedId === t.id}
          >
            <span
              className={`dot${t.detected ? " on" : ""}`}
              title={t.detected ? "已偵測到設定目錄" : "尚未安裝或沒有設定目錄"}
            />
            <span className="label">
              <b>{t.name}</b>
              <span>{t.blurb}</span>
            </span>
            {t.provider_count ? <span className="n">{t.provider_count}</span> : null}
          </button>
        ))}
        {visible.length === 0 ? (
          <div className="empty small">沒有符合的工具</div>
        ) : null}
      </nav>

      <div className="rail-foot">
        <LangToggle />
        <div className="segmented" role="group" aria-label="主題">
          {THEMES.map((t) => (
            <button
              key={t.mode}
              className={theme === t.mode ? "on" : ""}
              onClick={() => onTheme(t.mode)}
              aria-pressed={theme === t.mode}
              title={`主題：${t.label}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="rail-actions">
          <button className="ghost small" onClick={onExport} title="把所有供應商匯出成 JSON">
            匯出清單
          </button>
          <button className="ghost small" onClick={onImport} title="從 JSON 檔案匯入供應商">
            匯入清單
          </button>
        </div>

        <div className="rail-meta">
          <span className="ver muted" title={info?.dataDir ?? ""}>
            <span>{info ? `v${info.version}` : ""}</span>
            {info ? (
              <span className={`badge ${info.encrypted ? "ok" : "subtle"}`}>
                {info.encrypted ? "已加密" : "未加密"}
              </span>
            ) : null}
          </span>
          <button className="ghost small" onClick={onRescan} disabled={busy} title="重新掃描設定檔">
            重新掃描
          </button>
        </div>
      </div>
    </aside>
  );
}
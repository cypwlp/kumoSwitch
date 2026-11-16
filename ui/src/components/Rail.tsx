import type { AppInfo, ToolView } from "../types";
import { Logo, SettingsIcon } from "./Icons";
import { HarnessIcon } from "./Marks";

interface RailProps {
  tools: ToolView[];
  selectedId: string | null;
  filter: string;
  info: AppInfo | null;
  onFilter: (value: string) => void;
  onSelect: (id: string) => void;
  onSettings: () => void;
}

export function Rail({ tools, selectedId, filter, info, onFilter, onSelect, onSettings }: RailProps) {
  const q = filter.trim().toLowerCase();
  const visible = tools.filter(
    (tool) =>
      !q ||
      tool.name.toLowerCase().includes(q) ||
      tool.blurb.toLowerCase().includes(q) ||
      tool.id.includes(q),
  );

  return (
    <aside className="rail">
      <div className="brand">
        <Logo />
        <div>
          <h1>kumoSwitch</h1>
          <p>AI Harness 供應商切換</p>
        </div>
      </div>

      <input
        className="rail-search"
        type="search"
        placeholder="篩選 Harness…"
        autoComplete="off"
        value={filter}
        aria-label="篩選 Harness"
        onChange={(event) => onFilter(event.target.value)}
      />

      <nav className="tools" aria-label="Harness 清單">
        {visible.map((tool) => (
          <button
            key={tool.id}
            className={`tool${selectedId === tool.id ? " active" : ""}`}
            onClick={() => onSelect(tool.id)}
            aria-current={selectedId === tool.id}
          >
            <span className="tool-icon-wrap">
              <HarnessIcon id={tool.id} name={tool.name} size={30} />
              <span
                className={`dot tool-status${tool.detected ? " on" : ""}`}
                title={tool.detected ? "已偵測到設定目錄" : "尚未安裝或沒有設定目錄"}
              />
            </span>
            <span className="label">
              <b>
                {tool.name}
                {tool.surface !== "cli" ? <span className="surface-mini" title="支援桌面版">▣</span> : null}
              </b>
              <span>{tool.blurb}</span>
            </span>
            {tool.provider_count ? <span className="n">{tool.provider_count}</span> : null}
          </button>
        ))}
        {visible.length === 0 ? <div className="empty small">沒有符合的工具</div> : null}
      </nav>

      <div className="rail-foot rail-foot-simple">
        <button className="rail-settings-primary" onClick={onSettings} title="語言、主題、導覽、資料與更新">
          <SettingsIcon />
          <span>
            <strong>設定</strong>
            <small>語言、外觀、工具與資料</small>
          </span>
        </button>
        <div className="rail-meta">
          <span className="ver muted" title={info?.dataDir ?? ""}>
            <span>{info ? `v${info.version}` : ""}</span>
            {info ? (
              <span className={`badge ${info.encrypted ? "ok" : "subtle"}`}>
                {info.encrypted ? "已加密" : "未加密"}
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </aside>
  );
}

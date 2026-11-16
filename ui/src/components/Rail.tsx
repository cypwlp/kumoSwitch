import { useMemo, useState } from "react";
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

function ToolButton({
  tool,
  selected,
  onSelect,
}: {
  tool: ToolView;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      className={`tool${selected ? " active" : ""}`}
      onClick={() => onSelect(tool.id)}
      aria-current={selected}
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
  );
}

export function Rail({ tools, selectedId, filter, info, onFilter, onSelect, onSettings }: RailProps) {
  const [showOthers, setShowOthers] = useState(false);
  const q = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      tools.filter(
        (tool) =>
          !q ||
          tool.name.toLowerCase().includes(q) ||
          tool.blurb.toLowerCase().includes(q) ||
          tool.id.includes(q),
      ),
    [tools, q],
  );

  const used = visible.filter((tool) => tool.detected || tool.provider_count > 0);
  const others = visible.filter((tool) => !(tool.detected || tool.provider_count > 0));
  const activeIsOther = others.some((tool) => tool.id === selectedId);
  const othersOpen = showOthers || activeIsOther || Boolean(q);

  return (
    <aside className="rail">
      <div className="brand">
        <Logo />
        <div>
          <h1>kumoSwitch</h1>
          <p>AI 工具供應商切換</p>
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
        {q ? (
          visible.length ? (
            visible.map((tool) => (
              <ToolButton
                key={tool.id}
                tool={tool}
                selected={selectedId === tool.id}
                onSelect={onSelect}
              />
            ))
          ) : (
            <div className="empty small">沒有符合的工具</div>
          )
        ) : (
          <>
            {used.length ? (
              <>
                {others.length ? <div className="rail-group-label">我的工具</div> : null}
                {used.map((tool) => (
                  <ToolButton
                    key={tool.id}
                    tool={tool}
                    selected={selectedId === tool.id}
                    onSelect={onSelect}
                  />
                ))}
              </>
            ) : null}
            {others.length ? (
              <>
                <button
                  type="button"
                  className={`rail-group-toggle${othersOpen ? " open" : ""}`}
                  aria-expanded={othersOpen}
                  onClick={() => setShowOthers((open) => !open)}
                >
                  <span>其他工具</span>
                  <span className="n">{others.length}</span>
                  <span className="chev" aria-hidden="true">›</span>
                </button>
                {othersOpen
                  ? others.map((tool) => (
                      <ToolButton
                        key={tool.id}
                        tool={tool}
                        selected={selectedId === tool.id}
                        onSelect={onSelect}
                      />
                    ))
                  : null}
              </>
            ) : null}
            {!visible.length ? <div className="empty small">沒有符合的工具</div> : null}
          </>
        )}
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

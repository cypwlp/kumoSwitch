import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { HistoryMap, Provider, ToolView } from "../types";
import { ProviderTable, type TestState } from "./ProviderTable";
import { WarnIcon } from "./Icons";

interface PanelProps {
  tool: ToolView;
  activeProvider: Provider | null;
  rows: Provider[];
  total: number;
  filter: string;
  busy: boolean;
  tests: Record<string, TestState>;
  history: HistoryMap;
  searchRef: RefObject<HTMLInputElement>;
  onFilter: (value: string) => void;
  onReveal: () => void;
  onBackups: () => void;
  onAdd: () => void;
  onImportConfig: () => void;
  onApply: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onTest: (provider: Provider) => void;
  onPalette: () => void;
  onDiagnostics: () => void;
  onCheckUpdate: () => void;
  autoHealth: boolean;
  onToggleAutoHealth: () => void;
  sort: "manual" | "name" | "recent";
  onSort: (value: "manual" | "name" | "recent") => void;
}

export function ToolPanel({
  tool,
  activeProvider,
  rows,
  total,
  filter,
  busy,
  tests,
  history,
  searchRef,
  onFilter,
  onReveal,
  onBackups,
  onAdd,
  onImportConfig,
  onApply,
  onEdit,
  onDelete,
  onTest,
  onPalette,
  onDiagnostics,
  onCheckUpdate,
  autoHealth,
  onToggleAutoHealth,
  sort,
  onSort,
}: PanelProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !moreRef.current?.contains(event.target)) {
        setMoreOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMoreOpen(false);
      moreTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => moreMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const menuAction = (action: () => void) => () => {
    setMoreOpen(false);
    action();
  };

  return (
    <section className="panel" key={tool.id}>
      <header className="panel-head">
        <div className="title-row">
          <h2>{tool.name}</h2>
          <span className="badge subtle">Harness</span>
          <span className="muted">{tool.blurb}</span>
          {tool.verified ? (
            <span className="badge ok">格式已驗證</span>
          ) : (
            <span className="badge warn">格式未實測，請先看 diff</span>
          )}
        </div>
        <div className="path-row">
          <code title="設定檔路徑">{tool.path}</code>
          <button className="ghost small" onClick={onReveal}>
            開啟資料夾
          </button>
          <span className="badge subtle">{tool.format}</span>
        </div>
      </header>

      {tool.takeover ? (
        <div className="banner warn">
          <strong>
            <WarnIcon /> cc-switch 正在接管這個 Harness
          </strong>
          <span>偵測到代理模式啟用中，套用後可能被 cc-switch 覆蓋。建議先切回直連模式。</span>
        </div>
      ) : null}

      <div className="current-strip">
        <div className="current-provider">
          <span className="eyebrow">目前套用</span>
          <strong>{activeProvider?.name || tool.current.model || "尚未選擇供應商"}</strong>
          {tool.current.model ? <code>{tool.current.model}</code> : null}
        </div>
        <div className="current-meta">
          <span className="current-url mono" title={tool.current.base_url || "尚未設定 Base URL"}>
            {tool.current.base_url || "尚未設定 Base URL"}
          </span>
          <span>金鑰 {tool.current.api_key_tail || "—"}</span>
        </div>
        <span className="current-restart">{tool.restart}</span>
      </div>

      <div className="provider-list-head">
        <div>
          <h3>已設定的供應商</h3>
          <p>這裡列出 {tool.name} Harness 的供應商。點擊供應商即可查看它的模型、Base URL 與金鑰設定。</p>
        </div>
        <span className="badge subtle">{total} 個供應商</span>
      </div>

      <div className="toolbar">
        <input
          ref={searchRef}
          className="search"
          type="search"
          placeholder="搜尋供應商名稱、URL 或模型…（按 / 聚焦）"
          autoComplete="off"
          value={filter}
          aria-label="篩選供應商"
          onChange={(event) => onFilter(event.target.value)}
        />
        <span className="muted small">
          {rows.length} / {total} 個供應商
        </span>
        <div className="spacer" />
        <select
          className="mini-select"
          value={sort}
          aria-label="排序方式"
          onChange={(event) => onSort(event.target.value as "manual" | "name" | "recent")}
        >
          <option value="manual">原始順序</option>
          <option value="name">依名稱</option>
          <option value="recent">最近使用</option>
        </select>
        <button
          className="ghost"
          onClick={onImportConfig}
          disabled={busy}
          title="讀取這個 Harness 現有的設定檔，把裡面的供應商收進 kumoSwitch"
        >
          從設定檔導入
          {tool.importable > 0 ? <span className="cnt">{tool.importable}</span> : null}
        </button>
        <div className={`more${moreOpen ? " open" : ""}`} ref={moreRef}>
          <button
            ref={moreTriggerRef}
            type="button"
            className="ghost more-trigger"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-controls="harness-more-menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            更多
          </button>
          {moreOpen ? (
            <div className="more-menu" id="harness-more-menu" role="menu" ref={moreMenuRef}>
              <button type="button" role="menuitem" onClick={menuAction(onPalette)}>
                快速切換 <kbd>Ctrl</kbd><kbd>K</kbd>
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onBackups)}>
                備份紀錄
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onDiagnostics)}>
                匯出診斷摘要
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onCheckUpdate)}>
                檢查更新
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onToggleAutoHealth)}>
                {autoHealth ? "✓ 自動健康檢查（10 分鐘）" : "自動健康檢查（關）"}
              </button>
            </div>
          ) : null}
        </div>
        <button className="primary" onClick={onAdd} title="新增供應商 (Ctrl+N)">
          ＋ 新增供應商
        </button>
      </div>

      <ProviderTable
        rows={rows}
        total={total}
        tests={tests}
        history={history}
        activeId={tool.active_id}
        onApply={onApply}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    </section>
  );
}

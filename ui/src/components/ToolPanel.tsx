import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { HistoryMap, Provider, ToolView } from "../types";
import { ProviderTable, type TestState } from "./ProviderTable";
import { WarnIcon } from "./Icons";

interface PanelProps {
  tool: ToolView;
  activeProvider: Provider | null;
  previousProvider: Provider | null;
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
  onReorder: (ids: string[]) => void;
  onSwitchModel: (provider: Provider, modelId: string) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onTest: (provider: Provider) => void;
  onPalette: () => void;
  onDiagnostics: () => void;
  onCheckUpdate: () => void;
  onOpenInstall: () => void;
  autoHealth: boolean;
  onToggleAutoHealth: () => void;
  autoModelSync: boolean;
  onToggleAutoModelSync: () => void;
  sort: "manual" | "name" | "recent";
  onSort: (value: "manual" | "name" | "recent") => void;
}

export function ToolPanel({
  tool,
  activeProvider,
  previousProvider,
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
  onReorder,
  onSwitchModel,
  onEdit,
  onDelete,
  onTest,
  onPalette,
  onDiagnostics,
  onCheckUpdate,
  onOpenInstall,
  autoHealth,
  onToggleAutoHealth,
  autoModelSync,
  onToggleAutoModelSync,
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
          {tool.current.model ? <span className="current-model"><span>模型</span><code>{tool.current.model}</code></span> : null}
        </div>
        <div className="current-meta">
          <span className="current-url mono" title={tool.current.base_url || "尚未設定 Base URL"}>
            {tool.current.base_url || "尚未設定 Base URL"}
          </span>
          <span>金鑰 {tool.current.api_key_tail || "—"}</span>
          {previousProvider ? (
            <button className="ghost small" type="button" onClick={() => onApply(previousProvider)}>
              切回上一個供應商
            </button>
          ) : null}
        </div>
        <span className="current-restart">{tool.restart}</span>
      </div>

      <nav className="resource-path" aria-label="Harness、供應商與模型層級">
        <span className="resource-step complete">
          <i>1</i>
          <span><b>Harness</b><em>{tool.name}</em></span>
        </span>
        <span className="resource-chevron" aria-hidden="true">›</span>
        <span className="resource-step active">
          <i>2</i>
          <span><b>供應商</b><em>{total} 個 endpoint／金鑰組合</em></span>
        </span>
        <span className="resource-chevron" aria-hidden="true">›</span>
        <span className="resource-step">
          <i>3</i>
          <span><b>模型</b><em>進入供應商後管理</em></span>
        </span>
      </nav>

      <div className="provider-list-head">
        <div>
          <span className="eyebrow">Provider directory</span>
          <h3>供應商</h3>
          <p>供應商是獨立的 endpoint＋金鑰；模型是供應商底下的子項目。先選供應商，再進入它的模型。</p>
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
              <button type="button" role="menuitem" onClick={menuAction(onOpenInstall)}>
                開啟安裝／更新向導
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onToggleAutoHealth)}>
                {autoHealth ? "✓ 自動健康檢查（10 分鐘）" : "自動健康檢查（關）"}
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onToggleAutoModelSync)}>
                {autoModelSync ? "✓ 自動模型同步（供應商排程）" : "自動模型同步（關）"}
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
        onAttemptReorder={(ids) => onReorder(ids)}
        onSwitchModel={onSwitchModel}
        onApply={onApply}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />
    </section>
  );
}

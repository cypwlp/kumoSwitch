import type { RefObject } from "react";
import type { Provider, ToolView } from "../types";
import { ProviderTable, type EditField, type TestState } from "./ProviderTable";
import { WarnIcon } from "./Icons";

interface PanelProps {
  tool: ToolView;
  rows: Provider[];
  total: number;
  filter: string;
  busy: boolean;
  tests: Record<string, TestState>;
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
  onInlineSave: (provider: Provider, field: EditField, value: string) => void;
  onClone: (provider: Provider) => void;
  onPalette: () => void;
  onDiagnostics: () => void;
  sort: "manual" | "name" | "recent";
  onSort: (value: "manual" | "name" | "recent") => void;
}

export function ToolPanel({
  tool,
  rows,
  total,
  filter,
  busy,
  tests,
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
  onInlineSave,
  onClone,
  onPalette,
  onDiagnostics,
  sort,
  onSort,
}: PanelProps) {
  return (
    <section className="panel" key={tool.id}>
      <header className="panel-head">
        <div className="title-row">
          <h2>{tool.name}</h2>
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
            <WarnIcon /> cc-switch 正在接管這個工具
          </strong>
          <span>偵測到代理模式啟用中，套用後可能被 cc-switch 覆蓋。建議先切回直連模式。</span>
        </div>
      ) : null}

      <div className="state-card">
        <div className="state-item">
          <span className="k">目前 Base URL</span>
          <span className="v mono">{tool.current.base_url || "—"}</span>
        </div>
        <div className="state-item">
          <span className="k">目前模型</span>
          <span className="v mono">{tool.current.model || "—"}</span>
        </div>
        <div className="state-item">
          <span className="k">目前金鑰</span>
          <span className="v mono">{tool.current.api_key_tail || "—"}</span>
        </div>
        <div className="state-item">
          <span className="k">重啟</span>
          <span className="v small">{tool.restart}</span>
        </div>
        <div className="state-item state-source">
          <span className="k">狀態來源</span>
          {tool.current.source ? (
            <span className="v mono" title="目前狀態是從這個鍵讀出來的">
              {tool.current.source}
            </span>
          ) : (
            <span className="v none">由工具介面選擇</span>
          )}
        </div>
      </div>

      <div className="toolbar">
        <input
          ref={searchRef}
          className="search"
          type="search"
          placeholder="輸入即篩：名稱、URL、模型…（按 / 聚焦）"
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
          title="讀取這個工具現有的設定檔，把裡面的供應商收進 SwitchYard"
        >
          從設定檔導入
          {tool.importable > 0 ? <span className="cnt">{tool.importable}</span> : null}
        </button>
        <details className="more">
          <summary className="ghost">更多</summary>
          <div className="more-menu">
            <button onClick={onPalette}>快速切換 <kbd>Ctrl</kbd><kbd>K</kbd></button>
            <button onClick={onBackups}>備份紀錄</button>
            <button onClick={onDiagnostics}>匯出診斷摘要</button>
          </div>
        </details>
        <button className="primary" onClick={onAdd} title="新增供應商 (Ctrl+N)">
          ＋ 新增供應商
        </button>
      </div>

      <ProviderTable
        tool={tool}
        rows={rows}
        total={total}
        tests={tests}
        onApply={onApply}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
        onInlineSave={onInlineSave}
        onClone={onClone}
      />
    </section>
  );
}
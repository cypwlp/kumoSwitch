import { useEffect, useRef, useState } from "react";
import type { HistoryMap, HistorySummary, Provider, TestResult, ToolView } from "../types";

export type EditField = "name" | "base_url" | "model";
export type TestState = TestResult | "pending";

interface CellProps {
  value: string;
  display?: string;
  mono?: boolean;
  strong?: boolean;
  editing: boolean;
  onStart: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

function EditableCell({ value, display, mono, strong, editing, onStart, onCommit, onCancel }: CellProps) {
  const input = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (!editing) return;
    settled.current = false;
    const node = input.current;
    if (node) {
      node.focus();
      node.select();
    }
  }, [editing]);

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onCommit(input.current?.value ?? value);
  };
  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  if (editing) {
    return (
      <input
        ref={input}
        className={`cell-input${mono ? " mono" : ""}`}
        defaultValue={value}
        aria-label="直接編輯欄位"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
        }}
        onBlur={commit}
      />
    );
  }

  const text = (display ?? value) || "—";
  return (
    <span
      className="editable"
      title="雙擊或按 F2 直接編輯"
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStart();
      }}
    >
      {strong ? <b>{text}</b> : text}
    </span>
  );
}

function testBadge(result: TestState) {
  if (result === "pending") {
    return (
      <span className="badge subtle test-line">
        <span className="spin" /> 測試中
      </span>
    );
  }
  const tone = result.status === 200 ? "ok" : result.status === 401 || result.status === 403 ? "warn" : "err";
  const label = result.status > 0 ? `${result.status} · ${result.ms}ms` : `失敗 · ${result.ms}ms`;
  return (
    <span className={`badge ${tone} test-line`} title={result.message}>
      {label}
    </span>
  );
}

interface TableProps {
  tool: ToolView;
  rows: Provider[];
  total: number;
  tests: Record<string, TestState>;
  onApply: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onTest: (provider: Provider) => void;
  history: HistoryMap;
  onInlineSave: (provider: Provider, field: EditField, value: string) => void;
}

export function ProviderTable({
  tool,
  rows,
  total,
  tests,
  onApply,
  onEdit,
  onDelete,
  onTest,
  history,
  onInlineSave,
}: TableProps) {
  const [editing, setEditing] = useState<{ id: string; field: EditField } | null>(null);
  const body = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    setEditing(null);
  }, [tool.id]);

  const moveFocus = (from: HTMLElement, delta: number) => {
    const all = Array.from(body.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row]") ?? []);
    const index = all.indexOf(from as HTMLTableRowElement);
    const next = all[index + delta];
    if (next) next.focus();
  };

  const isEditing = (id: string, field: EditField) => editing?.id === id && editing.field === field;

  return (
    <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th className="c-name">名稱</th>
            <th className="c-url">Base URL</th>
            <th className="c-model">模型</th>
            <th className="c-health">健康度</th>
              <th className="c-state">狀態</th>
            <th className="c-act">動作</th>
          </tr>
        </thead>
        <tbody ref={body}>
          {rows.map((p) => {
            const active = tool.active_id === p.id;
            const test = tests[p.id];
            return (
              <tr
                key={p.id}
                data-row={p.id}
                tabIndex={0}
                className={active ? "active-row" : ""}
                aria-label={`供應商 ${p.name}`}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveFocus(event.currentTarget, 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveFocus(event.currentTarget, -1);
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    onApply(p);
                  } else if (event.key === "F2") {
                    event.preventDefault();
                    setEditing({ id: p.id, field: "name" });
                  }
                }}
              >
                <td className="name">
                  <EditableCell
                    value={p.name}
                    strong
                    editing={isEditing(p.id, "name")}
                    onStart={() => setEditing({ id: p.id, field: "name" })}
                    onCommit={(value) => {
                      setEditing(null);
                      onInlineSave(p, "name", value);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                  <span>{p.note || p.config_id}</span>
                </td>
                <td className="url mono" title={p.base_url}>
                  <EditableCell
                    value={p.base_url}
                    mono
                    editing={isEditing(p.id, "base_url")}
                    onStart={() => setEditing({ id: p.id, field: "base_url" })}
                    onCommit={(value) => {
                      setEditing(null);
                      onInlineSave(p, "base_url", value);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </td>
                <td className="mono">
                  <EditableCell
                    value={p.model}
                    mono
                    editing={isEditing(p.id, "model")}
                    onStart={() => setEditing({ id: p.id, field: "model" })}
                    onCommit={(value) => {
                      setEditing(null);
                      onInlineSave(p, "model", value);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </td>
                <td className="c-health">
                  <HealthCell summary={history[p.id]} />
                </td>
                <td className="c-state">
                  {active ? (
                    <span className="badge ok">使用中</span>
                  ) : (
                    <span className="badge subtle">待用</span>
                  )}
                  {test ? testBadge(test) : null}
                </td>
                <td className="c-act">
                  <span className="act">
                    <button
                      className="small ghost"
                      onClick={() => onTest(p)}
                      disabled={test === "pending"}
                      title="送一個最小請求測試這組 Base URL / API Key"
                    >
                      測試
                    </button>
                    <button className="small primary" onClick={() => onApply(p)} title="先看 diff 再套用">
                      套用
                    </button>
                    <button className="small ghost" onClick={() => onEdit(p)}>
                      編輯
                    </button>
                    <button className="small danger" onClick={() => onDelete(p)}>
                      刪除
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div className="empty">
          {total ? (
            <>
              沒有符合條件的供應商
              <br />
              <span className="small">清空搜尋框可看全部</span>
            </>
          ) : (
            <>
              還沒有供應商
              <br />
              <span className="small">點右上「＋ 新增供應商」，填入 Base URL 與 API Key 即可</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
function HealthCell({ summary }: { summary?: HistorySummary }) {
  if (!summary || summary.total === 0) {
    return <span className="muted small">未測試</span>;
  }
  const bars = summary.samples.slice(-12);
  const max = Math.max(...bars.map((s) => s.ms), 1);
  const pct = Math.round(summary.success_rate * 100);
  const tone = pct >= 95 ? "ok" : pct >= 70 ? "warn" : "bad";
  const when = new Date(summary.last_ts).toLocaleString();
  return (
    <div className={`health ${tone}`} title={`最近 ${summary.total} 筆 · 平均 ${summary.avg_ms}ms · ${when}`}>
      <span className="spark">
        {bars.map((s, i) => (
          <i
            key={i}
            className={s.ok ? "ok" : "bad"}
            style={{ height: `${s.ok ? Math.max(20, Math.round((s.ms / max) * 100)) : 100}%` }}
          />
        ))}
      </span>
      <span className="health-text">
        {pct}% · {summary.avg_ms}ms
      </span>
    </div>
  );
}

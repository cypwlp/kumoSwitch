import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorText } from "../api";
import type { HealthOverview, UsageReport } from "../types";

const fmt = (n: number) => n.toLocaleString("en-US");
const money = (n: number | null) => (n == null ? "未定價" : `$${n.toFixed(2)}`);

interface Props {
  onError: (message: string) => void;
}

export function StatsView({ onError }: Props) {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [health, setHealth] = useState<HealthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanError, setScanError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setScanError("");
    (async () => {
      try {
        const [nextReport, nextHealth] = await Promise.all([api.usageReport(days), api.healthOverview()]);
        if (!alive) return;
        setReport(nextReport);
        setHealth(nextHealth);
      } catch (error) {
        const message = errorText(error);
        if (!alive) return;
        setScanError(message);
        onErrorRef.current(message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [days, refreshKey]);

  const maxDay = useMemo(() => Math.max(...(report?.days.map((day) => day.total) ?? [1]), 1), [report]);
  const hasUsage = Boolean(report && report.records > 0);
  const totalFiles = report?.roots.reduce((sum, root) => sum + root.files, 0) ?? 0;

  return (
    <section className="stats">
      <header className="stats-head">
        <h2>統計儀表板</h2>
        <span className="muted small">串流讀取 Claude Code／Codex 本機 session log，只在本機計算</span>
        <div className="spacer" />
        <div className="segmented compact" role="group" aria-label="統計範圍">
          {[7, 30, 90].map((value) => (
            <button key={value} className={days === value ? "on" : ""} onClick={() => setDays(value)} disabled={loading}>
              {value} 天
            </button>
          ))}
        </div>
        <button className="ghost small" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          {loading ? <span className="spin" /> : null} 重新掃描
        </button>
      </header>

      {loading ? (
        <div className="stats-scan-state" role="status" aria-live="polite">
          <span className="spin" />
          <div>
            <strong>正在串流掃描 session log…</strong>
            <span>大型 JSONL 不會再整檔載入記憶體；這段期間 UI 仍可操作。</span>
          </div>
        </div>
      ) : scanError && !report ? (
        <div className="stats-scan-state error">
          <strong>掃描失敗</strong>
          <span>{scanError}</span>
          <button className="ghost small" onClick={() => setRefreshKey((value) => value + 1)}>再試一次</button>
        </div>
      ) : report ? (
        <>
          {hasUsage ? (
            <div className="stat-cards">
              <div className="stat-card"><span className="k">輸入 tokens</span><span className="v">{fmt(report.total_input)}</span></div>
              <div className="stat-card"><span className="k">輸出 tokens</span><span className="v">{fmt(report.total_output)}</span></div>
              <div className="stat-card"><span className="k">快取 tokens</span><span className="v">{fmt(report.total_cache)}</span></div>
              <div className="stat-card"><span className="k">估算成本</span><span className="v accent">{money(report.total_cost)}</span></div>
              <div className="stat-card"><span className="k">用量記錄</span><span className="v">{fmt(report.records)}</span></div>
              <div className="stat-card"><span className="k">已掃描檔案</span><span className="v">{fmt(report.files)}</span></div>
            </div>
          ) : (
            <div className="stats-empty-panel">
              <span className="stats-empty-icon">⌕</span>
              <div>
                <strong>{totalFiles === 0 ? "找不到 session log" : "找到 log，但沒有可解析的 token 用量"}</strong>
                <p>
                  {totalFiles === 0
                    ? "下面列出實際檢查的資料夾。請確認對應 CLI 曾在這台電腦使用，且 log 沒有被搬到其他位置。"
                    : `找到 ${totalFiles} 個 .jsonl，其中實際讀取 ${report.files} 個；可能是這個時間範圍沒有用量，或 log 格式尚未包含 usage。`}
                </p>
              </div>
            </div>
          )}

          {health ? (
            <div className="stat-cards slim">
              <div className="stat-card"><span className="k">連線測試次數</span><span className="v">{fmt(health.tests)}</span></div>
              <div className="stat-card"><span className="k">測試成功率</span><span className="v">{health.tests ? Math.round((health.ok / health.tests) * 100) : 0}%</span></div>
              <div className="stat-card"><span className="k">平均延遲</span><span className="v">{health.avg_ms}ms</span></div>
              <div className="stat-card"><span className="k">已測供應商</span><span className="v">{health.providers_tested}</span></div>
            </div>
          ) : null}

          {hasUsage ? (
            <>
              <h3 className="stats-sub">每日用量（近 {report.days_scanned} 天）</h3>
              {report.days.length === 0 ? (
                <div className="empty small">這個範圍內沒有用量記錄</div>
              ) : (
                <div className="day-chart" role="img" aria-label="每日 token 用量">
                  {report.days.map((day) => (
                    <div key={day.day} className="day-col" title={`${day.day} · ${fmt(day.total)} tokens`}>
                      <i style={{ height: `${Math.max(4, Math.round((day.total / maxDay) * 100))}%` }} />
                      <span>{day.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="stats-sub">依模型</h3>
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>來源</th>
                      <th>模型</th>
                      <th>輸入</th>
                      <th>輸出</th>
                      <th>快取</th>
                      <th>筆數</th>
                      <th>估算成本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={`${row.source}-${row.model}`}>
                        <td><span className="badge subtle">{row.source}</span></td>
                        <td className="mono">{row.model}</td>
                        <td className="mono">{fmt(row.input)}</td>
                        <td className="mono">{fmt(row.output)}</td>
                        <td className="mono">{fmt(row.cache_read + row.cache_write)}</td>
                        <td className="mono">{fmt(row.records)}</td>
                        <td className="mono">{money(row.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="fineprint">成本為公開單價估算（每百萬 token），非帳單金額；未列入價目表的模型顯示「未定價」。</p>
            </>
          ) : null}

          <div className="scan-diagnostics">
            <div className="scan-diagnostics-head">
              <div>
                <strong>掃描診斷</strong>
                <span>耗時 {report.elapsed_ms}ms · 已掃描 {report.files} 個檔案 · 跳過 {report.skipped_files} 個</span>
              </div>
              <span className={`badge ${hasUsage ? "ok" : "warn"}`}>{hasUsage ? "已找到用量" : "沒有用量"}</span>
            </div>
            <div className="scan-root-grid">
              {report.roots.map((root) => (
                <div className={`scan-root${root.exists ? "" : " missing"}`} key={`${root.source}-${root.path}`}>
                  <div><strong>{root.source === "codex" ? "Codex" : "Claude Code"}</strong><span className={`badge ${root.exists ? "ok" : "warn"}`}>{root.exists ? "已找到" : "路徑不存在"}</span></div>
                  <code>{root.path}</code>
                  <span>{root.files} 個 JSONL · 實際讀取 {root.scanned_files} 個</span>
                </div>
              ))}
            </div>
            {report.errors.length ? (
              <details className="scan-errors">
                <summary>{report.errors.length} 個檔案讀取失敗</summary>
                {report.errors.map((error) => <code key={error}>{error}</code>)}
              </details>
            ) : null}
          </div>
        </>
      ) : (
        <div className="empty">沒有可顯示的統計</div>
      )}
    </section>
  );
}
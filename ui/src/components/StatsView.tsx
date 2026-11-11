import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [r, h] = await Promise.all([api.usageReport(days), api.healthOverview()]);
        if (!alive) return;
        setReport(r);
        setHealth(h);
      } catch (err) {
        onError(errorText(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [days, onError]);

  const maxDay = useMemo(() => Math.max(...(report?.days.map((d) => d.total) ?? [1]), 1), [report]);

  return (
    <section className="stats">
      <header className="stats-head">
        <h2>統計儀表板</h2>
        <span className="muted small">讀取 Claude Code／Codex 本機 session log，只在本機計算</span>
        <div className="spacer" />
        <div className="segmented compact" role="group" aria-label="統計範圍">
          {[7, 30, 90].map((d) => (
            <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>
              {d} 天
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="empty">掃描 session log 中…</div>
      ) : !report ? (
        <div className="empty">沒有可顯示的統計</div>
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card"><span className="k">輸入 tokens</span><span className="v">{fmt(report.total_input)}</span></div>
            <div className="stat-card"><span className="k">輸出 tokens</span><span className="v">{fmt(report.total_output)}</span></div>
            <div className="stat-card"><span className="k">快取 tokens</span><span className="v">{fmt(report.total_cache)}</span></div>
            <div className="stat-card"><span className="k">估算成本</span><span className="v accent">{money(report.total_cost)}</span></div>
            <div className="stat-card"><span className="k">用量記錄</span><span className="v">{fmt(report.records)}</span></div>
            <div className="stat-card"><span className="k">掃描檔案</span><span className="v">{fmt(report.files)}</span></div>
          </div>

          {health ? (
            <div className="stat-cards slim">
              <div className="stat-card"><span className="k">連線測試次數</span><span className="v">{fmt(health.tests)}</span></div>
              <div className="stat-card"><span className="k">測試成功率</span><span className="v">{health.tests ? Math.round((health.ok / health.tests) * 100) : 0}%</span></div>
              <div className="stat-card"><span className="k">平均延遲</span><span className="v">{health.avg_ms}ms</span></div>
              <div className="stat-card"><span className="k">已測供應商</span><span className="v">{health.providers_tested}</span></div>
            </div>
          ) : null}

          <h3 className="stats-sub">每日用量（近 {report.days_scanned} 天）</h3>
          {report.days.length === 0 ? (
            <div className="empty small">這個範圍內沒有用量記錄</div>
          ) : (
            <div className="day-chart" role="img" aria-label="每日 token 用量">
              {report.days.map((d) => (
                <div key={d.day} className="day-col" title={`${d.day} · ${fmt(d.total)} tokens`}>
                  <i style={{ height: `${Math.max(4, Math.round((d.total / maxDay) * 100))}%` }} />
                  <span>{d.day.slice(5)}</span>
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
                {report.rows.map((r) => (
                  <tr key={`${r.source}-${r.model}`}>
                    <td><span className="badge subtle">{r.source}</span></td>
                    <td className="mono">{r.model}</td>
                    <td className="mono">{fmt(r.input)}</td>
                    <td className="mono">{fmt(r.output)}</td>
                    <td className="mono">{fmt(r.cache_read + r.cache_write)}</td>
                    <td className="mono">{fmt(r.records)}</td>
                    <td className="mono">{money(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fineprint">成本為公開單價估算（每百萬 token），非帳單金額；未列入價目表的模型顯示「未定價」。</p>
        </>
      )}
    </section>
  );
}

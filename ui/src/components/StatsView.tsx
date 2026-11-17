import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorText } from "../api";
import type { HealthOverview, UsageReport } from "../types";

const fmt = (n: number) => n.toLocaleString("en-US");
const money = (n: number | null) => (n == null ? "未定價" : `$${n.toFixed(2)}`);

const SOURCE_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  pi: "Pi",
  omp: "Oh My Pi",
  dsh: "DSH",
};
const SOURCE_ORDER = ["claude", "codex", "pi", "omp", "dsh"];

const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source;
const timeText = (ts: number) => new Date(ts).toLocaleString();
const durationText = (ms: number | null) =>
  ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const speedText = (speed: number | null) => (speed == null ? "—" : `${speed.toFixed(1)} tok/s`);

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
  const [sourceFilter, setSourceFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [requestLimit, setRequestLimit] = useState(20);
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

  const sourceOptions = useMemo(() => {
    const seen = new Set<string>();
    report?.rows.forEach((row) => seen.add(row.source));
    report?.roots.forEach((root) => {
      if (root.exists || root.files > 0) seen.add(root.source);
    });
    return [...seen].sort((a, b) => {
      const ai = SOURCE_ORDER.indexOf(a);
      const bi = SOURCE_ORDER.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
    });
  }, [report]);

  const counts = useMemo(() => {
    const next: Record<string, number> = {};
    report?.rows.forEach((row) => {
      next[row.source] = (next[row.source] ?? 0) + 1;
    });
    return next;
  }, [report]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (report?.rows ?? []).filter(
      (row) =>
        (sourceFilter === "all" || row.source === sourceFilter) &&
        (!q || row.model.toLowerCase().includes(q)),
    );
  }, [report, sourceFilter, query]);

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (report?.requests ?? []).filter(
      (item) =>
        (sourceFilter === "all" || item.source === sourceFilter) &&
        (!q || `${item.model} ${item.id}`.toLowerCase().includes(q)),
    );
  }, [report, sourceFilter, query]);

  const totals = useMemo(() => {
    let input = 0;
    let output = 0;
    let cache = 0;
    let records = 0;
    let cost: number | null = null;
    let duration = 0;
    let timedOutput = 0;
    let timedRecords = 0;
    let ttftSum = 0;
    let ttftRecords = 0;
    let reasoning = 0;
    let slowRecords = 0;
    let decodeWeighted = 0;
    let decodeWeight = 0;
    let fixedWeighted = 0;
    let fixedWeight = 0;
    for (const row of filteredRows) {
      input += row.input;
      output += row.output;
      cache += row.cache_read + row.cache_write;
      records += row.records;
      if (row.cost != null) cost = (cost ?? 0) + row.cost;
      duration += row.duration_ms ?? 0;
      timedOutput += row.timed_output ?? 0;
      timedRecords += row.timed_records ?? 0;
      reasoning += row.reasoning ?? 0;
      slowRecords += row.slow_records ?? 0;
      if (row.decode_output_per_sec != null) {
        const weight = Math.max(1, row.timed_output);
        decodeWeighted += row.decode_output_per_sec * weight;
        decodeWeight += weight;
      }
      if (row.fixed_overhead_ms != null) {
        const weight = Math.max(1, row.timed_records);
        fixedWeighted += row.fixed_overhead_ms * weight;
        fixedWeight += weight;
      }
      if (row.ttft_ms != null) {
        ttftSum += row.ttft_ms * row.ttft_records;
        ttftRecords += row.ttft_records;
      }
    }
    return {
      input,
      output,
      cache,
      records,
      cost,
      avgDuration: timedRecords ? Math.round(duration / timedRecords) : null,
      speed: duration ? timedOutput / (duration / 1000) : null,
      ttft: ttftRecords ? Math.round(ttftSum / ttftRecords) : null,
      timedRecords,
      reasoning,
      slowRecords,
      decodeSpeed: decodeWeight ? decodeWeighted / decodeWeight : null,
      fixedOverhead: fixedWeight ? Math.round(fixedWeighted / fixedWeight) : null,
    };
  }, [filteredRows]);

  const chartDays = useMemo(() => {
    const map = new Map<string, { input: number; output: number; total: number }>();
    for (const day of report?.days ?? []) {
      if (sourceFilter !== "all" && day.source !== sourceFilter) continue;
      const entry = map.get(day.day) ?? { input: 0, output: 0, total: 0 };
      entry.input += day.input;
      entry.output += day.output;
      entry.total += day.total;
      map.set(day.day, entry);
    }
    return [...map.entries()]
      .map(([day, value]) => ({ day, ...value }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [report, sourceFilter]);

  const maxDay = useMemo(() => Math.max(...chartDays.map((day) => day.total), 1), [chartDays]);
  const hasUsage = Boolean(report && report.records > 0);
  const totalFiles = report?.roots.reduce((sum, root) => sum + root.files, 0) ?? 0;

  return (
    <section className="stats">
      <header className="stats-head">
        <h2>統計儀表板</h2>
        <span className="muted small">只讀本機 session log，統計 Claude Code、Codex、Pi、Oh My Pi、DSH</span>
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
            <>
              <div className="stats-filters">
                <div className="segmented compact" role="group" aria-label="來源篩選">
                  <button className={sourceFilter === "all" ? "on" : ""} aria-pressed={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>
                    全部
                  </button>
                  {sourceOptions.map((source) => (
                    <button
                      key={source}
                      className={sourceFilter === source ? "on" : ""}
                      aria-pressed={sourceFilter === source}
                      onClick={() => setSourceFilter(source)}
                    >
                      {sourceLabel(source)}
                      <span className="count">{counts[source] ?? 0}</span>
                    </button>
                  ))}
                </div>
                <input
                  className="search stats-search"
                  type="search"
                  value={query}
                  placeholder="搜尋模型…"
                  aria-label="搜尋模型"
                  onChange={(event) => setQuery(event.target.value)}
                />
                <span className="muted small">{filteredRows.length} / {report.rows.length} 個模型</span>
              </div>

              <div className="stat-cards">
                <div className="stat-card"><span className="k">輸入 tokens</span><span className="v">{fmt(totals.input)}</span></div>
                <div className="stat-card"><span className="k">輸出 tokens</span><span className="v">{fmt(totals.output)}</span></div>
                <div className="stat-card"><span className="k">快取 tokens</span><span className="v">{fmt(totals.cache)}</span></div>
                <div className="stat-card"><span className="k">估算成本</span><span className="v accent">{money(totals.cost)}</span></div>
                <div className="stat-card"><span className="k">用量記錄</span><span className="v">{fmt(totals.records)}</span></div>
                <div className="stat-card"><span className="k">已掃描檔案</span><span className="v">{fmt(report.files)}</span></div>
              </div>

              <div className="stat-cards slim">
                <div className="stat-card" title="有計時資料的請求平均花費時間；不是連線測試延遲">
                  <span className="k">平均回應時間</span><span className="v">{durationText(totals.avgDuration)}</span>
                </div>
                <div className="stat-card" title="輸出 tokens ÷ 有計時請求的總時間；包含首字等待、思考、網路與重試">
                  <span className="k">有效吞吐（總量）</span><span className="v">{speedText(totals.speed)}</span>
                </div>
                <div className="stat-card" title="將每筆 duration 對輸出 tokens 迴歸，估出的解碼速度；已扣掉固定等待">
                  <span className="k">解碼速度（估算）</span><span className="v">{speedText(totals.decodeSpeed)}</span>
                </div>
                <div className="stat-card" title="每筆請求的固定等待：首字、排隊、重試與網路；由迴歸截距估算">
                  <span className="k">固定等待（估算）</span><span className="v">{durationText(totals.fixedOverhead)}</span>
                </div>
              </div>
              <details className="stats-more">
                <summary>更多效能指標</summary>
                <div className="stat-cards slim">
                  <div className="stat-card" title="Claude Code session log 的使用者訊息→首個 assistant 區塊時間差，僅為估算">
                    <span className="k">首字延遲（估算）</span><span className="v">{totals.ttft == null ? "—" : `${fmt(totals.ttft)}ms`}</span>
                  </div>
                  <div className="stat-card" title="超過 60 秒的請求，通常是逾時、重試或排隊；速度統計會保留這些樣本">
                    <span className="k">慢請求（&gt;60 秒）</span><span className="v">{fmt(totals.slowRecords)}</span>
                  </div>
                  <div className="stat-card" title={`有計時請求 ${fmt(totals.timedRecords)} 筆；思考 tokens 只有 Pi／DSH 會分開回報`}>
                    <span className="k">思考 tokens</span><span className="v">{fmt(totals.reasoning)}</span>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <div className="stats-empty-panel">
              <span className="stats-empty-icon">⌕</span>
              <div>
                <strong>{totalFiles === 0 ? "找不到 session log" : "找到 log，但沒有可解析的 token 用量"}</strong>
                <p>
                  {totalFiles === 0
                    ? "下面列出實際檢查的資料夾。請確認對應 CLI 曾在這台電腦使用，且 log 沒有被搬到其他位置。"
                    : `找到 ${totalFiles} 個檔案，其中實際讀取 ${report.files} 個；可能是這個時間範圍沒有用量，或 log 格式尚未包含 usage。`}
                </p>
              </div>
            </div>
          )}

          {health ? (
            <>
            <h3 className="stats-sub">供應商連線測試</h3>
            <div className="stat-cards slim">
              <div className="stat-card"><span className="k">連線測試次數</span><span className="v">{fmt(health.tests)}</span></div>
              <div className="stat-card"><span className="k">測試成功率</span><span className="v">{health.tests ? Math.round((health.ok / health.tests) * 100) : 0}%</span></div>
              <div className="stat-card"><span className="k">平均延遲</span><span className="v">{health.avg_ms}ms</span></div>
              <div className="stat-card"><span className="k">已測供應商</span><span className="v">{health.providers_tested}</span></div>
            </div>
            </>
          ) : null}

          {hasUsage ? (
            <>
              <h3 className="stats-sub">每日用量（近 {report.days_scanned} 天）</h3>
              {chartDays.length === 0 ? (
                <div className="empty small">這個範圍內沒有用量記錄</div>
              ) : (
                <div className="day-chart" role="img" aria-label="每日 token 用量">
                  {chartDays.map((day) => (
                    <div key={day.day} className="day-col" title={`${day.day} · ${fmt(day.total)} tokens`}>
                      <i style={{ height: `${Math.max(4, Math.round((day.total / maxDay) * 100))}%` }} />
                      <span>{day.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="stats-sub">依模型</h3>
              {filteredRows.length === 0 ? (
                <div className="empty small">沒有符合篩選條件的模型</div>
              ) : (
                <div className="table-wrap">
                  <table className="grid">
                    <thead>
                      <tr>
                        <th>來源</th>
                        <th>模型</th>
                        <th>輸入</th>
                        <th>輸出</th>
                        <th className="col-cache">快取</th>
                        <th className="col-records">筆數</th>
                        <th className="col-avg" title="有計時資料的請求平均花費時間">平均</th>
                        <th title="duration 對輸出 tokens 迴歸估算的解碼速度；已扣掉固定等待，滑過儲存格可看 P50">解碼速度</th>
                        <th className="col-ttft" title="首字延遲估算（目前只有 Claude Code 時間戳可推算）">首字</th>
                        <th>估算成本</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={`${row.source}-${row.model}`}>
                          <td><span className="badge subtle">{sourceLabel(row.source)}</span></td>
                          <td className="mono">{row.model}</td>
                          <td className="mono">{fmt(row.input)}</td>
                          <td className="mono">
                            {fmt(row.output)}
                            {row.reasoning ? <small className="stat-subvalue">+{fmt(row.reasoning)} 思考</small> : null}
                          </td>
                          <td className="mono col-cache">{fmt(row.cache_read + row.cache_write)}</td>
                          <td className="mono col-records">{fmt(row.records)}</td>
                          <td className="mono col-avg">{durationText(row.avg_duration_ms)}</td>
                          <td className="mono" title={`P50 有效吞吐 ${speedText(row.median_output_per_sec)}；總量 ${speedText(row.output_per_sec)}；慢請求 ${row.slow_records} 筆`}>
                            {speedText(row.decode_output_per_sec)}
                          </td>
                          <td className="mono col-ttft">{row.ttft_ms == null ? "—" : `${fmt(row.ttft_ms)}ms`}</td>
                          <td className="mono">{money(row.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <h3 className="stats-sub">最近請求</h3>
              {filteredRequests.length === 0 ? (
                <div className="empty small">這個範圍內沒有符合條件的請求記錄</div>
              ) : (
                <>
                <div className="table-wrap">
                  <table className="grid request-grid">
                    <thead>
                      <tr>
                        <th>時間</th>
                        <th>來源</th>
                        <th>模型</th>
                        <th>狀態</th>
                        <th>耗時</th>
                        <th>輸入</th>
                        <th>輸出</th>
                        <th>快取</th>
                        <th>成本</th>
                        <th>ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.slice(0, requestLimit).map((item, index) => (
                        <tr key={`${item.ts}-${item.id}-${index}`}>
                          <td className="mono">{timeText(item.ts)}</td>
                          <td><span className="badge subtle">{sourceLabel(item.source)}</span></td>
                          <td className="mono">{item.model}</td>
                          <td><span className={`badge ${item.status === "completed" || item.status === "200" ? "ok" : item.status === "failed" || item.status === "error" ? "err" : "subtle"}`}>{item.status}</span></td>
                          <td className="mono">{item.duration_ms ? durationText(item.duration_ms) : "—"}</td>
                          <td className="mono">{fmt(item.input)}</td>
                          <td className="mono">{fmt(item.output)}{item.reasoning ? <small className="stat-subvalue">+{fmt(item.reasoning)}</small> : null}</td>
                          <td className="mono">{fmt(item.cache)}</td>
                          <td className="mono">{money(item.cost)}</td>
                          <td className="mono muted" title={item.id}>{item.id ? item.id.slice(0, 8) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredRequests.length > requestLimit ? (
                  <button type="button" className="ghost small" onClick={() => setRequestLimit((value) => value + 20)}>
                    載入更多（尚餘 {filteredRequests.length - requestLimit}）
                  </button>
                ) : null}
                </>
              )}

              <p className="fineprint">成本為公開單價估算（每百萬 token），非帳單金額；未列入價目表的模型顯示「未定價」。Pi／DSH 的思考 tokens 會另計並納入成本。表格的「解碼速度」是把每筆請求時間對輸出 tokens 做迴歸、扣掉固定等待後的估算；例如 Pi 的 deepseek-v4.1-flash 約 174 tok/s、固定等待約 13.2 秒。上方「有效吞吐」才是包含等待的總量÷總時間。Codex 目前沒有可用的時間戳。</p>
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
                  <div><strong>{sourceLabel(root.source)}</strong><span className={`badge ${root.exists ? "ok" : "warn"}`}>{root.exists ? "已找到" : "路徑不存在"}</span></div>
                  <code>{root.path}</code>
                  <span>{root.files} 個檔案 · 實際讀取 {root.scanned_files} 個</span>
                </div>
              ))}
            </div>
            <p className="fineprint">
              目前可讀取這五種工具的本機用量。Gemini CLI、OpenCode、Qwen Code、Kilo Code、Crush、Qoder、Grok Build 等工具的 session 檔沒有穩定的 token 欄位，因此不會被估算；等實際格式可解析時會自動納入。
            </p>
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

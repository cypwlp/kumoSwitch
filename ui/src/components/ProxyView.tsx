import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorText } from "../api";
import type { Provider, ProxyConfig, ProxyMetrics, ProxyTargetPolicy, RoutingStrategy, ToolView } from "../types";

interface Props {
  onError: (m: string) => void;
  onToast: (m: string, kind?: "ok" | "err") => void;
}

const DEFAULT_POLICY: ProxyTargetPolicy = {
  weight: 100,
  priority: 0,
  timeout_secs: 30,
  failure_cooldown_secs: 60,
  backoff_429_secs: 30,
  failure_threshold: 3,
  max_concurrency: 16,
  allowed_models: [],
  model_map: {},
};

const EMPTY_CONFIG: ProxyConfig = { enabled: false, port: 17890, stack: [], strategy: "ordered", policies: {} };

const STRATEGIES: { id: RoutingStrategy; label: string; note: string }[] = [
  { id: "ordered", label: "固定順序", note: "照勾選順序逐一嘗試" },
  { id: "priority", label: "優先級", note: "priority 高的先使用" },
  { id: "weighted", label: "加權分配", note: "依 weight 平衡請求" },
  { id: "health", label: "健康優先", note: "成功率高、延遲低者優先" },
];

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function timeAgo(ms: number): string {
  if (!ms) return "—";
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))} 秒前`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} 分鐘前`;
  return new Date(ms).toLocaleString();
}

export function ProxyView({ onError, onToast }: Props) {
  const [config, setConfig] = useState<ProxyConfig>(EMPTY_CONFIG);
  const [metrics, setMetrics] = useState<ProxyMetrics | null>(null);
  const [tools, setTools] = useState<ToolView[]>([]);
  const [providers, setProviders] = useState<Record<string, Provider[]>>({});
  const [attachTool, setAttachTool] = useState("");
  const [busy, setBusy] = useState(false);
  const onErrorRef = useRef(onError);
  const onToastRef = useRef(onToast);
  onErrorRef.current = onError;
  onToastRef.current = onToast;

  const refreshMetrics = useCallback(async () => {
    try {
      setMetrics(await api.proxyMetrics());
    } catch {
      /* metrics are optional while the proxy is stopped */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cfg, ts] = await Promise.all([api.proxyStatus(), api.toolList()]);
        if (!alive) return;
        setConfig(cfg);
        setTools(ts);
        const entries = await Promise.all(ts.map(async (tool) => [tool.id, await api.providerList(tool.id)] as const));
        if (alive) setProviders(Object.fromEntries(entries));
        await refreshMetrics();
      } catch (err) {
        onErrorRef.current(errorText(err));
      }
    })();
    const timer = window.setInterval(() => void refreshMetrics(), 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [refreshMetrics]);

  const all = useMemo(() => {
    const rows: { ref: string; label: string }[] = [];
    for (const tool of tools) {
      for (const provider of providers[tool.id] ?? []) {
        rows.push({ ref: `${tool.id}:${provider.id}`, label: `${tool.name} · ${provider.name}` });
      }
    }
    const chosen = config.stack.map((ref) => rows.find((row) => row.ref === ref)).filter(Boolean) as { ref: string; label: string }[];
    const rest = rows.filter((row) => !config.stack.includes(row.ref));
    return [...chosen, ...rest];
  }, [tools, providers, config.stack]);

  const labels = useMemo(() => new Map(all.map((row) => [row.ref, row.label])), [all]);

  const setPolicy = (ref: string, patch: Partial<ProxyTargetPolicy>) => {
    setConfig((current) => ({
      ...current,
      policies: {
        ...current.policies,
        [ref]: { ...(current.policies[ref] ?? DEFAULT_POLICY), ...patch },
      },
    }));
  };

  const toggle = (ref: string) => {
    setConfig((current) => {
      if (current.stack.includes(ref)) return { ...current, stack: current.stack.filter((item) => item !== ref) };
      return {
        ...current,
        stack: [...current.stack, ref],
        policies: { ...current.policies, [ref]: current.policies[ref] ?? DEFAULT_POLICY },
      };
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.proxySave(config);
      setConfig(saved);
      await refreshMetrics();
      onToastRef.current(saved.enabled ? `代理已啟動於 127.0.0.1:${saved.port}` : "代理已關閉", "ok");
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    if (!attachTool) return;
    setBusy(true);
    try {
      const result = await api.proxyAttach(attachTool);
      onToastRef.current(result.message, "ok");
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const resetMetrics = async () => {
    try {
      await api.proxyResetMetrics();
      await refreshMetrics();
      onToastRef.current("代理指標已清空", "ok");
    } catch (err) {
      onError(errorText(err));
    }
  };

  const logRows = metrics?.logs.slice().reverse().slice(0, 30) ?? [];

  return (
    <section className="stats proxy-view">
      <header className="stats-head">
        <h2>代理／故障轉移</h2>
        <span className="muted small">連線池、智慧路由、冷卻與即時觀測</span>
      </header>

      <div className="proxy-row proxy-main-controls">
        <label className="onboard-item on" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={config.enabled} onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))} />
          <span className="onboard-name">啟用代理</span>
        </label>
        <div className="field" style={{ margin: 0, width: 120 }}>
          <label htmlFor="proxy-port">連接埠</label>
          <input id="proxy-port" type="number" value={config.port} onChange={(event) => setConfig((current) => ({ ...current, port: Number(event.target.value) || 17890 }))} />
        </div>
        <div className="spacer" />
        <button className="ghost" onClick={() => void resetMetrics()} disabled={busy}>清空指標</button>
        <button className="ghost" onClick={() => void refreshMetrics()} disabled={busy}>重新整理指標</button>
        <button className="primary" onClick={() => void save()} disabled={busy}>{busy ? <span className="spin" /> : null} 儲存並套用</button>
      </div>

      <h3 className="stats-sub">路由策略</h3>
      <div className="strategy-grid" role="radiogroup" aria-label="路由策略">
        {STRATEGIES.map((strategy) => (
          <button key={strategy.id} type="button" role="radio" aria-checked={config.strategy === strategy.id} className={`strategy-card${config.strategy === strategy.id ? " on" : ""}`} onClick={() => setConfig((current) => ({ ...current, strategy: strategy.id }))}>
            <strong>{strategy.label}</strong>
            <span>{strategy.note}</span>
          </button>
        ))}
      </div>

      <h3 className="stats-sub">供應商順序與個別策略</h3>
      <div className="proxy-stack">
        {all.length === 0 ? <div className="empty small">還沒有供應商，先到各 Harness 新增或導入</div> : all.map((row) => {
          const index = config.stack.indexOf(row.ref);
          const policy = config.policies[row.ref] ?? DEFAULT_POLICY;
          const metric = metrics?.targets[row.ref];
          return (
            <div key={row.ref} className={`proxy-target-card${index >= 0 ? " on" : ""}`}>
              <label className="proxy-target-main">
                <input type="checkbox" checked={index >= 0} onChange={() => toggle(row.ref)} />
                {index >= 0 ? <span className="badge ok">#{index + 1}</span> : <span className="badge subtle">未加入</span>}
                <span className="onboard-name">{row.label}</span>
                {metric ? <span className="proxy-inline-metrics">{percent(metric.success_rate)} · {metric.avg_ttfb_ms}ms{metric.circuit_open_until > Date.now() ? <span className="badge warn">冷卻中</span> : null}</span> : null}
              </label>
              {index >= 0 ? (
                <details className="proxy-policy">
                  <summary>策略設定</summary>
                  <div className="proxy-policy-grid">
                    <div className="field"><label>權重</label><input aria-label={`${row.label} 權重`} type="number" min={1} value={policy.weight} onChange={(event) => setPolicy(row.ref, { weight: Math.max(1, Number(event.target.value) || 1) })} /></div>
                    <div className="field"><label>優先級</label><input aria-label={`${row.label} 優先級`} type="number" value={policy.priority} onChange={(event) => setPolicy(row.ref, { priority: Number(event.target.value) || 0 })} /></div>
                    <div className="field"><label>Timeout（秒）</label><input aria-label={`${row.label} Timeout`} type="number" min={1} value={policy.timeout_secs} onChange={(event) => setPolicy(row.ref, { timeout_secs: Math.max(1, Number(event.target.value) || 1) })} /></div>
                    <div className="field"><label>最大併發</label><input aria-label={`${row.label} 最大併發`} type="number" min={1} value={policy.max_concurrency} onChange={(event) => setPolicy(row.ref, { max_concurrency: Math.max(1, Number(event.target.value) || 1) })} /></div>
                    <div className="field"><label>失敗門檻</label><input aria-label={`${row.label} 失敗門檻`} type="number" min={1} value={policy.failure_threshold} onChange={(event) => setPolicy(row.ref, { failure_threshold: Math.max(1, Number(event.target.value) || 1) })} /></div>
                    <div className="field"><label>熔斷冷卻（秒）</label><input aria-label={`${row.label} 熔斷冷卻`} type="number" min={1} value={policy.failure_cooldown_secs} onChange={(event) => setPolicy(row.ref, { failure_cooldown_secs: Math.max(1, Number(event.target.value) || 1) })} /></div>
                    <div className="field"><label>429 退避（秒）</label><input aria-label={`${row.label} 429 退避`} type="number" min={1} value={policy.backoff_429_secs} onChange={(event) => setPolicy(row.ref, { backoff_429_secs: Math.max(1, Number(event.target.value) || 1) })} /></div>
                    <div className="field policy-wide">
                      <label>允許模型（逗號分隔，留空表示全部）</label>
                      <input
                        aria-label={`${row.label} 允許模型`}
                        value={policy.allowed_models.join(", ")}
                        placeholder="glm-5.3-flash, deepseek-v4.1"
                        onChange={(event) => setPolicy(row.ref, { allowed_models: event.target.value.split(",").map((model) => model.trim()).filter(Boolean) })}
                      />
                    </div>
                    <div className="field policy-wide">
                      <label>模型映射（每行來源=目標）</label>
                      <textarea
                        aria-label={`${row.label} 模型映射`}
                        rows={2}
                        value={Object.entries(policy.model_map).map(([from, to]) => `${from}=${to}`).join("\n")}
                        placeholder={"gpt-5=provider-gpt-5\nclaude-sonnet=anthropic/claude-sonnet"}
                        onChange={(event) => {
                          const entries = event.target.value.split("\n").map((line) => line.split("=", 2).map((part) => part.trim())).filter(([from, to]) => from && to);
                          setPolicy(row.ref, { model_map: Object.fromEntries(entries) });
                        }}
                      />
                    </div>
                  </div>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>

      <h3 className="stats-sub">把 Harness 掛載到代理</h3>
      <div className="proxy-row">
        <select className="mini-select" value={attachTool} onChange={(event) => setAttachTool(event.target.value)}>
          <option value="">選擇 Harness…</option>
          {tools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
        </select>
        <button className="ghost" onClick={() => void attach()} disabled={busy || !attachTool}>寫入代理設定</button>
        <span className="muted small">會把該 Harness 的 base URL 指向 127.0.0.1:{config.port}/v1</span>
      </div>

      <div className="proxy-observability">
        <div className="detail-section-head"><div><h3>即時觀測</h3><p>TTFB、成功率、熔斷狀態與最近失敗原因；不記錄 prompt 或 API Key。</p></div><span className="badge subtle">{metrics?.strategy ?? config.strategy}</span></div>
        <div className="proxy-metric-grid">
          {Object.entries(metrics?.targets ?? {}).length ? Object.entries(metrics?.targets ?? {}).map(([ref, metric]) => (
            <article className="proxy-metric-card" key={ref}>
              <div className="proxy-metric-head"><strong>{labels.get(ref) ?? ref}</strong>{metric.circuit_open_until > Date.now() ? <span className="badge warn">冷卻中</span> : <span className="badge ok">可用</span>}</div>
              <div className="proxy-metric-values"><span><b>{percent(metric.success_rate)}</b> 成功率</span><span><b>{metric.avg_ttfb_ms}ms</b> 平均 TTFB</span><span><b>{metric.failovers}</b> 換手</span><span><b>{metric.active}</b> 進行中</span></div>
              <div className="muted small">最近狀態 {metric.last_status || "—"} · {timeAgo(metric.last_used)}</div>
            </article>
          )) : <div className="empty small">尚無代理請求。</div>}
        </div>
        <div className="proxy-log">
          {logRows.length ? logRows.map((log, index) => (
            <div className={`proxy-log-row ${log.event}`} key={`${log.ts}-${index}`}>
              <span className="mono">{new Date(log.ts).toLocaleTimeString()}</span><span className="proxy-log-target">{labels.get(log.target) ?? log.target}</span><span className="badge subtle">{log.event}</span><span>{log.status ?? "—"}</span><span>{log.ttfb_ms != null ? `${log.ttfb_ms}ms` : "—"}</span><span className="proxy-log-message">{log.message}</span>
            </div>
          )) : <div className="empty small">尚無代理紀錄。</div>}
        </div>
      </div>

      <p className="fineprint">連線錯誤、429、5xx 會依策略切到下一家。429 與連續失敗會進入冷卻；熔斷中的供應商預設跳過。回應仍以 chunked relay 即時串流。</p>
    </section>
  );
}

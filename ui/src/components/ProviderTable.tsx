import type { HistoryMap, HistorySummary, Provider, TestResult } from "../types";

export type TestState = TestResult | "pending";

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
  rows: Provider[];
  total: number;
  tests: Record<string, TestState>;
  onApply: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onTest: (provider: Provider) => void;
  history: HistoryMap;
  activeId: string | null;
}

export function ProviderTable({
  rows,
  total,
  tests,
  onApply,
  onEdit,
  onDelete,
  onTest,
  history,
  activeId,
}: TableProps) {
  return (
    <div className="provider-list">
      {rows.map((provider) => {
        const active = activeId === provider.id;
        const test = tests[provider.id];
        return (
          <article
            key={provider.id}
            className={`provider-card${active ? " active" : ""}`}
            aria-label={`供應商 ${provider.name}`}
          >
            <button
              type="button"
              className="provider-card-main"
              onClick={() => onEdit(provider)}
              aria-label={`查看供應商 ${provider.name} 的模型與設定`}
            >
              <div className="provider-card-head">
                <div className="provider-identity">
                  <h3>{provider.name}</h3>
                  <span className="provider-alias">{provider.note || provider.config_id}</span>
                </div>
                <div className="provider-card-badges">
                  {active ? <span className="badge ok">使用中</span> : <span className="badge subtle">待用</span>}
                  {test ? testBadge(test) : null}
                </div>
              </div>

              <dl className="provider-facts">
                <div className="provider-fact model-fact">
                  <dt>預設模型</dt>
                  <dd>{provider.model || "未指定，沿用 Harness 目前模型"}</dd>
                </div>
                <div className="provider-fact url-fact">
                  <dt>Base URL</dt>
                  <dd className="mono" title={provider.base_url}>
                    {provider.base_url}
                  </dd>
                </div>
                <div className="provider-fact health-fact">
                  <dt>健康度</dt>
                  <dd>
                    <HealthCell summary={history[provider.id]} />
                  </dd>
                </div>
              </dl>

              <span className="provider-open-hint">
                查看模型與連線設定 <span aria-hidden="true">→</span>
              </span>
            </button>

            <div className="provider-card-actions" aria-label={`${provider.name} 的操作`}>
              <button
                type="button"
                className="small ghost"
                onClick={() => onTest(provider)}
                disabled={test === "pending"}
                title="送一個最小請求測試這組 Base URL / API Key"
              >
                測試
              </button>
              <button
                type="button"
                className="small primary"
                onClick={() => onApply(provider)}
                title="先看 diff 再套用"
              >
                {active ? "重新套用" : "套用"}
              </button>
              <button type="button" className="small ghost" onClick={() => onEdit(provider)}>
                編輯
              </button>
              <button type="button" className="small danger" onClick={() => onDelete(provider)}>
                刪除
              </button>
            </div>
          </article>
        );
      })}
      {rows.length === 0 ? (
        <div className="empty provider-empty">
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
  const max = Math.max(...bars.map((sample) => sample.ms), 1);
  const percent = Math.round(summary.success_rate * 100);
  const tone = percent >= 95 ? "ok" : percent >= 70 ? "warn" : "bad";
  const when = new Date(summary.last_ts).toLocaleString();
  return (
    <div className={`health ${tone}`} title={`最近 ${summary.total} 筆 · 平均 ${summary.avg_ms}ms · ${when}`}>
      <span className="spark">
        {bars.map((sample, index) => (
          <i
            key={index}
            className={sample.ok ? "ok" : "bad"}
            style={{ height: `${sample.ok ? Math.max(20, Math.round((sample.ms / max) * 100)) : 100}%` }}
          />
        ))}
      </span>
      <span className="health-text">
        {percent}% · {summary.avg_ms}ms
      </span>
    </div>
  );
}

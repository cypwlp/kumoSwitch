import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "../api";
import type { DriftReport, Provider } from "../types";

interface Props {
  onError: (message: string) => void;
  onOpenDiff: (tool: string, provider: Provider) => void;
  onImport: () => void;
}

const STATUS: Record<DriftReport["status"], { label: string; tone: string; icon: string }> = {
  clean: { label: "一致", tone: "ok", icon: "✓" },
  drifted: { label: "已漂移", tone: "warn", icon: "!" },
  unmanaged: { label: "未納管", tone: "bad", icon: "?" },
  empty: { label: "未設定", tone: "subtle", icon: "–" },
};

export function DriftView({ onError, onOpenDiff, onImport }: Props) {
  const [reports, setReports] = useState<DriftReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await api.driftOverview());
    } catch (error) {
      onError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const openExpected = async (report: DriftReport) => {
    if (!report.active_id) {
      onError("這個 Harness 沒有可重新套用的 kumoSwitch 供應商");
      return;
    }
    try {
      const providers = await api.providerList(report.tool);
      const provider = providers.find((item) => item.id === report.active_id);
      if (!provider) {
        onError("kumoSwitch 清單中已找不到這個供應商");
        return;
      }
      onOpenDiff(report.tool, provider);
    } catch (error) {
      onError(errorText(error));
    }
  };

  const counts = {
    clean: reports.filter((report) => report.status === "clean").length,
    drifted: reports.filter((report) => report.status === "drifted").length,
    unmanaged: reports.filter((report) => report.status === "unmanaged").length,
  };

  const countValue = (value: number) => (loading && reports.length === 0 ? "—" : value);

  return (
    <section className="drift-view" aria-busy={loading}>
      <header className="drift-head">
        <div>
          <span className="eyebrow">Configuration integrity</span>
          <h2>設定漂移中心</h2>
          <p>比對真實設定檔與 kumoSwitch 清單，及早發現外部修改、未知供應商與模型變更。</p>
        </div>
        <div className="detail-section-actions">
          <button className="ghost" onClick={onImport}>匯入未納管供應商</button>
          <button className="primary" onClick={() => void load()} disabled={loading}>
            {loading ? <span className="spin" /> : null} 重新檢查
          </button>
        </div>
      </header>

      <div className="drift-summary" aria-live="polite">
        <div className="ok"><span>一致</span><strong>{countValue(counts.clean)}</strong></div>
        <div className="warn"><span>已漂移</span><strong>{countValue(counts.drifted)}</strong></div>
        <div className="bad"><span>未納管</span><strong>{countValue(counts.unmanaged)}</strong></div>
        <div><span>Harness 總數</span><strong>{countValue(reports.length)}</strong></div>
      </div>

      {loading && reports.length === 0 ? (
        <div className="drift-skeleton" role="status" aria-label="正在檢查所有 Harness">
          <span className="sr-only">正在檢查所有 Harness…</span>
          {[0, 1, 2, 3].map((index) => (
            <div className="drift-skeleton-card" key={index} aria-hidden="true">
              <div className="drift-skeleton-head"><i /><span /></div>
              <div className="drift-skeleton-line wide" />
              <div className="drift-skeleton-compare"><i /><i /></div>
              <div className="drift-skeleton-line short" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="drift-empty empty">
          <strong>沒有可檢查的 Harness</strong>
          <span>確認至少一個 Harness 已安裝並有可讀取的設定檔，然後重新檢查。</span>
        </div>
      ) : (
        <div className="drift-grid">
          {reports.map((report) => {
            const meta = STATUS[report.status];
            return (
              <article className={`drift-card ${report.status}`} key={report.tool}>
                <div className="drift-card-head">
                  <div>
                    <span className={`drift-icon ${meta.tone}`}>{meta.icon}</span>
                    <h3>{report.tool_name}</h3>
                  </div>
                  <span className={`badge ${meta.tone}`}>{meta.label}</span>
                </div>
                <p className="drift-message">{report.message}</p>

                <dl className="drift-compare">
                  <div>
                    <dt>實際設定</dt>
                    <dd>
                      <strong>{report.current_model || "未指定模型"}</strong>
                      <code>{report.current_base_url || "沒有 Base URL"}</code>
                      <span>金鑰 {report.current_key_tail || "—"}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>kumoSwitch 預期</dt>
                    <dd>
                      <strong>{report.expected_name || "沒有對應供應商"}</strong>
                      <code>{report.expected_model || "—"} · {report.expected_base_url || "—"}</code>
                      <span>金鑰 {report.expected_key_tail || "—"}</span>
                    </dd>
                  </div>
                </dl>

                {report.changed_fields.length ? (
                  <div className="drift-fields">
                    <span>差異欄位</span>
                    {report.changed_fields.map((field) => <span className={`badge ${meta.tone}`} key={field}>{field}</span>)}
                  </div>
                ) : null}

                {report.unmanaged_providers.length ? (
                  <div className="drift-unmanaged">
                    <span>未納管 ID</span>
                    {report.unmanaged_providers.map((id) => <code key={id}>{id}</code>)}
                  </div>
                ) : null}

                <div className="drift-actions">
                  {report.active_id ? (
                    <button className="primary small" onClick={() => void openExpected(report)}>
                      查看 diff／重新套用
                    </button>
                  ) : null}
                  {report.unmanaged_providers.length ? (
                    <button className="ghost small" onClick={onImport}>匯入至 kumoSwitch</button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

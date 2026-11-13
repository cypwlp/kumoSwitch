import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorText } from "../api";
import type { DriftReport, Provider } from "../types";
import { ConfirmModal } from "./ConfirmModal";

interface Props {
  onError: (message: string) => void;
  onToast: (message: string, kind?: "ok" | "err") => void;
  onOpenDiff: (tool: string, provider: Provider) => void;
  onImport: () => void;
}

type DriftFilter = "all" | "attention" | DriftReport["status"];
type BatchAction = "apply" | "import";

const STATUS: Record<DriftReport["status"], { label: string; tone: string; icon: string }> = {
  clean: { label: "一致", tone: "ok", icon: "✓" },
  drifted: { label: "已漂移", tone: "warn", icon: "!" },
  unmanaged: { label: "未納管", tone: "bad", icon: "?" },
  empty: { label: "未設定", tone: "subtle", icon: "–" },
};

const STATUS_ORDER: Record<DriftReport["status"], number> = {
  drifted: 0,
  unmanaged: 1,
  empty: 2,
  clean: 3,
};

const FILTERS: { id: DriftFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "attention", label: "待處理" },
  { id: "drifted", label: "已漂移" },
  { id: "unmanaged", label: "未納管" },
  { id: "clean", label: "一致" },
  { id: "empty", label: "未設定" },
];

function canApply(report: DriftReport): boolean {
  return report.status === "drifted" && Boolean(report.active_id);
}

function canImport(report: DriftReport): boolean {
  return report.unmanaged_providers.length > 0;
}

function actionable(report: DriftReport): boolean {
  return canApply(report) || canImport(report);
}

export function DriftView({ onError, onToast, onOpenDiff, onImport }: Props) {
  const [reports, setReports] = useState<DriftReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DriftFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<BatchAction | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await api.driftOverview());
      setSelected(new Set());
    } catch (error) {
      onErrorRef.current(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);

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

  const counts = useMemo(() => ({
    clean: reports.filter((report) => report.status === "clean").length,
    drifted: reports.filter((report) => report.status === "drifted").length,
    unmanaged: reports.filter((report) => report.status === "unmanaged").length,
    empty: reports.filter((report) => report.status === "empty").length,
  }), [reports]);

  const countValue = (value: number) => (loading && reports.length === 0 ? "—" : value);
  const sortedReports = useMemo(() => [...reports].sort((left, right) =>
    STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
      || left.tool_name.localeCompare(right.tool_name)
  ), [reports]);
  const visibleReports = useMemo(() => sortedReports.filter((report) => {
    if (filter === "all") return true;
    if (filter === "attention") return actionable(report);
    return report.status === filter;
  }), [filter, sortedReports]);
  const selectedReports = useMemo(() => reports.filter((report) => selected.has(report.tool)), [reports, selected]);
  const actionableReports = useMemo(() => reports.filter(actionable), [reports]);
  const allActionableSelected = actionableReports.length > 0 && actionableReports.every((report) => selected.has(report.tool));
  const applySelection = selectedReports.filter(canApply);
  const importSelection = selectedReports.filter(canImport);

  const toggleSelected = (tool: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allActionableSelected ? new Set() : new Set(actionableReports.map((report) => report.tool)));
  };

  const performBatch = async () => {
    if (!pendingAction) return;
    setBatchBusy(true);
    const action = pendingAction;
    try {
      if (action === "apply") {
        let applied = 0;
        const failures: string[] = [];
        for (const report of applySelection) {
          if (!report.active_id) continue;
          try {
            await api.applyProvider(report.tool, report.active_id);
            applied += 1;
          } catch (error) {
            failures.push(`${report.tool_name}: ${errorText(error)}`);
          }
        }
        onToast(
          `批次重新套用 ${applied} 個 Harness${failures.length ? `，${failures.length} 個失敗` : ""}`,
          failures.length ? "err" : "ok",
        );
        if (failures.length) onError(failures.join("\n"));
      } else {
        let imported = 0;
        let skipped = 0;
        const failures: string[] = [];
        const tools = Array.from(new Set(importSelection.map((report) => report.tool)));
        for (const tool of tools) {
          try {
            const result = await api.importFromConfig(tool);
            imported += result.imported.length;
            skipped += result.skipped;
          } catch (error) {
            failures.push(`${tool}: ${errorText(error)}`);
          }
        }
        onToast(
          `批次匯入 ${imported} 個供應商${skipped ? `，略過 ${skipped} 個重複項目` : ""}${failures.length ? `，${failures.length} 個 Harness 失敗` : ""}`,
          failures.length ? "err" : "ok",
        );
        if (failures.length) onError(failures.join("\n"));
      }
      setPendingAction(null);
      await load();
    } finally {
      setBatchBusy(false);
    }
  };

  const summaryCards: { id: DriftFilter; label: string; value: number; tone: string }[] = [
    { id: "clean", label: "一致", value: counts.clean, tone: "ok" },
    { id: "drifted", label: "已漂移", value: counts.drifted, tone: "warn" },
    { id: "unmanaged", label: "未納管", value: counts.unmanaged, tone: "bad" },
    { id: "all", label: "Harness 總數", value: reports.length, tone: "" },
  ];

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
        {summaryCards.map((card) => (
          <button
            type="button"
            className={`drift-summary-card ${card.tone}${filter === card.id ? " on" : ""}`}
            key={card.id}
            aria-pressed={filter === card.id}
            onClick={() => setFilter(card.id)}
          >
            <span>{card.label}</span>
            <strong>{countValue(card.value)}</strong>
          </button>
        ))}
      </div>

      <div className="drift-toolbar">
        <div className="drift-filters" role="group" aria-label="漂移狀態篩選">
          {FILTERS.map((item) => (
            <button
              type="button"
              className={filter === item.id ? "on" : ""}
              aria-pressed={filter === item.id}
              key={item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className="muted small">{visibleReports.length} / {reports.length} 個 Harness</span>
        <button type="button" className="ghost small" onClick={toggleSelectAll} disabled={!actionableReports.length || batchBusy}>
          {allActionableSelected ? "取消全選" : `選取待處理 ${actionableReports.length}`}
        </button>
        <button type="button" className="ghost small" onClick={() => setPendingAction("import")} disabled={!importSelection.length || batchBusy}>
          批次匯入 {importSelection.length || ""}
        </button>
        <button type="button" className="primary small" onClick={() => setPendingAction("apply")} disabled={!applySelection.length || batchBusy}>
          批次重新套用 {applySelection.length || ""}
        </button>
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
      ) : visibleReports.length === 0 ? (
        <div className="drift-empty empty">
          <strong>這個篩選條件沒有結果</strong>
          <span>切換到「全部」或「待處理」查看其他 Harness。</span>
        </div>
      ) : (
        <div className="drift-grid">
          {visibleReports.map((report) => {
            const meta = STATUS[report.status];
            const reportActionable = actionable(report);
            return (
              <article className={`drift-card ${report.status}`} key={report.tool}>
                <div className="drift-card-head">
                  <div>
                    {reportActionable ? (
                      <label className="drift-select" title="選取這個 Harness 進行批次操作">
                        <input
                          type="checkbox"
                          checked={selected.has(report.tool)}
                          aria-label={`選取 ${report.tool_name}`}
                          onChange={() => toggleSelected(report.tool)}
                        />
                      </label>
                    ) : <span className="drift-select-spacer" />}
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
                  {canApply(report) ? (
                    <button className="primary small" onClick={() => void openExpected(report)}>
                      查看 diff／重新套用
                    </button>
                  ) : null}
                  {canImport(report) ? (
                    <button className="ghost small" onClick={onImport}>匯入至 kumoSwitch</button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pendingAction ? (
        <ConfirmModal
          title={pendingAction === "apply" ? "批次重新套用設定？" : "批次匯入未納管供應商？"}
          message={pendingAction === "apply"
            ? `將重新套用 ${applySelection.length} 個已漂移 Harness 的 kumoSwitch 預期設定。\n\n每個 Harness 套用前仍會建立備份，但批次操作不會逐一顯示 diff。`
            : `將掃描 ${new Set(importSelection.map((report) => report.tool)).size} 個 Harness，匯入其中尚未納管的供應商。\n\n既有項目會略過，不會刪除或覆蓋。`}
          confirmLabel={pendingAction === "apply" ? "開始重新套用" : "開始匯入"}
          danger={pendingAction === "apply"}
          busy={batchBusy}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void performBatch()}
        />
      ) : null}
    </section>
  );
}
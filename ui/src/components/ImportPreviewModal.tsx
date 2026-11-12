import { useMemo, useState } from "react";
import type { ImportAction, ImportCandidate, ImportDecision } from "../types";
import { Modal } from "./Modal";

interface ImportPreviewProps {
  candidates: ImportCandidate[];
  busy: boolean;
  onCancel: () => void;
  onApply: (decisions: ImportDecision[]) => Promise<void>;
}

const KEY = (candidate: ImportCandidate) => `${candidate.tool}:${candidate.config_id}`;

export function ImportPreviewModal({ candidates, busy, onCancel, onApply }: ImportPreviewProps) {
  const [actions, setActions] = useState<Record<string, ImportAction>>(() =>
    Object.fromEntries(candidates.map((candidate) => [KEY(candidate), candidate.conflict ? "skip" : "import"])),
  );
  const [bulkAction, setBulkAction] = useState<ImportAction>("skip");

  const groups = useMemo(() => {
    const map = new Map<string, ImportCandidate[]>();
    for (const candidate of candidates) {
      const list = map.get(candidate.tool_name) ?? [];
      list.push(candidate);
      map.set(candidate.tool_name, list);
    }
    return Array.from(map.entries());
  }, [candidates]);

  const selected = candidates.filter((candidate) => (actions[KEY(candidate)] ?? "skip") !== "skip");
  const conflicts = candidates.filter((candidate) => candidate.conflict).length;

  const setBulk = (action: ImportAction) => {
    setBulkAction(action);
    setActions((previous) => {
      const next = { ...previous };
      for (const candidate of candidates) {
        if (candidate.conflict) next[KEY(candidate)] = action;
      }
      return next;
    });
  };

  return (
    <Modal
      title={`掃描到 ${candidates.length} 個供應商`}
      onClose={onCancel}
      footer={
        <>
          <span className="muted small">{selected.length} 個將匯入 · {conflicts} 個衝突</span>
          <span className="spacer" />
          <button className="ghost" onClick={onCancel} disabled={busy}>取消</button>
          <button
            className="primary"
            disabled={busy || selected.length === 0}
            onClick={() => void onApply(candidates.map((candidate) => ({
              tool: candidate.tool,
              config_id: candidate.config_id,
              action: actions[KEY(candidate)] ?? "skip",
            })))}
          >
            {busy ? <span className="spin" /> : null} 匯入 {selected.length} 個
          </button>
        </>
      }
    >
      <div className="note import-intro">
        已掃描所有 Harness 的設定檔。新增項目會直接匯入；衝突項目預設保留本機，你可以逐項選擇覆蓋、合併模型或建立副本。
      </div>
      <div className="import-bulk">
        <span>衝突處理</span>
        <select value={bulkAction} onChange={(event) => setBulk(event.target.value as ImportAction)} aria-label="衝突處理方式">
          <option value="skip">全部保留本機</option>
          <option value="merge">全部合併模型</option>
          <option value="overwrite">全部用設定檔覆蓋</option>
          <option value="copy">全部建立副本</option>
        </select>
      </div>

      <div className="import-groups">
        {groups.map(([toolName, list]) => (
          <section className="import-group" key={toolName}>
            <div className="import-group-head">
              <h4>{toolName}</h4>
              <span className="badge subtle">{list.length} 個供應商</span>
            </div>
            {list.map((candidate) => {
              const action = actions[KEY(candidate)] ?? "skip";
              return (
                <article className={`import-row${candidate.conflict ? " conflict" : " new"}`} key={KEY(candidate)}>
                  <div className="import-row-main">
                    <div className="import-row-title">
                      <strong>{candidate.name}</strong>
                      <span className={`badge ${candidate.conflict ? "warn" : "ok"}`}>
                        {candidate.conflict ? "已存在" : "新增"}
                      </span>
                    </div>
                    <div className="import-row-meta">
                      <code>{candidate.config_id}</code>
                      <span>{candidate.model || "未指定模型"}</span>
                      <span>{candidate.models.length} 個模型</span>
                    </div>
                    {candidate.differences.length ? (
                      <div className="import-differences">
                        差異：{candidate.differences.map((field) => <span className="badge subtle" key={field}>{field}</span>)}
                      </div>
                    ) : null}
                  </div>
                  <select
                    aria-label={`${candidate.name} 匯入方式`}
                    value={action}
                    onChange={(event) => setActions((previous) => ({ ...previous, [KEY(candidate)]: event.target.value as ImportAction }))}
                  >
                    <option value="skip">保留本機</option>
                    <option value="import">{candidate.conflict ? "匯入為新項目" : "匯入"}</option>
                    {candidate.conflict ? <option value="merge">合併模型</option> : null}
                    {candidate.conflict ? <option value="overwrite">以設定檔覆蓋</option> : null}
                    {candidate.conflict ? <option value="copy">建立副本</option> : null}
                  </select>
                </article>
              );
            })}
          </section>
        ))}
      </div>
      {candidates.length === 0 ? <div className="empty">沒有找到可匯入的供應商。</div> : null}
    </Modal>
  );
}

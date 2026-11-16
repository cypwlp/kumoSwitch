import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorText } from "../api";
import type { BackupCenter, BackupInfo, BackupPolicy, ToolView } from "../types";
import { Modal } from "./Modal";

interface Props {
  onError: (message: string) => void;
  onToast: (message: string, kind?: "ok" | "err") => void;
  onChanged: () => void;
  onExport: () => void;
  onImport: () => void;
}

function bytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function reasonLabel(reason: string): string {
  if (reason === "manual") return "手動快照";
  if (reason === "scheduled") return "排程快照";
  if (reason === "pre-update") return "更新前快照";
  if (reason === "before-restore") return "還原前安全快照";
  if (reason === "provider-apply") return "套用供應商前";
  return reason || "寫入前";
}

export function BackupCenterView({ onError, onToast, onChanged, onExport, onImport }: Props) {
  const [center, setCenter] = useState<BackupCenter | null>(null);
  const [tools, setTools] = useState<ToolView[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [snapshotTool, setSnapshotTool] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupInfo | null>(null);

  const refresh = useCallback(async () => {
    const [next, nextTools] = await Promise.all([api.backupCenter(), api.toolList()]);
    setCenter(next);
    setTools(nextTools.filter((tool) => tool.detected));
    setSnapshotTool((current) => current || nextTools.find((tool) => tool.detected)?.id || "");
  }, []);

  useEffect(() => {
    refresh().catch((error) => onError(errorText(error)));
  }, [onError, refresh]);

  const backups = useMemo(() => {
    if (!center) return [];
    return filter === "all" ? center.backups : center.backups.filter((backup) => backup.tool === filter);
  }, [center, filter]);

  const savePolicy = async (patch: Partial<BackupPolicy>) => {
    if (!center) return;
    setBusy(true);
    try {
      const policy = await api.backupSetPolicy({ ...center.policy, ...patch });
      setCenter({ ...center, policy });
      onToast("備份保留與排程設定已更新", "ok");
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const createSnapshot = async () => {
    if (!snapshotTool) return;
    setBusy(true);
    try {
      const created = await api.backupCreate(snapshotTool);
      await refresh();
      onChanged();
      onToast(`已建立 ${created.created} 的設定快照`, "ok");
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      const files = await api.backupRestore(restoreTarget.tool, restoreTarget.id);
      setRestoreTarget(null);
      await refresh();
      onChanged();
      onToast(`已還原 ${files.length} 個設定檔，並先建立安全快照`, "ok");
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.backupDelete(deleteTarget.tool, deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
      onToast("備份已刪除", "ok");
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="backup-center" aria-busy={busy}>
      <header className="backup-center-head">
        <div>
          <span className="kicker">Recovery & migration</span>
          <h2>備份／遷移中心</h2>
          <p>集中查看所有 Harness 的時間點快照、排程與版本資訊。還原前會先保存目前設定；跨電腦遷移仍使用加密的完整清單。</p>
        </div>
        <div className="backup-center-actions">
          <button className="ghost" onClick={onImport}>匯入遷移包</button>
          <button className="primary" onClick={onExport}>建立加密遷移包</button>
        </div>
      </header>

      <div className="backup-stats">
        <div><span>快照</span><strong>{center?.stats.snapshots ?? 0}</strong><small>{center?.stats.tools ?? 0} 個 Harness</small></div>
        <div><span>涵蓋檔案</span><strong>{center?.stats.files ?? 0}</strong><small>原始路徑與 checksum 均已保存</small></div>
        <div><span>本機容量</span><strong>{bytes(center?.stats.size_bytes ?? 0)}</strong><small>只保留設定的相關檔案</small></div>
        <div><span>最新／最舊</span><strong className="stat-time">{center?.stats.newest || "—"}</strong><small>{center?.stats.oldest ? `最早 ${center.stats.oldest}` : "尚無快照"}</small></div>
      </div>

      <div className="backup-policy-card">
        <div>
          <span className="eyebrow">Snapshot policy</span>
          <h3>排程與保留</h3>
          <p>排程只在應用程式常駐時執行；每個 Harness 分別保留，避免大型日誌或 session 檔佔用空間。</p>
        </div>
        <button
          className={`settings-toggle compact${center?.policy.scheduled ? " on" : ""}`}
          aria-pressed={center?.policy.scheduled ?? false}
          onClick={() => void savePolicy({ scheduled: !(center?.policy.scheduled ?? false) })}
          disabled={busy || !center}
        >
          <span><strong>啟用排程快照</strong><small>只備份設定檔，不備份對話紀錄</small></span><i aria-hidden="true" />
        </button>
        <label className="field inline-field">
          <span>間隔（小時）</span>
          <input
            type="number"
            min={1}
            max={720}
            value={center?.policy.interval_hours ?? 24}
            onChange={(event) => center && setCenter({ ...center, policy: { ...center.policy, interval_hours: Number(event.target.value) || 1 } })}
            onBlur={() => void savePolicy({ interval_hours: center?.policy.interval_hours ?? 24 })}
          />
        </label>
        <label className="field inline-field">
          <span>每個 Harness 保留</span>
          <input
            type="number"
            min={5}
            max={200}
            value={center?.policy.keep ?? 30}
            onChange={(event) => center && setCenter({ ...center, policy: { ...center.policy, keep: Number(event.target.value) || 30 } })}
            onBlur={() => void savePolicy({ keep: center?.policy.keep ?? 30 })}
          />
        </label>
      </div>

      <div className="backup-toolbar">
        <div className="backup-snapshot-create">
          <select value={snapshotTool} onChange={(event) => setSnapshotTool(event.target.value)} aria-label="要建立快照的 Harness">
            <option value="">選擇 Harness…</option>
            {tools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
          </select>
          <button className="primary small" disabled={busy || !snapshotTool} onClick={() => void createSnapshot()}>立即建立快照</button>
        </div>
        <div className="backup-filters" role="group" aria-label="備份篩選">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>全部</button>
          {Array.from(new Set(center?.backups.map((backup) => backup.tool) ?? [])).map((tool) => (
            <button key={tool} className={filter === tool ? "on" : ""} onClick={() => setFilter(tool)}>
              {center?.backups.find((backup) => backup.tool === tool)?.tool_name ?? tool}
            </button>
          ))}
        </div>
      </div>

      <div className="backup-timeline">
        {backups.length ? backups.map((backup, index) => (
          <article className="backup-entry" key={`${backup.tool}-${backup.id}`}>
            <div className="backup-node" aria-hidden="true"><span>{index + 1}</span></div>
            <div className="backup-entry-main">
              <div className="backup-entry-head">
                <div>
                  <span className="backup-version">v{backup.version}</span>
                  <strong>{backup.tool_name}</strong>
                  <span className={`badge ${backup.reason === "pre-update" || backup.reason === "before-restore" ? "warn" : "subtle"}`}>{reasonLabel(backup.reason)}</span>
                </div>
                <time>{backup.created}</time>
              </div>
              <div className="backup-entry-meta">
                <span>{backup.files.length} 個檔案</span>
                <span>{bytes(backup.size_bytes)}</span>
                <code>{backup.checksum ? backup.checksum.slice(0, 16) : `snapshot-${backup.id}`}</code>
              </div>
              <ul className="backup-files">
                {backup.files.slice(0, 4).map((file) => <li key={file}><code>{file}</code></li>)}
                {backup.files.length > 4 ? <li>+{backup.files.length - 4} 個檔案</li> : null}
              </ul>
            </div>
            <div className="backup-entry-actions">
              <button className="ghost small" onClick={() => setRestoreTarget(backup)}>還原</button>
              <button className="danger small" onClick={() => setDeleteTarget(backup)}>刪除</button>
            </div>
          </article>
        )) : (
          <div className="empty backup-empty">
            <strong>尚無符合條件的快照</strong>
            <span>套用供應商時會自動建立；也可以手動建立目前設定快照。</span>
          </div>
        )}
      </div>

      {restoreTarget ? (
        <Modal
          title="還原這份設定快照？"
          onClose={() => setRestoreTarget(null)}
          footer={
            <>
              <button className="ghost" onClick={() => setRestoreTarget(null)}>取消</button>
              <button className="primary" onClick={() => void restore()} disabled={busy}>{busy ? "還原中…" : "確認還原"}</button>
            </>
          }
        >
          <p>將以 <strong>{restoreTarget.created}</strong>（v{restoreTarget.version}）覆蓋 {restoreTarget.files.length} 個檔案。</p>
          <div className="note">還原前會先為目前內容建立一份「還原前安全快照」，因此可以再次退回。</div>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <Modal
          title="刪除這份快照？"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button className="ghost" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="danger" onClick={() => void remove()} disabled={busy}>確認刪除</button>
            </>
          }
        >
          <p>{deleteTarget.tool_name} · {deleteTarget.created}。刪除後無法從 kumoSwitch 還原。</p>
        </Modal>
      ) : null}
    </section>
  );
}

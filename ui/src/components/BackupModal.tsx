import type { BackupInfo, ToolView } from "../types";
import { Modal } from "./Modal";

interface BackupProps {
  tool: ToolView;
  backups: BackupInfo[];
  busy: boolean;
  onClose: () => void;
  onRestore: (backup: BackupInfo) => void;
}

export function BackupModal({ tool, backups, busy, onClose, onRestore }: BackupProps) {
  return (
    <Modal narrow title={`備份紀錄 · ${tool.name}`} onClose={onClose}>
      {backups.length === 0 ? (
        <div className="empty">這個工具還沒有備份</div>
      ) : (
        backups.map((b) => (
          <div className="backup-item" key={b.id}>
            <span className="when">{b.created}</span>
            <span className="files" title={b.files.join("\n")}>
              {b.files.join(" · ")}
            </span>
            <button className="small ghost" disabled={busy} onClick={() => onRestore(b)}>
              還原
            </button>
          </div>
        ))
      )}
    </Modal>
  );
}
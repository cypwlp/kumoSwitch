import { useState } from "react";
import type { ExportResult } from "../types";
import { Modal } from "./Modal";

interface ExportProps {
  result: ExportResult;
  onClose: () => void;
  onReveal: () => void;
}

export function ExportModal({ result, onClose, onReveal }: ExportProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.path);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      narrow
      title="匯出完成"
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onReveal} title="開啟目前工具的設定資料夾">
            開啟工具資料夾
          </button>
          <button className="ghost" onClick={copy}>
            {copied ? "已複製" : "複製路徑"}
          </button>
          <button className="primary" onClick={onClose} data-autofocus>
            完成
          </button>
        </>
      }
    >
      <div className="note" style={{ marginBottom: 12 }}>
        已匯出 {result.count} 個供應商（含 API Key）。檔案是明文 JSON，請自行保管。
      </div>
      <div className="note path">{result.path}</div>
    </Modal>
  );
}
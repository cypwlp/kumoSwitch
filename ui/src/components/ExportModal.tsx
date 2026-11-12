import { useState } from "react";
import type { ExportResult } from "../types";
import { Modal } from "./Modal";

interface ExportProps {
  result: ExportResult;
  variant: "encrypted" | "diagnostics";
  onClose: () => void;
  onReveal: () => void;
}

export function ExportModal({ result, variant, onClose, onReveal }: ExportProps) {
  const [copied, setCopied] = useState(false);
  const title = variant === "encrypted" ? "加密備份完成" : "診斷匯出完成";
  const description =
    variant === "encrypted"
      ? `已加密匯出 ${result.count} 個供應商。請妥善保管密碼；沒有密碼無法還原。`
      : `已匯出 ${result.count} 個供應商摘要。診斷檔不含完整 API Key。`;

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
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onReveal} title="在檔案總管中顯示這個檔案">
            開啟所在資料夾
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
      <div className="note" style={{ marginBottom: 12 }}>{description}</div>
      <div className="note path">{result.path}</div>
      {result.sha256 ? (
        <div className="export-checksum">
          <span>SHA-256</span>
          <code>{result.sha256}</code>
        </div>
      ) : null}
    </Modal>
  );
}
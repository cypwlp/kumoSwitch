import { useState } from "react";
import { errorText } from "../api";
import { Modal } from "./Modal";

interface EncryptedBackupProps {
  mode: "export" | "import";
  fileName?: string;
  onCancel: () => void;
  onSubmit: (password: string) => Promise<void>;
}

export function EncryptedBackupModal({ mode, fileName, onCancel, onSubmit }: EncryptedBackupProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isExport = mode === "export";

  const submit = async () => {
    setError("");
    if ([...password].length < 8) {
      setError("密碼至少需要 8 個字元");
      return;
    }
    if (isExport && password !== confirmation) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      narrow
      title={isExport ? "加密匯出供應商" : "匯入加密備份"}
      onClose={onCancel}
      footer={
        <>
          <button className="ghost" onClick={onCancel} disabled={submitting}>
            取消
          </button>
          <button className="primary" onClick={() => void submit()} disabled={submitting}>
            {submitting ? <span className="spin" /> : null}
            {isExport ? "建立加密備份" : "解密並匯入"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {fileName ? <div className="note path">{fileName}</div> : null}
        <div className="note" style={{ marginBottom: 12 }}>
          {isExport
            ? "備份會使用 Argon2id 派生金鑰並以 AES-256-GCM 加密。密碼不會儲存，遺失後無法找回。"
            : "輸入建立這份備份時設定的密碼。若密碼錯誤，檔案不會被修改。"}
        </div>
        <div className="field">
          <label htmlFor="backup-password">備份密碼</label>
          <input
            id="backup-password"
            data-autofocus
            type="password"
            autoComplete={isExport ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 個字元"
          />
        </div>
        {isExport ? (
          <div className="field">
            <label htmlFor="backup-password-confirm">再次輸入密碼</label>
            <input
              id="backup-password-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
        ) : null}
        {error ? <div className="note error">{error}</div> : null}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
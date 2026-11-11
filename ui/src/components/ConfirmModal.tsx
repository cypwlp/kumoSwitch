import { Modal } from "./Modal";

interface ConfirmProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onCancel,
  onConfirm,
}: ConfirmProps) {
  return (
    <Modal
      narrow
      top
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="ghost" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
            data-autofocus
          >
            {busy ? <span className="spin" /> : null} {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.85, fontSize: "13px", whiteSpace: "pre-line" }}>
        {message}
      </p>
    </Modal>
  );
}
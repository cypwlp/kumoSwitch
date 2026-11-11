import { useRef, type ReactNode } from "react";
import { useFocusLayer } from "../focus";

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  narrow?: boolean;
  top?: boolean;
}

export function Modal({ title, onClose, children, footer, narrow, top }: ModalProps) {
  const sheet = useRef<HTMLDivElement>(null);
  useFocusLayer(sheet, onClose);

  return (
    <div
      className={`modal${top ? " top" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`sheet${narrow ? " narrow" : ""}`}
        ref={sheet}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="ghost small" onClick={onClose} aria-label="關閉" title="關閉 (Esc)">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
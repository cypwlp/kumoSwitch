import { useCallback, useRef, useState } from "react";

export type ToastKind = "" | "ok" | "err";

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  leaving: boolean;
  action?: ToastAction;
}

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 220);
  }, []);

  const push = useCallback((message: string, kind: ToastKind = "", action?: ToastAction) => {
    seq.current += 1;
    const id = seq.current;
    setItems((prev) => [...prev.slice(-2), { id, message, kind, leaving: false, action }]);
    const life = action ? 9000 : kind === "err" ? 5200 : 3000;
    window.setTimeout(() => dismiss(id), life);
  }, [dismiss]);

  return { items, push, dismiss };
}

export function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} data-toast-id={t.id} className={`toast ${t.kind}${t.leaving ? " leaving" : ""}`}>
          <span>{t.message}</span>
          {t.action ? (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                void t.action?.run();
                onDismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

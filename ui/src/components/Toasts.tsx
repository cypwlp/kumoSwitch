import { useCallback, useRef, useState } from "react";

export type ToastKind = "" | "ok" | "err";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  leaving: boolean;
}

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = "") => {
    seq.current += 1;
    const id = seq.current;
    setItems((prev) => [...prev.slice(-2), { id, message, kind, leaving: false }]);
    const life = kind === "err" ? 5200 : 3000;
    window.setTimeout(() => {
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 220);
    }, life);
  }, []);

  return { items, push };
}

export function Toasts({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}${t.leaving ? " leaving" : ""}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
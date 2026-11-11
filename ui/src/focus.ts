import { useEffect, useRef, type RefObject } from "react";

/**
 * A minimal layer stack so nested dialogs (e.g. a confirm on top of the backup
 * list) do not fight over Escape / Tab, and so global shortcuts can stand down
 * while any dialog is open.
 */
const stack: symbol[] = [];

export function hasLayer(): boolean {
  return stack.length > 0;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useFocusLayer(
  ref: RefObject<HTMLElement>,
  onClose: () => void,
): void {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const token = Symbol("layer");
    stack.push(token);
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;

    const items = (): HTMLElement[] =>
      Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.getClientRects().length > 0,
      );

    const first = root?.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0];
    (first ?? root)?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (list.length === 0) {
        event.preventDefault();
        root?.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const index = active ? list.indexOf(active) : -1;
      const atEdge = event.shiftKey
        ? index <= 0
        : index === list.length - 1 || index === -1;
      if (atEdge) {
        event.preventDefault();
        const target = event.shiftKey ? list[list.length - 1] : list[0];
        target.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const at = stack.indexOf(token);
      if (at >= 0) stack.splice(at, 1);
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
}
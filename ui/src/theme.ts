import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";
export type Resolved = "dark" | "light";

const KEY = "kumoswitch.theme";
const LEGACY_KEYS = ["switchtower.theme", "switchyard.theme"];
const QUERY = "(prefers-color-scheme: dark)";

export function readStoredTheme(): ThemeMode {
  try {
    let raw = window.localStorage.getItem(KEY);
    if (raw === null) {
      for (const legacyKey of LEGACY_KEYS) {
        const legacy = window.localStorage.getItem(legacyKey);
        if (legacy === "dark" || legacy === "light" || legacy === "system") {
          window.localStorage.setItem(KEY, legacy);
          raw = legacy;
          break;
        }
      }
    }
    if (raw === "dark" || raw === "light" || raw === "system") return raw;
  } catch {
    /* private mode / disabled storage */
  }
  return "system";
}

export function systemTheme(): Resolved {
  return window.matchMedia(QUERY).matches ? "dark" : "light";
}

export function resolveTheme(mode: ThemeMode): Resolved {
  return mode === "system" ? systemTheme() : mode;
}

export function paintTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolveTheme(mode);
  document.documentElement.style.colorScheme = resolveTheme(mode);
}

/** Paint before React mounts so the first frame already has the right palette. */
export function initTheme(): void {
  const hash = window.location.hash.replace(/^#/, "").split(",");
  paintTheme(hash.includes("light") ? "light" : readStoredTheme());
}

export function useTheme(): { mode: ThemeMode; resolved: Resolved; setMode: (m: ThemeMode) => void } {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const hash = window.location.hash.replace(/^#/, "").split(",");
    return hash.includes("light") ? "light" : readStoredTheme();
  });
  const [resolved, setResolved] = useState<Resolved>(() => resolveTheme(mode));

  useEffect(() => {
    paintTheme(mode);
    setResolved(resolveTheme(mode));
    if (mode !== "system") return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => {
      paintTheme("system");
      setResolved(systemTheme());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return { mode, resolved, setMode };
}
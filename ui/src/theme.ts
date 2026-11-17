import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";
export type Resolved = "dark" | "light";
export type Accent = "ocean" | "aurora" | "sunset" | "forest" | "rose" | "amber";

const KEY = "kumoswitch.theme";
const ACCENT_KEY = "kumoswitch.accent";
const LEGACY_KEYS = ["switchtower.theme", "switchyard.theme"];
const QUERY = "(prefers-color-scheme: dark)";

export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "ocean", label: "海洋", color: "#38bdf8" },
  { id: "aurora", label: "極光", color: "#a78bfa" },
  { id: "sunset", label: "日落", color: "#fb923c" },
  { id: "forest", label: "森林", color: "#34d399" },
  { id: "rose", label: "玫瑰", color: "#fb7185" },
  { id: "amber", label: "琥珀", color: "#fbbf24" },
];

const DEFAULT_ACCENT: Accent = "ocean";

function isAccent(value: string | null): value is Accent {
  return ACCENTS.some((accent) => accent.id === value);
}

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

export function readStoredAccent(): Accent {
  try {
    const raw = window.localStorage.getItem(ACCENT_KEY);
    if (isAccent(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCENT;
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

export function paintAccent(accent: Accent): void {
  document.documentElement.dataset.accent = accent;
}

function hashAccent(): Accent | null {
  const token = window.location.hash
    .replace(/^#/, "")
    .split(",")
    .find((item) => item.startsWith("accent="));
  const value = token?.slice("accent=".length) ?? null;
  return isAccent(value) ? value : null;
}

/** Paint before React mounts so the first frame already has the right palette. */
export function initTheme(): void {
  const hash = window.location.hash.replace(/^#/, "").split(",");
  paintTheme(hash.includes("light") ? "light" : readStoredTheme());
  paintAccent(hashAccent() ?? readStoredAccent());
}

export function useTheme(): {
  mode: ThemeMode;
  resolved: Resolved;
  accent: Accent;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: Accent) => void;
} {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const hash = window.location.hash.replace(/^#/, "").split(",");
    return hash.includes("light") ? "light" : readStoredTheme();
  });
  const [resolved, setResolved] = useState<Resolved>(() => resolveTheme(mode));
  const [accent, setAccentState] = useState<Accent>(() => hashAccent() ?? readStoredAccent());

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

  useEffect(() => {
    paintAccent(accent);
  }, [accent]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setAccent = useCallback((next: Accent) => {
    setAccentState(next);
    try {
      window.localStorage.setItem(ACCENT_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return { mode, resolved, accent, setMode, setAccent };
}

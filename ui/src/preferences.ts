import { useCallback, useEffect, useState } from "react";

export type TextScale = "normal" | "large" | "xlarge";
export type Density = "comfortable" | "compact";

export interface UiPreferences {
  highContrast: boolean;
  textScale: TextScale;
  density: Density;
  reduceMotion: boolean;
}

const KEY = "kumoswitch.accessibility";

const DEFAULT: UiPreferences = {
  highContrast: false,
  textScale: "normal",
  density: "comfortable",
  reduceMotion: false,
};

function read(): UiPreferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      highContrast: Boolean(parsed.highContrast),
      textScale: parsed.textScale === "large" || parsed.textScale === "xlarge" ? parsed.textScale : "normal",
      density: parsed.density === "compact" ? "compact" : "comfortable",
      reduceMotion: Boolean(parsed.reduceMotion),
    };
  } catch {
    return DEFAULT;
  }
}

export function paintPreferences(preferences: UiPreferences) {
  const root = document.documentElement;
  root.dataset.contrast = preferences.highContrast ? "high" : "normal";
  root.dataset.textScale = preferences.textScale;
  root.dataset.density = preferences.density;
  root.dataset.motion = preferences.reduceMotion ? "reduced" : "full";
}

export function useUiPreferences() {
  const [preferences, setPreferences] = useState<UiPreferences>(() => read());

  useEffect(() => {
    paintPreferences(preferences);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(preferences));
    } catch {
      /* storage may be disabled */
    }
  }, [preferences]);

  const update = useCallback((patch: Partial<UiPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  return { preferences, update };
}

import { useEffect, useState } from "react";
import { applyLang, readLang, saveLang, type Lang } from "../i18n";

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: "zh", label: "中文" },
  { lang: "en", label: "EN" },
];

/** Language switch; translation is applied to the rendered DOM by i18n.ts. */
export function LangToggle() {
  const [lang, setLang] = useState<Lang>(() => readLang());

  useEffect(() => {
    applyLang(lang);
  }, [lang]);

  return (
    <div className="segmented compact" role="group" aria-label="Language">
      {OPTIONS.map((option) => (
        <button
          key={option.lang}
          className={lang === option.lang ? "on" : ""}
          aria-pressed={lang === option.lang}
          onClick={() => {
            setLang(option.lang);
            saveLang(option.lang);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

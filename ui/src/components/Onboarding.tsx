import { useState } from "react";
import type { ToolView } from "../types";
import { IconArrowRight, IconCheck } from "./Icons";

interface Props {
  tools: ToolView[];
  busy: boolean;
  onImport: (toolIds: string[]) => Promise<void>;
  onSkip: () => void;
}

/** First-run: the app is useless empty, so offer to pull in what already exists. */
export function Onboarding({ tools, busy, onImport, onSkip }: Props) {
  const candidates = tools.filter((t) => t.importable > 0);
  const [picked, setPicked] = useState<string[]>(candidates.map((t) => t.id));

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (candidates.length === 0) {
    return (
      <div className="onboard">
        <div className="onboard-card">
          <h2>歡迎使用 kumoSwitch</h2>
          <p className="muted">
            沒偵測到任何既有的供應商設定。你可以先新增一個供應商，
            kumoSwitch 會把它寫進對應工具的設定檔。
          </p>
          <div className="onboard-actions">
            <button className="primary" onClick={onSkip}>
              開始新增供應商 <IconArrowRight />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboard">
      <div className="onboard-card">
        <span className="pill">第一次啟動</span>
        <h2>把你現有的供應商收進來</h2>
        <p className="muted">
          以下工具已經有供應商設定。勾選後按一次匯入，kumoSwitch 會讀取設定檔建立清單，
          <strong>不會改動你的設定檔</strong>。
        </p>
        <div className="onboard-list">
          {candidates.map((tool) => (
            <label key={tool.id} className={`onboard-item${picked.includes(tool.id) ? " on" : ""}`}>
              <input
                type="checkbox"
                checked={picked.includes(tool.id)}
                onChange={() => toggle(tool.id)}
              />
              <span className="onboard-name">{tool.name}</span>
              <span className="muted small mono">{tool.path}</span>
              <span className="badge subtle">{tool.importable} 個供應商</span>
              {picked.includes(tool.id) ? <IconCheck className="onboard-tick" /> : null}
            </label>
          ))}
        </div>
        <div className="onboard-actions">
          <button className="ghost" onClick={onSkip}>
            略過，稍後再說
          </button>
          <button
            className="primary"
            disabled={busy || picked.length === 0}
            onClick={() => void onImport(picked)}
          >
            {busy ? "匯入中…" : `匯入 ${picked.length} 個工具的供應商`}
          </button>
        </div>
      </div>
    </div>
  );
}

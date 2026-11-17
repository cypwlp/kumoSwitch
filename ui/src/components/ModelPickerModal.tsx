import { useMemo, useState } from "react";
import type { ModelProfile } from "../types";
import { Modal } from "./Modal";

interface Props {
  providerName: string;
  models: ModelProfile[];
  loading: boolean;
  error: string;
  onPick: (model: ModelProfile) => void;
  onManual: () => void;
  onClose: () => void;
}

const compact = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value);

export function ModelPickerModal({ providerName, models, loading, error, onPick, onManual, onClose }: Props) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((model) => [
      model.id,
      model.name,
      model.context_window,
      model.max_output,
      ...(model.reasoning_levels ?? []),
    ].join(" ").toLowerCase().includes(q));
  }, [models, query]);

  return (
    <Modal
      title={`新增模型 · ${providerName}`}
      onClose={onClose}
      top
      footer={
        <>
          <button className="ghost" onClick={onClose}>取消</button>
          <span className="spacer" />
          <button className="ghost" onClick={onManual}>手動輸入</button>
        </>
      }
    >
      <div className="model-picker">
        <div className="model-search">
          <span aria-hidden="true">⌕</span>
          <input
            autoFocus
            type="search"
            aria-label="搜尋供應商模型"
            placeholder="搜尋 Model ID、名稱或能力…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? <button type="button" className="ghost small" onClick={() => setQuery("")}>清除</button> : null}
        </div>
        <div className="model-picker-meta">
          {loading ? <><span className="spin" /> 正在讀取供應商模型目錄…</> : error ? <span className="note error">{error}</span> : <>供應商目錄共 {models.length} 個模型 · 顯示 {visible.length} 個</>}
        </div>
        <div className="model-picker-list">
          {visible.map((model) => (
            <button type="button" className="model-picker-item" key={model.id} onClick={() => onPick(model)}>
              <span className="model-picker-title">
                <strong>{model.name || model.id}</strong>
                <code>{model.id}</code>
              </span>
              <span className="model-picker-badges">
                {model.context_window ? <span className="badge subtle">{compact(model.context_window)} ctx</span> : null}
                {model.max_output ? <span className="badge subtle">{compact(model.max_output)} out</span> : null}
                {model.reasoning_levels?.length ? <span className="badge subtle">{model.reasoning_levels.length} 思考等級</span> : null}
                {model.tools ? <span className="badge ok">Tools</span> : null}
                {model.vision ? <span className="badge ok">Vision</span> : null}
              </span>
            </button>
          ))}
          {!loading && !error && visible.length === 0 ? (
            <div className="empty small">{models.length === 0 ? "沒有可新增的模型；可能都已加入，或供應商沒有回報。" : "沒有符合搜尋條件的模型。"}</div>
          ) : null}
        </div>
        <p className="fineprint">選取後會一併填入 context window、max output 與思考等級；供應商未公開的欄位會保留空白。</p>
      </div>
    </Modal>
  );
}

import { useMemo, useState } from "react";
import type { ModelDiscovery, ModelProfile } from "../types";
import { Modal } from "./Modal";

interface Props {
  providerName: string;
  discovery: ModelDiscovery;
  currentModels: ModelProfile[];
  busy: boolean;
  onCancel: () => void;
  onApply: (models: ModelProfile[]) => void;
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function capabilityTags(model: ModelProfile): string[] {
  const tags: string[] = [];
  if (model.context_window) tags.push(`${compactNumber(model.context_window)} ctx`);
  if (model.max_output) tags.push(`${compactNumber(model.max_output)} out`);
  if (model.reasoning) tags.push("Reasoning");
  if (model.vision) tags.push("Vision");
  if (model.tools) tags.push("Tools");
  return tags;
}

export function ModelSyncModal({ providerName, discovery, currentModels, busy, onCancel, onApply }: Props) {
  const existing = useMemo(() => new Set(currentModels.map((model) => model.id)), [currentModels]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(
    discovery.models.filter((model) => !existing.has(model.id)).map((model) => model.id),
  ));

  const newCount = discovery.models.filter((model) => !existing.has(model.id)).length;
  const selectedModels = discovery.models.filter((model) => selected.has(model.id));

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal
      title={`同步模型 · ${providerName}`}
      onClose={onCancel}
      footer={
        <>
          <span className="muted small">
            找到 {discovery.models.length} 個模型 · {newCount} 個新增 · 已選 {selectedModels.length}
          </span>
          <span className="spacer" />
          <button className="ghost" onClick={onCancel} disabled={busy}>取消</button>
          <button
            className="primary"
            disabled={busy || selectedModels.length === 0}
            onClick={() => onApply(selectedModels)}
          >
            {busy ? <span className="spin" /> : null} 套用到模型清單
          </button>
        </>
      }
    >
      <div className="model-sync-summary">
        <div><span>探索結果</span><strong>{discovery.models.length}</strong></div>
        <div><span>新增模型</span><strong>{newCount}</strong></div>
        <div><span>已存在</span><strong>{discovery.models.length - newCount}</strong></div>
        <div><span>本次未回報</span><strong>{discovery.missing.length}</strong></div>
      </div>

      <div className="note model-sync-note">
        新模型預設勾選；既有模型預設保留，勾選後才會用端點回報的名稱與能力更新。
        <br />
        來源：<code>{discovery.endpoint}</code>
      </div>

      <div className="model-sync-tools">
        <button
          type="button"
          className="ghost small"
          onClick={() => setSelected(new Set(discovery.models.map((model) => model.id)))}
        >
          全選 {discovery.models.length}
        </button>
        <button
          type="button"
          className="ghost small"
          onClick={() => setSelected(new Set(discovery.models.filter((model) => !existing.has(model.id)).map((model) => model.id)))}
        >
          只選新增 {newCount}
        </button>
        <button type="button" className="ghost small" onClick={() => setSelected(new Set())}>
          全部取消
        </button>
      </div>

      <div className="model-sync-list">
        {discovery.models.map((model) => {
          const alreadyExists = existing.has(model.id);
          const checked = selected.has(model.id);
          const tags = capabilityTags(model);
          return (
            <label className={`model-sync-row${checked ? " on" : ""}${alreadyExists ? " existing" : ""}`} key={model.id}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(model.id)}
                aria-label={`同步模型 ${model.id}`}
              />
              <span className="model-sync-main">
                <span className="model-sync-title">
                  <strong>{model.name || model.id}</strong>
                  <code>{model.id}</code>
                  <span className={`badge ${alreadyExists ? "subtle" : "ok"}`}>
                    {alreadyExists ? "已存在" : "新增"}
                  </span>
                </span>
                <span className="model-sync-tags">
                  {tags.length ? tags.map((tag) => <span className="badge subtle" key={tag}>{tag}</span>) : <span className="muted small">端點未提供能力資訊</span>}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {discovery.missing.length ? (
        <div className="warn-box">
          <h4>本次未回報的既有模型（{discovery.missing.length}）</h4>
          <p>這些模型會原樣保留，不會因為這次同步被刪除：</p>
          <div className="model-sync-tags">
            {discovery.missing.map((id) => <span className="badge warn" key={id}>{id}</span>)}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

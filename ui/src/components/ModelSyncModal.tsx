import { useMemo, useState } from "react";
import type { ModelDiscovery, ModelProfile } from "../types";
import { Modal } from "./Modal";

type SyncField = "name" | "context_window" | "max_output" | "reasoning" | "vision" | "tools" | "metadata";

const FIELD_LABELS: Record<SyncField, string> = {
  name: "名稱",
  context_window: "Context",
  max_output: "Max Output",
  reasoning: "Reasoning",
  vision: "Vision",
  tools: "Tools",
  metadata: "Metadata",
};

interface Props {
  providerName: string;
  discovery: ModelDiscovery;
  currentModels: ModelProfile[];
  lastSyncedAt?: number;
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

function stable(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

function modelDiff(existing: ModelProfile, discovered: ModelProfile): SyncField[] {
  const fields: SyncField[] = [];
  if (existing.name !== discovered.name) fields.push("name");
  if (existing.context_window !== discovered.context_window) fields.push("context_window");
  if (existing.max_output !== discovered.max_output) fields.push("max_output");
  if (existing.reasoning !== discovered.reasoning) fields.push("reasoning");
  if (existing.vision !== discovered.vision) fields.push("vision");
  if (existing.tools !== discovered.tools) fields.push("tools");
  if (stable(existing.metadata) !== stable(discovered.metadata)) fields.push("metadata");
  return fields;
}

function fieldValues(field: SyncField, existing: ModelProfile, discovered: ModelProfile): [string, string] {
  const show = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "未提供";
    if (typeof value === "boolean") return value ? "支援" : "不支援";
    if (typeof value === "number") return compactNumber(value);
    return String(value);
  };
  return [show(existing[field] as unknown), show(discovered[field] as unknown)];
}

export function ModelSyncModal({ providerName, discovery, currentModels, lastSyncedAt, busy, onCancel, onApply }: Props) {
  const existing = useMemo(() => new Map(currentModels.map((model) => [model.id, model])), [currentModels]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(
    discovery.models.filter((model) => !existing.has(model.id)).map((model) => model.id),
  ));
  const [fieldSelections, setFieldSelections] = useState<Record<string, SyncField[]>>(() => {
    const initial: Record<string, SyncField[]> = {};
    for (const model of discovery.models) {
      const current = existing.get(model.id);
      if (current) initial[model.id] = modelDiff(current, model);
    }
    return initial;
  });

  const newCount = discovery.models.filter((model) => !existing.has(model.id)).length;
  const selectedModels = discovery.models.filter((model) => selected.has(model.id));
  const returnedExisting = discovery.models.filter((model) => existing.has(model.id)).length;

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleField = (modelId: string, field: SyncField) => {
    setFieldSelections((previous) => {
      const current = previous[modelId] ?? [];
      return {
        ...previous,
        [modelId]: current.includes(field)
          ? current.filter((item) => item !== field)
          : [...current, field],
      };
    });
  };

  const buildUpdates = (): ModelProfile[] => {
    const syncedAt = Date.now();
    return discovery.models.flatMap((discovered) => {
      const current = existing.get(discovered.id);
      if (!current) {
        return selected.has(discovered.id) ? [{ ...discovered, last_seen_at: syncedAt }] : [];
      }
      const update: ModelProfile = { ...current, last_seen_at: syncedAt };
      if (selected.has(discovered.id)) {
        for (const field of fieldSelections[discovered.id] ?? modelDiff(current, discovered)) {
          (update as unknown as Record<string, unknown>)[field] = discovered[field];
        }
      }
      return [update];
    });
  };

  const updates = buildUpdates();

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
            disabled={busy || updates.length === 0}
            onClick={() => onApply(updates)}
          >
            {busy ? <span className="spin" /> : null} 套用到模型清單
          </button>
        </>
      }
    >
      <div className="model-sync-summary">
        <div><span>探索結果</span><strong>{discovery.models.length}</strong></div>
        <div><span>新增模型</span><strong>{newCount}</strong></div>
        <div><span>已存在</span><strong>{returnedExisting}</strong></div>
        <div><span>本次未回報</span><strong>{discovery.missing.length}</strong></div>
      </div>

      <div className="note model-sync-note">
        新模型預設勾選；既有模型預設不覆蓋欄位。勾選既有模型後，可逐項決定要更新的欄位。
        <br />
        來源：<code>{discovery.endpoint}</code>
        {lastSyncedAt ? <span> 上次同步：{new Date(lastSyncedAt).toLocaleString()}</span> : null}
      </div>

      <div className="model-sync-tools">
        <button type="button" className="ghost small" onClick={() => setSelected(new Set(discovery.models.map((model) => model.id)))}>
          全選 {discovery.models.length}
        </button>
        <button type="button" className="ghost small" onClick={() => setSelected(new Set(discovery.models.filter((model) => !existing.has(model.id)).map((model) => model.id)))}>
          只選新增 {newCount}
        </button>
        <button type="button" className="ghost small" onClick={() => setSelected(new Set())}>全部取消</button>
      </div>

      <div className="model-sync-list">
        {discovery.models.map((model) => {
          const current = existing.get(model.id);
          const changedFields = current ? modelDiff(current, model) : [];
          const checked = selected.has(model.id);
          const tags = capabilityTags(model);
          return (
            <div className={`model-sync-row${checked ? " on" : ""}${current ? " existing" : ""}`} key={model.id}>
              <label className="model-sync-select">
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
                    <span className={`badge ${current ? "subtle" : "ok"}`}>{current ? "已存在" : "新增"}</span>
                    {current && changedFields.length ? <span className="badge warn">{changedFields.length} 欄位不同</span> : null}
                  </span>
                  <span className="model-sync-tags">
                    {tags.length ? tags.map((tag) => <span className="badge subtle" key={tag}>{tag}</span>) : <span className="muted small">端點未提供能力資訊</span>}
                  </span>
                </span>
              </label>
              {current && checked && changedFields.length ? (
                <div className="model-sync-field-diffs">
                  {changedFields.map((field) => {
                    const [before, after] = fieldValues(field, current, model);
                    const active = (fieldSelections[model.id] ?? changedFields).includes(field);
                    return (
                      <button
                        type="button"
                        className={`sync-field${active ? " on" : ""}`}
                        aria-pressed={active}
                        key={field}
                        onClick={() => toggleField(model.id, field)}
                        title="點擊切換是否更新這個欄位"
                      >
                        <span>{FIELD_LABELS[field]}</span>
                        <code>{before} → {after}</code>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {discovery.missing.length ? (
        <div className="warn-box">
          <h4>本次未回報的既有模型（{discovery.missing.length}）</h4>
          <p>這些模型會原樣保留，不會因為這次同步被刪除，並會標記為近期未回報：</p>
          <div className="model-sync-tags">
            {discovery.missing.map((id) => <span className="badge warn" key={id}>{id}</span>)}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

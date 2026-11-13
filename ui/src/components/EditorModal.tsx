import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../api";
import type {
  BackupInfo,
  HistorySummary,
  ModelProfile,
  Preset,
  Provider,
  ProviderConfigPreview,
  AuditEntry,
  ModelCheck,
  ModelDiscovery,
  ToolView,
  LiveTestPolicy,
} from "../types";
import { Modal } from "./Modal";
import { ConfirmModal } from "./ConfirmModal";
import { ModelSyncModal } from "./ModelSyncModal";

interface EditorProps {
  tool: ToolView;
  provider: Provider | null;
  history?: HistorySummary;
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: Provider, previewAfter: boolean) => Promise<void>;
  onSwitchModel: (modelId: string) => Promise<void>;
  onModelTested: (model: ModelProfile) => void;
  onClone?: () => void;
}

type Tab = "overview" | "models" | "connection" | "history" | "raw";

const EMPTY: Provider = {
  id: "",
  config_id: "",
  name: "",
  base_url: "",
  api_key: "",
  model: "",
  models: [],
  kind: "",
  note: "",
};

function normalized(provider: Provider | null): Provider {
  const value = { ...EMPTY, ...(provider ?? {}) };
  const models = (value.models ?? []).map((model) => ({ ...model, id: model.id ?? "", name: model.name ?? "" }));
  if (value.model && !models.some((model) => model.id === value.model)) {
    models.unshift({ id: value.model, name: value.model });
  }
  return {
    ...value,
    models,
    model: value.model || models[0]?.id || "",
    model_sync_interval_secs: value.model_sync_interval_secs ?? 86_400,
    model_sync_jitter_secs: value.model_sync_jitter_secs ?? 300,
    model_sync_next_at: value.model_sync_next_at ?? 0,
    model_sync_retry_at: value.model_sync_retry_at ?? 0,
    model_sync_failures: value.model_sync_failures ?? 0,
    model_sync_last_error: value.model_sync_last_error ?? "",
  };
}

function modelMetadataText(model: ModelProfile): string {
  if (model.metadata == null) return "{}";
  try {
    return JSON.stringify(model.metadata, null, 2);
  } catch {
    return "{}";
  }
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
}

function optionalBool(value: string): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function printableBool(value: boolean | undefined): string {
  return value === undefined ? "unknown" : String(value);
}

function modelSnapshot(model: ModelProfile) {
  return {
    id: model.id,
    name: model.name,
    context_window: model.context_window,
    max_output: model.max_output,
    reasoning: model.reasoning,
    vision: model.vision,
    tools: model.tools,
    metadata: model.metadata,
    last_seen_at: model.last_seen_at,
  };
}

function metadataValueAt(root: unknown, path: string): unknown {
  if (!root || typeof root !== "object") return undefined;
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, root);
}

function metadataNumber(root: unknown, paths: string[]): number | undefined {
  for (const path of paths) {
    const value = metadataValueAt(root, path);
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function estimateLiveTestCost(model: ModelProfile, maxOutputTokens: number): number | null {
  const perTokenInput = metadataNumber(model.metadata, ["pricing.prompt", "pricing.input", "input_cost_per_token"]);
  const perTokenOutput = metadataNumber(model.metadata, ["pricing.completion", "pricing.output", "output_cost_per_token"]);
  const perMillionInput = metadataNumber(model.metadata, ["input_cost_per_million", "pricing.input_per_million"]);
  const perMillionOutput = metadataNumber(model.metadata, ["output_cost_per_million", "pricing.output_per_million"]);
  const input = perTokenInput ?? (perMillionInput != null ? perMillionInput / 1_000_000 : undefined);
  const output = perTokenOutput ?? (perMillionOutput != null ? perMillionOutput / 1_000_000 : undefined);
  if (input == null && output == null) return null;
  return 8 * (input ?? 0) + Math.max(1, maxOutputTokens) * (output ?? 0);
}

function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.000001) return "< $0.000001";
  return `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}

function snapshot(provider: Provider, keyChanged: boolean): string {
  return JSON.stringify({
    id: provider.id,
    config_id: provider.config_id,
    name: provider.name,
    base_url: provider.base_url,
    api_key: keyChanged ? provider.api_key : "",
    clear_api_key: keyChanged ? Boolean(provider.clear_api_key) : false,
    model: provider.model,
    models: (provider.models ?? []).map(modelSnapshot),
    model_synced_at: provider.model_synced_at ?? 0,
    model_sync_interval_secs: provider.model_sync_interval_secs ?? 86_400,
    model_sync_jitter_secs: provider.model_sync_jitter_secs ?? 300,
    model_sync_next_at: provider.model_sync_next_at ?? 0,
    model_sync_retry_at: provider.model_sync_retry_at ?? 0,
    model_sync_failures: provider.model_sync_failures ?? 0,
    model_sync_last_error: provider.model_sync_last_error ?? "",
    kind: provider.kind,
    note: provider.note,
  });
}

function ModelHealth({ checks }: { checks?: ModelCheck[] }) {
  const recent = (checks ?? []).slice(-12);
  if (!recent.length) return <span className="model-health muted">尚未測試這個模型</span>;
  const successes = recent.filter((check) => check.ok);
  const rate = Math.round((successes.length / recent.length) * 100);
  const avg = successes.length
    ? Math.round(successes.reduce((total, check) => total + check.ms, 0) / successes.length)
    : 0;
  const latest = recent[recent.length - 1];
  const tone = rate >= 95 ? "ok" : rate >= 60 ? "warn" : "bad";
  return (
    <span className={`model-health ${tone}`} title={new Date(latest.ts).toLocaleString()}>
      最近 {rate}% · 平均 {avg}ms · {latest.status || "連線失敗"}
    </span>
  );
}

export function EditorModal({ tool, provider, history, busy, onCancel, onSave, onSwitchModel, onModelTested, onClone }: EditorProps) {
  const initial = useRef(normalized(provider));
  const [form, setForm] = useState<Provider>(() => normalized(provider));
  const [tab, setTab] = useState<Tab>(provider ? "overview" : "connection");
  const [showKey, setShowKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [keyChanged, setKeyChanged] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [keyAutoHidden, setKeyAutoHidden] = useState(false);
  const [clipboardNotice, setClipboardNotice] = useState("");
  const [modelError, setModelError] = useState("");
  const [testingModels, setTestingModels] = useState<Record<string, boolean>>({});
  const [liveTestingModels, setLiveTestingModels] = useState<Record<string, boolean>>({});
  const [confirmLiveModels, setConfirmLiveModels] = useState<ModelProfile[] | null>(null);
  const [liveSelected, setLiveSelected] = useState<Set<string>>(new Set());
  const [livePolicy, setLivePolicy] = useState<LiveTestPolicy | null>(null);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [liveBatchNotice, setLiveBatchNotice] = useState("");
  const [modelNotices, setModelNotices] = useState<Record<string, string>>({});
  const [modelDiscovery, setModelDiscovery] = useState<ModelDiscovery | null>(null);
  const [syncingModels, setSyncingModels] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [metadataDrafts, setMetadataDrafts] = useState<Record<string, string>>({});
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [raw, setRaw] = useState<ProviderConfigPreview[]>([]);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawLoaded, setRawLoaded] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const dirty = snapshot(form, keyChanged) !== snapshot(initial.current, false);
  const tabs: { id: Tab; label: string }[] = provider
    ? [
        { id: "overview", label: "概覽" },
        { id: "models", label: "模型" },
        { id: "connection", label: "連線" },
        { id: "history", label: "紀錄" },
        { id: "raw", label: "原始設定" },
      ]
    : [
        { id: "connection", label: "連線" },
        { id: "models", label: "模型" },
      ];

  useEffect(() => {
    let alive = true;
    api.providerPresets().then((items) => alive && setPresets(items)).catch(() => {});
    if (provider) api.backupList(tool.id).then((items) => alive && setBackups(items.slice(0, 8))).catch(() => {});
    api.auditLog(40).then((items) => alive && setAuditEntries(items)).catch(() => {});
    api.liveTestPolicy().then((policy) => alive && setLivePolicy(policy)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [provider, tool.id]);

  useEffect(() => {
    if (!showKey) return;
    const timer = window.setTimeout(() => {
      setShowKey(false);
      setKeyAutoHidden(true);
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [showKey]);

  useEffect(() => {
    if (tab !== "raw" || !provider || rawLoaded) return;
    let alive = true;
    setRawLoading(true);
    api.providerConfigPreview(tool.id, provider.id)
      .then((items) => {
        if (alive) {
          setRaw(items);
          setRawLoaded(true);
        }
      })
      .catch((error) => alive && setRaw([{ file: "讀取失敗", fmt: "JSON", content: errorText(error) }]))
      .finally(() => alive && setRawLoading(false));
    return () => {
      alive = false;
    };
  }, [provider, rawLoaded, tab, tool.id]);

  const requestClose = () => {
    if (dirty && !busy) setConfirmClose(true);
    else onCancel();
  };

  const set = (key: keyof Provider) => (value: string) => {
    if (key === "api_key") {
      setClearKey(false);
      setKeyChanged(true);
      setKeyError("");
    }
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const toggleKey = async () => {
    setKeyAutoHidden(false);
    if (!provider || form.api_key) {
      setShowKey((value) => !value);
      return;
    }
    setRevealing(true);
    setKeyError("");
    try {
      const key = await api.revealProviderKey(tool.id, provider.id);
      setForm((previous) => ({ ...previous, api_key: key }));
      setShowKey(true);
    } catch (error) {
      setKeyError(errorText(error));
    } finally {
      setRevealing(false);
    }
  };

  const toggleClearKey = () => {
    setKeyChanged(true);
    setClearKey((value) => {
      const next = !value;
      if (next) {
        setForm((previous) => ({ ...previous, api_key: "" }));
        setShowKey(false);
      }
      setKeyError("");
      return next;
    });
  };

  const copyKey = async () => {
    setKeyError("");
    try {
      let key = form.api_key;
      if (!key && provider) key = await api.revealProviderKey(tool.id, provider.id);
      if (!key) throw new Error("這個供應商沒有可用的 API Key");
      await navigator.clipboard.writeText(key);
      setClipboardNotice("已複製，30 秒後會嘗試清空剪貼簿");
      window.setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText();
          if (current === key) await navigator.clipboard.writeText("");
        } catch {
          /* 瀏覽器不允許讀取剪貼簿時不主動覆蓋其他內容 */
        }
      }, 30_000);
    } catch (error) {
      setKeyError(errorText(error));
    }
  };

  const updateModel = (index: number, patch: Partial<ModelProfile>) => {
    setForm((previous) => ({
      ...previous,
      models: (previous.models ?? []).map((model, at) => (at === index ? { ...model, ...patch } : model)),
    }));
    setModelError("");
  };

  const addModel = (id = "") => {
    setForm((previous) => ({
      ...previous,
      models: [...(previous.models ?? []), { id, name: id }],
      model: previous.model || id,
    }));
  };

  const removeModel = (index: number) => {
    setForm((previous) => {
      const models = (previous.models ?? []).filter((_, at) => at !== index);
      const model = models.some((item) => item.id === previous.model) ? previous.model : models[0]?.id || "";
      return { ...previous, models, model };
    });
  };

  const selectModel = (model: ModelProfile) => {
    if (!model.id.trim()) {
      setModelError("請先填寫 Model ID，才能設為目前模型");
      return;
    }
    setForm((previous) => ({ ...previous, model: model.id.trim() }));
  };

  const testModel = async (model: ModelProfile) => {
    const modelId = model.id.trim();
    if (!provider || !modelId) return;
    setModelError("");
    setTestingModels((previous) => ({ ...previous, [modelId]: true }));
    try {
      const tested = await api.testModel(tool.id, provider.id, modelId);
      setForm((previous) => ({
        ...previous,
        models: (previous.models ?? []).map((item) =>
          item.id === modelId ? { ...item, checks: tested.model.checks ?? [] } : item
        ),
      }));
      onModelTested(tested.model);
      setModelNotices((previous) => ({
        ...previous,
        [modelId]: `${tested.result.status || "連線失敗"} · ${tested.result.ms}ms — ${tested.result.message}`,
      }));
    } catch (error) {
      setModelError(errorText(error));
    } finally {
      setTestingModels((previous) => {
        const next = { ...previous };
        delete next[modelId];
        return next;
      });
    }
  };

  const toggleLiveSelected = (modelId: string) => {
    if (!modelId.trim()) return;
    setLiveSelected((current) => {
      const next = new Set(current);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const saveLivePolicy = async () => {
    if (!livePolicy) return;
    setPolicyBusy(true);
    setModelError("");
    try {
      setLivePolicy(await api.setLiveTestPolicy(livePolicy.daily_limit, livePolicy.max_output_tokens));
      setLiveBatchNotice("實測配額與 token 上限已儲存。");
    } catch (error) {
      setModelError(errorText(error));
    } finally {
      setPolicyBusy(false);
    }
  };

  const runLiveModelTests = async (models: ModelProfile[]) => {
    if (!provider) return;
    const unique = Array.from(new Map(models.filter((model) => model.id.trim()).map((model) => [model.id.trim(), model])).values());
    const remaining = Math.max(0, livePolicy?.remaining_24h ?? unique.length);
    const allowed = unique.slice(0, remaining);
    const errors: string[] = [];
    if (!allowed.length) {
      setConfirmLiveModels(null);
      setModelError("近 24 小時實測配額已用完。請調整配額或稍後再試。");
      return;
    }
    if (allowed.length < unique.length) {
      errors.push(`配額只允許執行 ${allowed.length}／${unique.length} 個模型。`);
    }
    setConfirmLiveModels(null);
    setModelError("");
    setLiveBatchNotice("");
    let succeeded = 0;
    let failed = 0;
    for (const model of allowed) {
      const modelId = model.id.trim();
      setLiveTestingModels((previous) => ({ ...previous, [modelId]: true }));
      try {
        const tested = await api.liveTestModel(tool.id, provider.id, modelId);
        setForm((previous) => ({
          ...previous,
          models: (previous.models ?? []).map((item) =>
            item.id === modelId ? { ...item, checks: tested.model.checks ?? [] } : item
          ),
        }));
        onModelTested(tested.model);
        setModelNotices((previous) => ({
          ...previous,
          [modelId]: `${tested.result.status || "連線失敗"} · ${tested.result.ms}ms — ${tested.result.message}`,
        }));
        succeeded += 1;
      } catch (error) {
        const message = errorText(error);
        errors.push(`${modelId}: ${message}`);
        failed += 1;
        if (message.includes("配額")) break;
      } finally {
        setLiveTestingModels((previous) => {
          const next = { ...previous };
          delete next[modelId];
          return next;
        });
      }
    }
    try {
      setLivePolicy(await api.liveTestPolicy());
    } catch {
      /* policy refresh is best effort */
    }
    setLiveBatchNotice(`實測完成：成功 ${succeeded}，失敗 ${failed}。`);
    if (errors.length) setModelError(errors.join("\\n"));
  };

  const discoverModels = async () => {
    if (!provider) return;
    setModelError("");
    setSyncingModels(true);
    try {
      setModelDiscovery(await api.discoverModels(tool.id, provider.id));
    } catch (error) {
      setModelError(errorText(error));
    } finally {
      setSyncingModels(false);
    }
  };

  const applyDiscoveredModels = (discovered: ModelProfile[]) => {
    const syncedAt = Date.now();
    const returned = new Set(discovered.map((model) => model.id));
    setForm((previous) => {
      const models = [...(previous.models ?? [])];
      for (const update of discovered) {
        const index = models.findIndex((model) => model.id === update.id);
        if (index >= 0) {
          models[index] = {
            ...update,
            last_seen_at: syncedAt,
            checks: models[index].checks ?? update.checks ?? [],
          };
        } else {
          models.push({ ...update, last_seen_at: syncedAt });
        }
      }
      for (const model of models) {
        if (returned.has(model.id)) model.last_seen_at = syncedAt;
      }
      const interval = previous.model_sync_interval_secs ?? 86_400;
      const jitter = Math.floor(Math.random() * ((previous.model_sync_jitter_secs ?? 300) + 1)) * 1000;
      return {
        ...previous,
        models,
        model: previous.model || models[0]?.id || "",
        model_synced_at: syncedAt,
        model_sync_next_at: interval > 0 ? syncedAt + interval * 1000 + jitter : 0,
        model_sync_retry_at: 0,
        model_sync_failures: 0,
        model_sync_last_error: "",
      };
    });
    setMetadataDrafts({});
    setModelDiscovery(null);
  };

  const toggleFavoriteModel = async (model: ModelProfile) => {
    if (!provider || !model.id) return;
    try {
      const updated = await api.toggleModelFavorite(tool.id, provider.id, model.id, !model.favorite);
      setForm((previous) => ({
        ...previous,
        models: (previous.models ?? []).map((item) => item.id === updated.id ? { ...item, favorite: updated.favorite } : item),
      }));
      onModelTested(updated);
    } catch (error) {
      setModelError(errorText(error));
    }
  };

  const toggleArchiveModel = async (model: ModelProfile) => {
    if (!provider || !model.id) return;
    try {
      const updated = await api.archiveModel(tool.id, provider.id, model.id, !model.archived);
      setForm((previous) => ({
        ...previous,
        models: (previous.models ?? []).map((item) => item.id === updated.id ? { ...item, archived: updated.archived } : item),
      }));
      onModelTested(updated);
    } catch (error) {
      setModelError(errorText(error));
    }
  };

  const applyPreset = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setForm((previous) => {
      const models = [...(previous.models ?? [])];
      for (const modelId of preset.models) {
        if (!models.some((model) => model.id === modelId)) models.push({ id: modelId, name: modelId });
      }
      return {
        ...previous,
        name: previous.name || preset.name,
        base_url: preset.base_url,
        kind: preset.kind,
        models,
        model: previous.model || preset.models[0] || models[0]?.id || "",
      };
    });
  };

  const addPresetModels = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setForm((previous) => {
      const models = [...(previous.models ?? [])];
      for (const modelId of preset.models) {
        if (!models.some((model) => model.id === modelId)) models.push({ id: modelId, name: modelId });
      }
      return { ...previous, models, model: previous.model || preset.models[0] || models[0]?.id || "" };
    });
  };

  const buildPayload = (): Provider | null => {
    const models: ModelProfile[] = [];
    const seen = new Set<string>();
    for (const model of form.models ?? []) {
      const id = model.id.trim();
      if (!id) continue;
      if (seen.has(id)) {
        setModelError(`Model ID「${id}」重複`);
        return null;
      }
      seen.add(id);
      const draft = metadataDrafts[id] ?? modelMetadataText(model);
      let metadata: unknown = model.metadata ?? null;
      if (draft.trim()) {
        try {
          metadata = JSON.parse(draft);
        } catch {
          setModelError(`模型「${id}」的 metadata 不是合法 JSON`);
          return null;
        }
      }
      models.push({ ...model, id, name: model.name.trim() || id, metadata });
    }
    return {
      ...form,
      name: form.name.trim(),
      base_url: form.base_url.trim(),
      api_key: clearKey ? "" : form.api_key.trim(),
      clear_api_key: clearKey,
      model: form.model.trim() || models[0]?.id || "",
      models,
      kind: form.kind || tool.kind_choices[0] || "",
      note: form.note.trim(),
    };
  };

  const submit = async (previewAfter: boolean) => {
    setModelError("");
    const payload = buildPayload();
    if (!payload) return;
    if (!payload.name) {
      setModelError("請填寫供應商名稱");
      setTab("connection");
      return;
    }
    if (!payload.base_url) {
      setModelError("請填寫 Base URL");
      setTab("connection");
      return;
    }
    await onSave(payload, previewAfter);
  };

  const metadataValue = (model: ModelProfile) => metadataDrafts[model.id] ?? modelMetadataText(model);

  const selectedLiveModels = (form.models ?? []).filter((model) => model.id.trim() && liveSelected.has(model.id));
  const liveMaxOutput = livePolicy?.max_output_tokens ?? 8;
  const liveCosts = selectedLiveModels.map((model) => estimateLiveTestCost(model, liveMaxOutput));
  const liveEstimatedTotal = liveCosts.every((cost) => cost != null) ? liveCosts.reduce((sum, cost) => sum + (cost ?? 0), 0) : null;
  const liveEstimateUnknown = liveCosts.some((cost) => cost == null);
  const confirmLiveCosts = (confirmLiveModels ?? []).map((model) => estimateLiveTestCost(model, liveMaxOutput));
  const confirmLiveEstimate = confirmLiveCosts.every((cost) => cost != null) ? confirmLiveCosts.reduce((sum, cost) => sum + (cost ?? 0), 0) : null;
  const confirmLiveUnknown = confirmLiveCosts.some((cost) => cost == null);
  const scheduleInterval = form.model_sync_interval_secs ?? 86_400;
  const scheduleNextAt = Math.max(form.model_sync_retry_at ?? 0, form.model_sync_next_at ?? 0, form.model_synced_at && scheduleInterval ? form.model_synced_at + scheduleInterval * 1000 : 0);

  return (
    <>
      <Modal
        title={`${provider ? "供應商詳情" : "新增供應商"} · ${tool.name}`}
        onClose={requestClose}
        footer={
          <>
            {provider && onClone ? (
              <button className="ghost" onClick={onClone} disabled={busy} title="建立一份包含 API Key 的完整副本">
                另存為副本
              </button>
            ) : null}
            <span className="spacer" />
            <button className="ghost" onClick={requestClose} disabled={busy}>取消</button>
            {provider ? (
              <>
                <button className="ghost" onClick={() => void submit(false)} disabled={busy}>只儲存</button>
                <button className="primary" onClick={() => void submit(true)} disabled={busy}>
                  {busy ? <span className="spin" /> : null} 儲存並預覽
                </button>
              </>
            ) : (
              <button className="primary" onClick={() => void submit(false)} disabled={busy}>
                {busy ? <span className="spin" /> : null} 建立供應商
              </button>
            )}
          </>
        }
      >
        <div className="detail-tabs" role="tablist" aria-label="供應商詳情分類">
          {tabs.map((item) => (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              className={tab === item.id ? "on" : ""}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
                const currentIndex = buttons.indexOf(event.currentTarget);
                const delta = event.key === "ArrowRight" ? 1 : -1;
                const next = buttons[(currentIndex + delta + buttons.length) % buttons.length];
                next?.focus();
                next?.click();
              }}
            >
              {item.label}
              {item.id === "models" ? <span className="cnt">{form.models?.length ?? 0}</span> : null}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="detail-panel" id={`panel-overview`} role="tabpanel" aria-labelledby={`tab-overview`}>
            <div className="detail-hero">
              <div>
                <span className="eyebrow">供應商</span>
                <h4>{form.name || "未命名供應商"}</h4>
                <p>{form.note || form.config_id || "尚未設定識別名稱"}</p>
              </div>
              <div className="detail-hero-model">
                <span className="eyebrow">目前模型</span>
                <strong>{form.model || "尚未指定"}</strong>
                <span>{form.models?.length ?? 0} 個已知模型</span>
              </div>
            </div>
            <dl className="detail-grid">
              <div><dt>Harness</dt><dd>{tool.name}</dd></div>
              <div><dt>Protocol</dt><dd>{form.kind || "預設"}</dd></div>
              <div><dt>Base URL</dt><dd className="mono">{form.base_url || "—"}</dd></div>
              <div><dt>API Key</dt><dd>{clearKey ? "將清除" : form.has_api_key || form.api_key ? form.api_key_masked || "已儲存" : "未設定"}</dd></div>
              <div><dt>健康度</dt><dd>{history ? `${Math.round(history.success_rate * 100)}% · ${history.avg_ms}ms` : "尚無測試紀錄"}</dd></div>
              <div><dt>最近套用</dt><dd>{form.last_used ? new Date(form.last_used).toLocaleString() : "尚未套用"}</dd></div>
            </dl>
            <div className="detail-actions">
              <button type="button" className="ghost" onClick={() => setTab("models")}>管理模型</button>
              <button type="button" className="ghost" onClick={() => setTab("connection")}>編輯連線</button>
            </div>
          </div>
        ) : null}

        {tab === "models" ? (
          <div className="detail-panel" id={`panel-models`} role="tabpanel" aria-labelledby={`tab-models`}>
            <div className="detail-section-head">
              <div>
                <h4>模型</h4>
                <p>
                  設定這個供應商可用的模型。圓點代表下次套用時要寫入 Harness 的模型。
                  {form.model_synced_at ? ` 上次同步：${new Date(form.model_synced_at).toLocaleString()}` : " 尚未同步模型目錄。"}
                </p>
              </div>
              <div className="detail-section-actions">
                {form.previous_model && form.previous_model !== form.model && (form.models ?? []).some((model) => model.id === form.previous_model) ? (
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy || dirty}
                    onClick={() => void onSwitchModel(form.previous_model!)}
                    title="切回上一個使用過的模型，並先顯示 diff"
                  >
                    ↶ {form.previous_model}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || syncingModels || !provider}
                  onClick={() => void discoverModels()}
                  title="讀取供應商的 /models，先預覽再合併；不會刪除既有模型"
                >
                  {syncingModels ? <><span className="spin" /> 探索中</> : "↻ 同步模型"}
                </button>
                <button
                  type="button"
                  className="ghost live-test"
                  disabled={busy || !provider || !selectedLiveModels.length || dirty || !livePolicy?.remaining_24h}
                  onClick={() => setConfirmLiveModels(selectedLiveModels)}
                  title="一次實測勾選的模型；送出前會顯示配額與費用估算"
                >
                  實測選取 {selectedLiveModels.length || ""}
                </button>
                <button type="button" className="ghost" onClick={() => addModel()}>＋ 新增模型</button>
              </div>
            </div>
            <div className="model-automation-grid">
              <div className="model-schedule-card">
                <div className="model-automation-head">
                  <div>
                    <strong>自動模型同步</strong>
                    <span>每個供應商獨立排程；失敗會退避，成功後加入隨機延遲。</span>
                  </div>
                  <span className={`badge ${form.model_sync_failures ? "warn" : "ok"}`}>{form.model_sync_failures ? `失敗 ${form.model_sync_failures} 次` : "正常"}</span>
                </div>
                <div className="model-schedule-fields">
                  <div className="field">
                    <label>同步間隔</label>
                    <select aria-label="模型同步間隔" value={scheduleInterval} onChange={(event) => setForm((previous) => ({ ...previous, model_sync_interval_secs: Number(event.target.value) }))}>
                      <option value={0}>手動</option>
                      <option value={21600}>每 6 小時</option>
                      <option value={43200}>每 12 小時</option>
                      <option value={86400}>每 24 小時</option>
                      <option value={259200}>每 3 天</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>隨機延遲（分鐘）</label>
                    <input aria-label="模型同步隨機延遲分鐘" type="number" min={0} max={60} value={Math.round((form.model_sync_jitter_secs ?? 300) / 60)} onChange={(event) => setForm((previous) => ({ ...previous, model_sync_jitter_secs: Math.max(0, Math.min(3600, Number(event.target.value) || 0)) * 60 }))} />
                  </div>
                </div>
                <div className="model-schedule-meta">
                  <span>上次成功：{form.model_synced_at ? new Date(form.model_synced_at).toLocaleString() : "尚未同步"}</span>
                  <span>下次排程：{scheduleInterval === 0 ? "手動" : scheduleNextAt ? new Date(scheduleNextAt).toLocaleString() : "尚未排程"}</span>
                  <span>離線快取：{form.models?.length ?? 0} 個模型</span>
                </div>
                {form.model_sync_last_error ? <div className="note warn model-sync-error">上次失敗：{form.model_sync_last_error}</div> : null}
              </div>

              <div className="live-policy-card">
                <div className="model-automation-head">
                  <div>
                    <strong>實測成本保護</strong>
                    <span>配額以近 24 小時計算；每次請求都受硬性 token 上限約束。</span>
                  </div>
                  <span className={`badge ${livePolicy?.remaining_24h ? "ok" : "warn"}`}>{livePolicy ? `剩餘 ${livePolicy.remaining_24h}` : "讀取中"}</span>
                </div>
                <div className="model-schedule-fields">
                  <div className="field">
                    <label>每日實測次數</label>
                    <input aria-label="每日實測次數上限" type="number" min={1} max={200} value={livePolicy?.daily_limit ?? 20} onChange={(event) => setLivePolicy((previous) => ({ ...(previous ?? { daily_limit: 20, used_24h: 0, remaining_24h: 20, max_output_tokens: 8 }), daily_limit: Math.max(1, Math.min(200, Number(event.target.value) || 1)) }))} />
                  </div>
                  <div className="field">
                    <label>每次輸出上限</label>
                    <input aria-label="實測輸出 token 上限" type="number" min={1} max={128} value={livePolicy?.max_output_tokens ?? 8} onChange={(event) => setLivePolicy((previous) => ({ ...(previous ?? { daily_limit: 20, used_24h: 0, remaining_24h: 20, max_output_tokens: 8 }), max_output_tokens: Math.max(1, Math.min(128, Number(event.target.value) || 1)) }))} />
                  </div>
                  <button type="button" className="ghost" onClick={() => void saveLivePolicy()} disabled={policyBusy || !livePolicy}>{policyBusy ? <span className="spin" /> : null} 儲存政策</button>
                </div>
                <div className="model-schedule-meta">
                  <span>近 24 小時已使用：{livePolicy?.used_24h ?? 0} / {livePolicy?.daily_limit ?? 20}</span>
                  <span>目前每次最多：{livePolicy?.max_output_tokens ?? 8} tokens</span>
                </div>
                {selectedLiveModels.length ? (
                  <div className="live-selection-summary">
                    <span>已選 {selectedLiveModels.length} 個模型</span>
                    <span>{liveEstimatedTotal != null ? `預估上限 ${formatUsd(liveEstimatedTotal)}` : liveEstimateUnknown ? "部分模型未提供 pricing" : "尚未提供 pricing"}</span>
                    <button type="button" className="ghost small" onClick={() => setLiveSelected(new Set())}>清除選取</button>
                  </div>
                ) : null}
                {liveBatchNotice ? <div className="note">{liveBatchNotice}</div> : null}
              </div>
            </div>

            <div className="field compact-field">
              <label htmlFor="f-add-preset-models">從預設加入模型</label>
              <select id="f-add-preset-models" value="" onChange={(event) => addPresetModels(event.target.value)}>
                <option value="" disabled>選擇供應商預設…</option>
                {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.models.length} 個模型</option>)}
              </select>
            </div>
            <div className="model-list">
              {(form.models ?? []).map((model, index) => {
                const active = form.model === model.id && Boolean(model.id);
                const stale = Boolean(form.model_synced_at && (!model.last_seen_at || model.last_seen_at < form.model_synced_at));
                return (
                  <article className={`model-card${active ? " active" : ""}${model.archived ? " archived" : ""}${stale ? " stale" : ""}`} key={`${index}-${model.id}`} aria-label={`模型 ${model.id || "新模型"}`}>
                    <div className="model-actions">
                      <label className="model-live-pick" title="選取此模型進行批次實測">
                        <input
                          type="checkbox"
                          aria-label={`選取實測模型 ${model.id || "新模型"}`}
                          checked={Boolean(model.id && liveSelected.has(model.id))}
                          disabled={!provider || !model.id.trim()}
                          onChange={() => toggleLiveSelected(model.id)}
                        />
                        <span>選取</span>
                      </label>
                      <button type="button" className={`model-active${active ? " on" : ""}`} aria-pressed={active} onClick={() => selectModel(model)} title="把這個模型設為供應商預設">
                        <span className="model-dot" />
                        {active ? "目前模型" : "設為目前"}
                      </button>
                      <button
                        type="button"
                        className={`small ghost model-favorite${model.favorite ? " on" : ""}`}
                        disabled={busy || !provider || !model.id}
                        aria-label={model.favorite ? `取消常用模型 ${model.id}` : `設為常用模型 ${model.id}`}
                        aria-pressed={Boolean(model.favorite)}
                        onClick={() => void toggleFavoriteModel(model)}
                        title="常用模型會排在快速切換選單前面"
                      >
                        {model.favorite ? "★ 常用" : "☆ 常用"}
                      </button>
                      <button
                        type="button"
                        className="small primary model-switch"
                        disabled={busy || dirty || !model.id.trim() || Boolean(testingModels[model.id])}
                        title={dirty ? "請先儲存或放棄其他未儲存變更" : "只更新模型欄位，開啟 diff 後再確認"}
                        onClick={() => void onSwitchModel(model.id.trim())}
                      >
                        {active ? "重新套用" : "切換並預覽"}
                      </button>
                      <button
                        type="button"
                        className="small ghost"
                        aria-label={`測試模型 ${model.id || "新模型"}`}
                        disabled={busy || !provider || !model.id.trim() || Boolean(testingModels[model.id])}
                        onClick={() => void testModel(model)}
                        title="讀取 /models 驗證這個模型；不送出 prompt，也不產生推論費用"
                      >
                        {testingModels[model.id] ? <><span className="spin" /> 測試中</> : "測試"}
                      </button>
                      <button
                        type="button"
                        className="small ghost live-test"
                        aria-label={`實測模型 ${model.id || "新模型"}`}
                        disabled={busy || !provider || !model.id.trim() || Boolean(liveTestingModels[model.id])}
                        onClick={() => setConfirmLiveModels([model])}
                        title="送出極小推論請求；可能產生少量費用"
                      >
                        {liveTestingModels[model.id] ? <><span className="spin" /> 實測中</> : "實測"}
                      </button>
                      <button
                        type="button"
                        className="small ghost"
                        disabled={busy || !provider || !model.id}
                        onClick={() => void toggleArchiveModel(model)}
                        title="封存只影響 kumoSwitch 顯示，不會刪除任何設定"
                      >
                        {model.archived ? "取消封存" : "封存"}
                      </button>
                      <button type="button" className="small danger model-remove" onClick={() => removeModel(index)}>移除</button>
                    </div>
                    <div className="model-fields">
                      {(model.favorite || model.archived || stale) ? (
                        <div className="model-card-status">
                          {model.favorite ? <span className="badge ok">★ 常用</span> : null}
                          {model.archived ? <span className="badge subtle">已封存</span> : null}
                          {stale ? <span className="badge warn">本次未回報</span> : null}
                        </div>
                      ) : null}
                      <div className="field-row">
                        <div className="field">
                          <label>Model ID</label>
                          <input aria-label="Model ID" list="model-suggestions" value={model.id} placeholder="glm-5.3-flash" onChange={(event) => updateModel(index, { id: event.target.value })} />
                        </div>
                        <div className="field">
                          <label>顯示名稱</label>
                          <input aria-label="模型顯示名稱" value={model.name} placeholder="選填" onChange={(event) => updateModel(index, { name: event.target.value })} />
                        </div>
                      </div>
                      <div className="model-number-row">
                        <div className="field"><label>Context window</label><input aria-label="Context window" inputMode="numeric" value={model.context_window ?? ""} placeholder="128000" onChange={(event) => updateModel(index, { context_window: optionalNumber(event.target.value) })} /></div>
                        <div className="field"><label>Max output</label><input aria-label="Max output" inputMode="numeric" value={model.max_output ?? ""} placeholder="16384" onChange={(event) => updateModel(index, { max_output: optionalNumber(event.target.value) })} /></div>
                        <div className="field"><label>Reasoning</label><select aria-label="Reasoning" value={printableBool(model.reasoning)} onChange={(event) => updateModel(index, { reasoning: optionalBool(event.target.value) })}><option value="unknown">未知</option><option value="true">支援</option><option value="false">不支援</option></select></div>
                        <div className="field"><label>Vision</label><select aria-label="Vision" value={printableBool(model.vision)} onChange={(event) => updateModel(index, { vision: optionalBool(event.target.value) })}><option value="unknown">未知</option><option value="true">支援</option><option value="false">不支援</option></select></div>
                        <div className="field"><label>Tools</label><select aria-label="Tools" value={printableBool(model.tools)} onChange={(event) => updateModel(index, { tools: optionalBool(event.target.value) })}><option value="unknown">未知</option><option value="true">支援</option><option value="false">不支援</option></select></div>
                      </div>
                      <div className="field">
                        <label>Metadata（JSON）</label>
                        <textarea aria-label="模型 metadata" rows={3} value={metadataValue(model)} onChange={(event) => setMetadataDrafts((previous) => ({ ...previous, [model.id]: event.target.value }))} />
                      </div>
                      <div className="model-health-row">
                        <ModelHealth checks={model.checks} />
                        {modelNotices[model.id] ? <span className="model-test-notice">{modelNotices[model.id]}</span> : null}
                      </div>
                    </div>
                  </article>
                );
              })}
              {(form.models?.length ?? 0) === 0 ? <div className="empty small">還沒有模型。新增模型，或從供應商預設加入。</div> : null}
            </div>
            <datalist id="model-suggestions">
              {Array.from(new Set(presets.flatMap((preset) => preset.models))).sort((left, right) => left.localeCompare(right)).map((model) => <option key={model} value={model} />)}
            </datalist>
            {modelError ? <div className="note error">{modelError}</div> : null}
          </div>
        ) : null}

        {tab === "connection" ? (
          <div className="detail-panel" id={`panel-connection`} role="tabpanel" aria-labelledby={`tab-connection`}>
            <div className="field">
              <label htmlFor="f-preset">從預設選擇（選完仍可修改）</label>
              <select id="f-preset" value="" onChange={(event) => applyPreset(event.target.value)}>
                <option value="" disabled>選擇一個已知供應商…</option>
                {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.note}</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="f-name">名稱</label>
                <input id="f-name" data-autofocus={provider ? undefined : true} value={form.name} placeholder="例：OpenCode Go" onChange={(event) => set("name")(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="f-kind">類型（{tool.format === "TOML" ? "wire_api" : "協議"}）</label>
                {tool.kind_choices.length ? (
                  <select id="f-kind" value={form.kind} onChange={(event) => set("kind")(event.target.value)}>
                    {tool.kind_choices.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </select>
                ) : (
                  <input id="f-kind" value={form.kind} placeholder="預設" onChange={(event) => set("kind")(event.target.value)} />
                )}
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-url">Base URL</label>
              <input id="f-url" value={form.base_url} placeholder="https://api.example.com/v1" onChange={(event) => set("base_url")(event.target.value)} />
              <div className="hint">必須包含路徑前綴（多數供應商要 /v1）</div>
            </div>
            <div className="field">
              <label htmlFor="f-key">API Key</label>
              <div className="key-row">
                <input id="f-key" type={showKey ? "text" : "password"} value={form.api_key} disabled={clearKey} placeholder={clearKey ? "儲存後清除" : provider?.has_api_key ? provider.api_key_masked || "已儲存" : "sk-..."} onChange={(event) => set("api_key")(event.target.value)} />
                <button type="button" className="ghost" onClick={() => void toggleKey()} disabled={revealing || clearKey}>{revealing ? "讀取中…" : showKey ? "隱藏" : provider?.has_api_key && !form.api_key ? "查看" : "顯示"}</button>
                {provider?.has_api_key ? <button type="button" className="ghost" onClick={() => void copyKey()} disabled={revealing || clearKey}>複製</button> : null}
                {provider?.has_api_key ? <button type="button" className="ghost" onClick={toggleClearKey} disabled={busy || revealing}>{clearKey ? "保留金鑰" : "清除金鑰"}</button> : null}
              </div>
              <div className="hint">{clearKey ? "儲存後會移除這個供應商的 API Key。" : provider ? "留空會保留現有金鑰；按「查看」才會載入完整金鑰，顯示 30 秒後會自動隱藏。" : "金鑰會以系統安全儲存加密後留在本機。"}</div>
              {keyAutoHidden ? <div className="hint">已於 30 秒後自動隱藏完整金鑰。</div> : null}
              {clipboardNotice ? <div className="hint">{clipboardNotice}</div> : null}
              {keyError ? <div className="note error">{keyError}</div> : null}
            </div>
            <div className="field"><label htmlFor="f-note">備註</label><input id="f-note" value={form.note} placeholder="選填" onChange={(event) => set("note")(event.target.value)} /></div>
            <div className="note">套用時只會寫入 {tool.name} 的供應商相關鍵位，其他設定與註解不會被動到。</div>
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="detail-panel" id={`panel-history`} role="tabpanel" aria-labelledby={`tab-history`}>
            <div className="detail-section-head"><div><h4>測試與變更紀錄</h4><p>健康度來自最近的本機連線測試；備份可在主頁的「更多 → 備份紀錄」還原。</p></div></div>
            {history ? (
              <div className="history-summary">
                <div><span>總測試</span><strong>{history.total}</strong></div>
                <div><span>成功率</span><strong>{Math.round(history.success_rate * 100)}%</strong></div>
                <div><span>平均延遲</span><strong>{history.avg_ms}ms</strong></div>
                <div><span>最近測試</span><strong>{new Date(history.last_ts).toLocaleString()}</strong></div>
              </div>
            ) : <div className="empty small">還沒有測試紀錄。</div>}
            <div className="detail-subhead">最近備份</div>
            {backups.length ? backups.map((backup) => <div className="detail-row" key={backup.id}><span className="mono">{backup.created}</span><span>{backup.files.length} 個檔案</span><span className="muted">{backup.id}</span></div>) : <div className="empty small">還沒有備份紀錄。</div>}
            <div className="detail-subhead">敏感操作稽核</div>
            {auditEntries.length ? auditEntries.slice(0, 20).map((entry, index) => (
              <div className="detail-row audit-row" key={`${entry.ts}-${index}`}>
                <span className="mono">{new Date(entry.ts).toLocaleString()}</span>
                <span>{entry.action}</span>
                <span className="muted">{entry.detail}</span>
              </div>
            )) : <div className="empty small">還沒有稽核紀錄。</div>}
          </div>
        ) : null}

        {tab === "raw" ? (
          <div className="detail-panel" id={`panel-raw`} role="tabpanel" aria-labelledby={`tab-raw`}>
            <div className="detail-section-head"><div><h4>套用後設定</h4><p>以下是套用這個供應商後，相關設定檔會呈現的內容；API Key 已遮罩。</p></div></div>
            {rawLoading ? <div className="empty small"><span className="spin" /> 讀取設定中…</div> : null}
            {!rawLoading ? raw.map((file) => (
              <div className="raw-config" key={file.file}>
                <div className="raw-config-head"><code>{file.file}</code><span className="badge subtle">{file.fmt}</span></div>
                <pre>{file.content}</pre>
              </div>
            )) : null}
          </div>
        ) : null}
      </Modal>

      {modelDiscovery ? (
        <ModelSyncModal
          providerName={form.name || provider?.name || "供應商"}
          discovery={modelDiscovery}
          currentModels={form.models ?? []}
          lastSyncedAt={form.model_synced_at}
          busy={busy}
          onCancel={() => setModelDiscovery(null)}
          onApply={applyDiscoveredModels}
        />
      ) : null}

      {confirmLiveModels ? (
        <ConfirmModal
          title="進行真實模型實測？"
          message={`會向「${provider?.name || form.name}」送出 ${confirmLiveModels.length} 個極小推論請求：${confirmLiveModels.map((model) => model.id || "新模型").join("、")}。

每次最多 ${liveMaxOutput} tokens，近 24 小時剩餘 ${livePolicy?.remaining_24h ?? "未知"} 次配額。${confirmLiveEstimate != null ? `依端點 pricing metadata 粗估總費用 ${formatUsd(confirmLiveEstimate)}。` : confirmLiveUnknown ? "部分模型未提供 pricing metadata，實際費用無法完整估算。" : ""}

這不是 /models 檢查，供應商可能收取少量費用。`}
          confirmLabel={confirmLiveModels.length > 1 ? `實測 ${confirmLiveModels.length} 個模型` : "送出實測"}
          busy={confirmLiveModels.some((model) => liveTestingModels[model.id])}
          onCancel={() => setConfirmLiveModels(null)}
          onConfirm={() => void runLiveModelTests(confirmLiveModels)}
        />
      ) : null}

      {confirmClose ? (
        <ConfirmModal title="放棄未儲存的變更？" message="你對供應商或模型所做的修改尚未儲存。關閉後這些變更會消失。" confirmLabel="放棄變更" danger busy={false} onCancel={() => setConfirmClose(false)} onConfirm={onCancel} />
      ) : null}
    </>
  );
}

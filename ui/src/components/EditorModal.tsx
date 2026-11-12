import { useEffect, useState } from "react";
import { api } from "../api";
import type { Preset } from "../types";
import type { Provider, ToolView } from "../types";
import { Modal } from "./Modal";

interface EditorProps {
  tool: ToolView;
  provider: Provider | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: Provider) => void;
  onClone?: () => void;
}

const EMPTY: Provider = {
  id: "",
  config_id: "",
  name: "",
  base_url: "",
  api_key: "",
  model: "",
  kind: "",
  note: "",
};

export function EditorModal({ tool, provider, busy, onCancel, onSave, onClone }: EditorProps) {
  const [form, setForm] = useState<Provider>(() => ({ ...EMPTY, ...(provider ?? {}) }));
  const [showKey, setShowKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    let alive = true;
    api.providerPresets().then((p) => alive && setPresets(p)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const applyPreset = (id: string) => {
    const preset = presets.find((x) => x.id === id);
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || preset.name,
      base_url: preset.base_url,
      model: preset.models[0] ?? prev.model,
      kind: preset.kind,
    }));
  };

  const set = (key: keyof Provider) => (value: string) => {
    if (key === "api_key") {
      setClearKey(false);
      setKeyError("");
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleKey = async () => {
    if (!provider || form.api_key) {
      setShowKey((value) => !value);
      return;
    }
    setRevealing(true);
    setKeyError("");
    try {
      const key = await api.revealProviderKey(tool.id, provider.id);
      setForm((prev) => ({ ...prev, api_key: key }));
      setShowKey(true);
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : String(error));
    } finally {
      setRevealing(false);
    }
  };

  const toggleClearKey = () => {
    setClearKey((value) => {
      const next = !value;
      if (next) {
        setForm((prev) => ({ ...prev, api_key: "" }));
        setShowKey(false);
      }
      setKeyError("");
      return next;
    });
  };

  const submit = () => {
    onSave({
      ...form,
      name: form.name.trim(),
      base_url: form.base_url.trim(),
      api_key: clearKey ? "" : form.api_key.trim(),
      clear_api_key: clearKey,
      model: form.model.trim(),
      note: form.note.trim(),
      kind: form.kind || tool.kind_choices[0] || "",
    });
  };

  return (
    <Modal
      narrow
      title={`${provider ? "編輯供應商" : "新增供應商"} · ${tool.name}`}
      onClose={onCancel}
      footer={
        <>
          {provider && onClone ? (
            <button
              className="ghost"
              onClick={onClone}
              disabled={busy}
              title="建立一份包含 API Key 的完整副本"
            >
              另存為副本
            </button>
          ) : null}
          <span className="spacer" />
          <button className="ghost" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? <span className="spin" /> : null} 儲存
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label htmlFor="f-preset">從預設選擇（選完仍可修改）</label>
          <select id="f-preset" defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="" disabled>
              選擇一個已知供應商…
            </option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.note}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="f-name">名稱</label>
            <input
              id="f-name"
              data-autofocus
              value={form.name}
              placeholder="例：OpenCode Go"
              onChange={(e) => set("name")(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-model">模型</label>
            <input
              id="f-model"
              value={form.model}
              placeholder="例：glm-5.3-flash"
              onChange={(e) => set("model")(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-url">Base URL</label>
          <input
            id="f-url"
            value={form.base_url}
            placeholder="https://api.example.com/v1"
            onChange={(e) => set("base_url")(e.target.value)}
          />
          <div className="hint">必須包含路徑前綴（多數供應商要 /v1）</div>
        </div>

        <div className="field">
          <label htmlFor="f-key">API Key</label>
          <div className="key-row">
            <input
              id="f-key"
              type={showKey ? "text" : "password"}
              value={form.api_key}
              disabled={clearKey}
              placeholder={
                clearKey
                  ? "儲存後清除"
                  : provider?.has_api_key
                    ? provider.api_key_masked || "已儲存"
                    : "sk-..."
              }
              onChange={(e) => set("api_key")(e.target.value)}
            />
            <button className="ghost" type="button" onClick={() => void toggleKey()} disabled={revealing || clearKey}>
              {revealing ? "讀取中…" : showKey ? "隱藏" : provider?.has_api_key && !form.api_key ? "查看" : "顯示"}
            </button>
            {provider?.has_api_key ? (
              <button className="ghost" type="button" onClick={toggleClearKey} disabled={busy || revealing}>
                {clearKey ? "保留金鑰" : "清除金鑰"}
              </button>
            ) : null}
          </div>
          <div className="hint">
            {clearKey
              ? "儲存後會移除這個供應商的 API Key。"
              : provider
                ? "留空會保留現有金鑰；按「查看」才會把完整金鑰載入編輯器。"
                : "金鑰會以系統安全儲存加密後留在本機。"}
          </div>
          {keyError ? <div className="hint" style={{ color: "var(--danger)" }}>{keyError}</div> : null}
        </div>

        {tool.kind_choices.length ? (
          <div className="field">
            <label htmlFor="f-kind">類型（{tool.format === "TOML" ? "wire_api" : "協議"}）</label>
            <select id="f-kind" value={form.kind} onChange={(e) => set("kind")(e.target.value)}>
              {tool.kind_choices.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="f-note">備註</label>
          <input
            id="f-note"
            value={form.note}
            placeholder="選填"
            onChange={(e) => set("note")(e.target.value)}
          />
        </div>

        <div className="note">
          套用時只會寫入 {tool.name} 的供應商鍵位，其他設定與註解不會被動到。
        </div>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
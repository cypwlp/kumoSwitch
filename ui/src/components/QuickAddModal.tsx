import { useState } from "react";
import type { Provider, ToolView } from "../types";
import { Modal } from "./Modal";

interface QuickAddProps {
  tool: ToolView;
  busy: boolean;
  onCancel: () => void;
  onAdvanced: () => void;
  onSave: (payload: Provider, options: { fetchModels: boolean; switchNow: boolean }) => Promise<void>;
}

function hostName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function QuickAddModal({ tool, busy, onCancel, onAdvanced, onSave }: QuickAddProps) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [fetchModels, setFetchModels] = useState(true);
  const [error, setError] = useState("");

  const submit = async (switchNow: boolean) => {
    setError("");
    const url = baseUrl.trim();
    const providerName = name.trim() || hostName(url);
    if (!url) {
      setError("請填寫 Base URL，例如 https://api.example.com/v1");
      return;
    }
    if (!providerName) {
      setError("請填寫供應商名稱，或貼上完整 URL 讓 kumoSwitch 自動命名");
      return;
    }
    const payload: Provider = {
      id: "",
      config_id: "",
      name: providerName,
      base_url: url,
      api_key: apiKey.trim(),
      model: model.trim(),
      models: model.trim() ? [{ id: model.trim(), name: model.trim() }] : [],
      kind: tool.kind_choices[0] || "",
      note: "快速新增",
    };
    try {
      await onSave(payload, { fetchModels, switchNow });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal
      title={`快速新增 · ${tool.name}`}
      onClose={onCancel}
      narrow
      footer={
        <>
          <button className="ghost" onClick={onCancel} disabled={busy}>取消</button>
          <span className="spacer" />
          <button className="ghost" onClick={onAdvanced} disabled={busy}>完整編輯</button>
          <button className="ghost" onClick={() => void submit(false)} disabled={busy}>只儲存</button>
          <button className="primary" onClick={() => void submit(true)} disabled={busy}>
            {busy ? <span className="spin" /> : null} 儲存並切換
          </button>
        </>
      }
    >
      <div className="quick-add">
        <label className="field">
          <span>Base URL</span>
          <input
            autoFocus
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.example.com/v1"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-...（本機加密保存）"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="quick-add-row">
          <label className="field">
            <span>名稱（選填）</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                if (!name.trim()) setName(hostName(baseUrl));
              }}
              placeholder="自動以網域命名"
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>模型 ID（選填）</span>
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="留空則自動偵測"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        </div>
        <label className="quick-add-check">
          <input type="checkbox" checked={fetchModels} onChange={(event) => setFetchModels(event.target.checked)} />
          <span>儲存後自動讀取供應商的模型目錄</span>
        </label>
        <p className="fineprint">
          API Key 只會存進 kumoSwitch 的加密清單；按下「儲存並切換」才會寫入 {tool.name} 設定，並自動建立時間戳備份。
        </p>
        {error ? <div className="note error" role="alert">{error}</div> : null}
      </div>
    </Modal>
  );
}

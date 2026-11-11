import { useState } from "react";
import type { Provider, ToolView } from "../types";
import { Modal } from "./Modal";

interface EditorProps {
  tool: ToolView;
  provider: Provider | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: Provider) => void;
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

export function EditorModal({ tool, provider, busy, onCancel, onSave }: EditorProps) {
  const [form, setForm] = useState<Provider>(() => ({ ...EMPTY, ...(provider ?? {}) }));
  const [showKey, setShowKey] = useState(false);

  const set = (key: keyof Provider) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    onSave({
      ...form,
      name: form.name.trim(),
      base_url: form.base_url.trim(),
      api_key: form.api_key.trim(),
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
              placeholder="sk-..."
              onChange={(e) => set("api_key")(e.target.value)}
            />
            <button className="ghost" type="button" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "隱藏" : "顯示"}
            </button>
          </div>
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
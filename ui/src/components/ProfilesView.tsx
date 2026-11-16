import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorText } from "../api";
import type { Provider, SharedProfileInput, SharedProfileTarget, SharedProfileView, ToolView } from "../types";
import { Modal } from "./Modal";

interface Props {
  onError: (message: string) => void;
  onToast: (message: string, kind?: "ok" | "err") => void;
  onChanged: () => void;
}

const EMPTY_INPUT: SharedProfileInput = {
  id: "",
  name: "",
  base_url: "",
  kind: "responses",
  model: "",
  models: [],
  note: "",
  tags: [],
  targets: [],
  api_key: "",
  clear_api_key: false,
};

function targetFor(input: SharedProfileInput, tool: string): SharedProfileTarget {
  return input.targets.find((target) => target.tool === tool) ?? {
    tool,
    provider_id: "",
    model: "",
    kind: "",
    enabled: false,
    last_synced_at: 0,
  };
}

function fromView(profile: SharedProfileView): SharedProfileInput {
  return {
    id: profile.id,
    name: profile.name,
    base_url: profile.base_url,
    kind: profile.kind,
    model: profile.model,
    models: profile.models,
    note: profile.note,
    tags: profile.tags,
    targets: profile.targets,
    api_key: "",
    clear_api_key: false,
  };
}

function compactBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

export function ProfilesView({ onError, onToast, onChanged }: Props) {
  const [profiles, setProfiles] = useState<SharedProfileView[]>([]);
  const [tools, setTools] = useState<ToolView[]>([]);
  const [providers, setProviders] = useState<Record<string, Provider[]>>({});
  const [editing, setEditing] = useState<SharedProfileInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importTool, setImportTool] = useState("");
  const [importProviderId, setImportProviderId] = useState("");

  const refresh = useCallback(async () => {
    const [nextProfiles, nextTools] = await Promise.all([api.profileList(), api.toolList()]);
    setProfiles(nextProfiles);
    setTools(nextTools);
    const entries = await Promise.all(nextTools.map(async (tool) => [tool.id, await api.providerList(tool.id)] as const));
    setProviders(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    refresh().catch((error) => onError(errorText(error)));
  }, [onError, refresh]);

  const enabledTargetCount = useMemo(
    () => editing?.targets.filter((target) => target.enabled).length ?? 0,
    [editing],
  );

  const openNew = () => setEditing({ ...EMPTY_INPUT, targets: tools.map((tool) => targetFor(EMPTY_INPUT, tool.id)) });

  const updateTarget = (tool: string, patch: Partial<SharedProfileTarget>) => {
    setEditing((current) => {
      if (!current) return current;
      const exists = current.targets.some((target) => target.tool === tool);
      const targets = exists
        ? current.targets.map((target) => target.tool === tool ? { ...target, ...patch } : target)
        : [...current.targets, { ...targetFor(current, tool), ...patch }];
      return { ...current, targets };
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.base_url.trim()) {
      onError("Profile 名稱與 Base URL 不能空白");
      return;
    }
    setBusy(true);
    try {
      const saved = await api.profileSave(editing);
      setEditing(null);
      await refresh();
      onChanged();
      onToast(`已儲存共用 Profile「${saved.name}」`, "ok");
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const syncProfile = async (profile: SharedProfileView, toolsToSync: string[] = []) => {
    setBusy(true);
    try {
      const result = await api.profileSync(profile.id, toolsToSync);
      await refresh();
      onChanged();
      onToast(`已同步 ${result.synced.length} 個工具${result.skipped.length ? `，略過 ${result.skipped.length} 項` : ""}`, "ok");
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.profileDelete(id);
      setDeleteId(null);
      await refresh();
      onChanged();
      onToast("共用 Profile 已刪除；各工具既有供應商不會被刪除", "ok");
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const importProvider = async () => {
    if (!importTool || !importProviderId) return;
    setBusy(true);
    try {
      const profile = await api.profileImportProvider(importTool, importProviderId);
      await refresh();
      onChanged();
      setImportProviderId("");
      onToast(`已建立共用 Profile「${profile.name}」`, "ok");
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="profiles-view" aria-busy={busy}>
      <header className="profiles-head">
        <div>
          <span className="kicker">Cross-tool library</span>
          <h2>共用供應商 Profile</h2>
          <p>一份加密的連線位址、金鑰與模型組合，可同步到 Codex、Claude、Gemini 或其他工具，各自保留相容的 protocol 與模型映射。</p>
        </div>
        <div className="profiles-actions">
          <button className="ghost" onClick={() => void refresh()} disabled={busy}>重新整理</button>
          <button className="primary" onClick={openNew}>＋ 新增 Profile</button>
        </div>
      </header>

      <div className="profiles-import-bar">
        <div>
          <strong>從現有供應商建立</strong>
          <span>沿用其加密金鑰與模型目錄，不必重新輸入。</span>
        </div>
        <select value={importTool} aria-label="來源工具" onChange={(event) => { setImportTool(event.target.value); setImportProviderId(""); }}>
          <option value="">選擇工具…</option>
          {tools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
        </select>
        <select value={importProviderId} aria-label="來源供應商" onChange={(event) => setImportProviderId(event.target.value)} disabled={!importTool}>
          <option value="">選擇供應商…</option>
          {(providers[importTool] ?? []).map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
        </select>
        <button className="ghost" disabled={busy || !importProviderId} onClick={() => void importProvider()}>建立 Profile</button>
      </div>

      {profiles.length ? (
        <div className="profiles-grid">
          {profiles.map((profile) => {
            const enabled = profile.targets.filter((target) => target.enabled);
            return (
              <article className="profile-card" key={profile.id}>
                <div className="profile-card-head">
                  <div>
                    <span className="eyebrow">{profile.tags.length ? profile.tags.join(" · ") : "shared profile"}</span>
                    <h3>{profile.name}</h3>
                  </div>
                  <span className={`badge ${profile.has_api_key ? "ok" : "warn"}`}>{profile.has_api_key ? profile.api_key_masked : "沒有金鑰"}</span>
                </div>
                <code className="profile-url">{profile.base_url}</code>
                <dl className="profile-facts">
                  <div><dt>Protocol</dt><dd>{profile.kind || "各工具預設"}</dd></div>
                  <div><dt>模型</dt><dd>{profile.model || "—"}</dd></div>
                  <div><dt>金鑰版本</dt><dd>{profile.key_count || 0}</dd></div>
                  <div><dt>已綁定</dt><dd>{enabled.length} 個工具</dd></div>
                </dl>
                <div className="profile-targets">
                  {enabled.length ? enabled.map((target) => (
                    <span className={`profile-target-chip${target.provider_id ? " linked" : ""}`} key={target.tool}>
                      {tools.find((tool) => tool.id === target.tool)?.name ?? target.tool}
                      <small>{target.model || profile.model || "預設模型"}</small>
                    </span>
                  )) : <span className="muted small">尚未選擇要同步的工具</span>}
                </div>
                <div className="profile-card-actions">
                  <button className="primary small" disabled={busy} onClick={() => void syncProfile(profile)}>同步全部</button>
                  {enabled.map((target) => (
                    <button
                      className="ghost small"
                      key={target.tool}
                      disabled={busy}
                      onClick={() => void syncProfile(profile, [target.tool])}
                    >
                      同步 {tools.find((tool) => tool.id === target.tool)?.name ?? target.tool}
                    </button>
                  ))}
                  <button className="ghost small" onClick={() => setEditing(fromView(profile))}>編輯</button>
                  <button className="danger small" onClick={() => setDeleteId(profile.id)}>刪除</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty profiles-empty">
          <strong>還沒有共用 Profile</strong>
          <span>新增一份，或從任何現有供應商一鍵建立。</span>
        </div>
      )}

      {editing ? (
        <Modal
          title={editing.id ? "編輯共用 Profile" : "新增共用 Profile"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <span className="muted small">{enabledTargetCount} 個工具將使用這份 Profile</span>
              <span className="spacer" />
              <button className="ghost" onClick={() => setEditing(null)} disabled={busy}>取消</button>
              <button className="primary" onClick={() => void save()} disabled={busy}>{busy ? "儲存中…" : "儲存 Profile"}</button>
            </>
          }
        >
          <div className="profile-form-grid">
            <div className="field"><label>名稱</label><input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="例：OpenCode Go" /></div>
            <div className="field"><label>Protocol</label><input value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value })} placeholder="responses / anthropic / openai" /></div>
            <div className="field profile-form-wide"><label>Base URL</label><input value={editing.base_url} onChange={(event) => setEditing({ ...editing, base_url: event.target.value })} placeholder="https://api.example.com/v1" /></div>
            <div className="field"><label>預設模型</label><input value={editing.model} onChange={(event) => setEditing({ ...editing, model: event.target.value })} placeholder="model-id" /></div>
            <div className="field"><label>標籤</label><input value={editing.tags.join(", ")} onChange={(event) => setEditing({ ...editing, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} placeholder="personal, fallback" /></div>
            <div className="field profile-form-wide">
              <label>API Key（留空保留現有）</label>
              <input type="password" value={editing.api_key} onChange={(event) => setEditing({ ...editing, api_key: event.target.value, clear_api_key: false })} placeholder={editing.id ? "•••• 已加密保存" : "sk-..."} />
              {editing.id ? <button type="button" className="linklike" onClick={() => setEditing({ ...editing, api_key: "", clear_api_key: !editing.clear_api_key })}>{editing.clear_api_key ? "取消清除金鑰" : "清除 Profile 金鑰"}</button> : null}
            </div>
            <div className="field profile-form-wide"><label>備註</label><input value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} placeholder="選填" /></div>
          </div>

          <div className="detail-subhead">要同步到哪些工具？</div>
          <div className="profile-target-editor">
            {tools.map((tool) => {
              const target = targetFor(editing, tool.id);
              return (
                <div className={`profile-target-row${target.enabled ? " enabled" : ""}`} key={tool.id}>
                  <label className="check">
                    <input type="checkbox" checked={target.enabled} onChange={(event) => updateTarget(tool.id, { enabled: event.target.checked })} />
                    <span><strong>{tool.name}</strong><small>{tool.blurb}</small></span>
                  </label>
                  <input
                    aria-label={`${tool.name} 模型映射`}
                    value={target.model}
                    disabled={!target.enabled}
                    placeholder={editing.model || "沿用預設模型"}
                    onChange={(event) => updateTarget(tool.id, { model: event.target.value })}
                  />
                  <input
                    aria-label={`${tool.name} protocol 映射`}
                    value={target.kind}
                    disabled={!target.enabled}
                    placeholder={tool.kind_choices[0] || "工具預設"}
                    onChange={(event) => updateTarget(tool.id, { kind: event.target.value })}
                  />
                </div>
              );
            })}
          </div>
          <p className="fineprint">同步只會建立或更新 kumoSwitch 內的供應商資料，不會立即改寫工具設定檔；仍需在該工具手動按「套用」確認變更預覽。金鑰會以本機安全儲存加密。</p>
        </Modal>
      ) : null}

      {deleteId ? (
        <Modal
          title="刪除共用 Profile？"
          onClose={() => setDeleteId(null)}
          footer={
            <>
              <button className="ghost" onClick={() => setDeleteId(null)}>取消</button>
              <button className="danger" onClick={() => void remove(deleteId)} disabled={busy}>確認刪除</button>
            </>
          }
        >
          <p>這只會刪除共用 Profile；已同步到各工具的供應商與實際設定檔會保留。</p>
        </Modal>
      ) : null}

      <div className="profiles-meta">
        <span>{profiles.length} 個 Profile</span>
        <span>{compactBytes(profiles.reduce((sum, profile) => sum + profile.models.length * 96, 0))} 模型中繼資料快取</span>
      </div>
    </section>
  );
}

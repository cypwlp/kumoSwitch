import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { HistoryMap, Provider, ToolView } from "../types";
import { ProviderTable, type TestState } from "./ProviderTable";
import { WarnIcon } from "./Icons";
import { HarnessIcon } from "./Marks";

interface PanelProps {
  tool: ToolView;
  activeProvider: Provider | null;
  previousProvider: Provider | null;
  rows: Provider[];
  total: number;
  filter: string;
  busy: boolean;
  tests: Record<string, TestState>;
  history: HistoryMap;
  searchRef: RefObject<HTMLInputElement>;
  onFilter: (value: string) => void;
  onReveal: () => void;
  onBackups: () => void;
  onAdd: () => void;
  onImportConfig: () => void;
  onImportCcSwitch: (providerId: string) => void;
  onRefreshCcSwitch: () => void;
  onImportCcSwitchBatch: (providerIds: string[]) => void;
  onMirrorCcSwitchRoute: () => void;
  onProxyMode: () => void;
  proxyAttached: boolean;
  upstreamProvider: Provider | null;
  upstreamModel: string;
  upstreamOptions: Provider[];
  onUpstream: (providerId: string, modelId: string) => void;
  onApply: (provider: Provider) => void;
  onReorder: (ids: string[]) => void;
  onSwitchModel: (provider: Provider, modelId: string) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onTest: (provider: Provider) => void;
  onPalette: () => void;
  onDiagnostics: () => void;
  onCheckUpdate: () => void;
  onOpenInstall: () => void;
  autoHealth: boolean;
  onToggleAutoHealth: () => void;
  autoModelSync: boolean;
  onToggleAutoModelSync: () => void;
  sort: "manual" | "name" | "recent";
  onSort: (value: "manual" | "name" | "recent") => void;
  simple: boolean;
  onSimple: (simple: boolean) => void;
  pinned: string[];
  onTogglePin: (provider: Provider) => void;
}

export function ToolPanel({
  tool,
  activeProvider,
  previousProvider,
  rows,
  total,
  filter,
  busy,
  tests,
  history,
  searchRef,
  onFilter,
  onReveal,
  onBackups,
  onAdd,
  onImportConfig,
  onImportCcSwitch,
  onRefreshCcSwitch,
  onImportCcSwitchBatch,
  onMirrorCcSwitchRoute,
  onProxyMode,
  proxyAttached,
  upstreamProvider,
  upstreamModel,
  upstreamOptions,
  onUpstream,
  onApply,
  onReorder,
  onSwitchModel,
  onEdit,
  onDelete,
  onTest,
  onPalette,
  onDiagnostics,
  onCheckUpdate,
  onOpenInstall,
  autoHealth,
  onToggleAutoHealth,
  autoModelSync,
  onToggleAutoModelSync,
  sort,
  onSort,
  simple,
  onSimple,
  pinned,
  onTogglePin,
}: PanelProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [ccSelected, setCcSelected] = useState<Set<string>>(new Set());
  const [codexManageOpen, setCodexManageOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const codexManageRef = useRef<HTMLDivElement>(null);
  const codexFlow = tool.id === "codex" && simple;
  const showProviderManager = !codexFlow || codexManageOpen;

  useEffect(() => {
    setCodexManageOpen(false);
  }, [tool.id, simple]);

  const openCodexProviderManager = () => {
    setCodexManageOpen(true);
    window.setTimeout(() => codexManageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const closeCodexProviderManager = () => {
    setCodexManageOpen(false);
    window.setTimeout(() => document.getElementById("codex-setup-flow")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  useEffect(() => {
    if (!moreOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !moreRef.current?.contains(event.target)) {
        setMoreOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMoreOpen(false);
      moreTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => moreMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const menuAction = (action: () => void) => () => {
    setMoreOpen(false);
    action();
  };

  const upstreamModelOptions = upstreamOptions.flatMap((provider) => {
    const models = (provider.models ?? [])
      .filter((model) => !model.archived && model.id.trim())
      .map((model) => ({ id: model.id, name: model.name || model.id }));
    if (provider.model.trim() && !models.some((model) => model.id === provider.model)) {
      models.unshift({ id: provider.model, name: provider.model });
    }
    if (provider.id === upstreamProvider?.id && upstreamModel && !models.some((model) => model.id === upstreamModel)) {
      models.unshift({ id: upstreamModel, name: upstreamModel });
    }
    return models.map((model) => ({ provider, model }));
  });

  return (
    <section className="panel" key={tool.id}>
      <header className="panel-head">
        <div className="title-row">
          <HarnessIcon id={tool.id} name={tool.name} size={34} />
          <h2>{tool.name}</h2>
          {codexFlow ? (
            <span className="badge subtle">GPT Plus 與其他模型</span>
          ) : (
            <>
              <span className="badge subtle">工具</span>
              <span className={`badge surface-badge ${tool.surface}`}>{tool.surface === "both" ? "CLI + 桌面版" : tool.surface === "desktop" ? "桌面版" : "CLI"}</span>
              <span className="muted">{tool.blurb}</span>
              {tool.verified ? (
                <span className="badge ok">格式已驗證</span>
              ) : (
                <span className="badge warn">格式未實測，請先看變更預覽</span>
              )}
            </>
          )}
        </div>
        {codexFlow ? null : (
          <div className="path-row">
            <code title="設定檔路徑">{tool.path}</code>
            <button className="ghost small" onClick={onReveal}>
              開啟資料夾
            </button>
            <span className="badge subtle">{tool.format}</span>
          </div>
        )}
      </header>

      {tool.takeover ? (
        <div className="banner warn">
          <strong>
            <WarnIcon /> 其他切換工具正在接管這個工具
          </strong>
          <span>偵測到代理模式啟用中，套用後可能被接管工具覆蓋。建議先切回直連模式。</span>
        </div>
      ) : null}

      {codexFlow ? (
        <section className="codex-setup-flow" id="codex-setup-flow" aria-labelledby="codex-setup-title">
          <div className="codex-setup-heading">
            <div>
              <span className="eyebrow">快速設定 · 3 步</span>
              <h3 id="codex-setup-title">讓 Codex 顯示 GPT Plus 和其他模型</h3>
              <p>照著流程做一次，之後直接在 Codex 的模型選單切換。</p>
            </div>
            <span className={`badge ${proxyAttached ? "ok" : "subtle"}`}>
              {proxyAttached ? "Codex 已連接" : "尚未連接"}
            </span>
          </div>
          <ol className="codex-setup-steps">
            <li className={`codex-setup-step ${total > 0 ? "complete" : ""}`}>
              <span className="codex-step-number">{total > 0 ? "✓" : "1"}</span>
              <div className="codex-step-copy">
                <strong>加入其他模型（可略過）</strong>
                <p>{total > 0 ? `KumoSwitch 已管理 ${total} 個供應商。` : "OpenCode 或 Command Code 模型要先加入；GPT Plus 不用填 API Key。"}</p>
              </div>
              <button className="ghost small" type="button" onClick={total > 0 ? openCodexProviderManager : onAdd}>
                {total > 0 ? "管理供應商" : "＋新增供應商"}
              </button>
            </li>
            <li className={`codex-setup-step ${proxyAttached ? "complete" : "active"}`}>
              <span className="codex-step-number">{proxyAttached ? "✓" : "2"}</span>
              <div className="codex-step-copy">
                <strong>連接 Codex 模型選單</strong>
                <p>{proxyAttached ? "已連接；模型會從 Codex 的模型選單切換。" : "啟用後，Codex 會列出 GPT Plus 和 KumoSwitch 已加入的模型。"}</p>
              </div>
              {proxyAttached ? <span className="badge ok">已完成</span> : (
                <button className="primary small" type="button" onClick={onProxyMode} disabled={busy}>
                  一鍵啟用
                </button>
              )}
            </li>
            <li className={`codex-setup-step ${proxyAttached ? "active" : ""}`}>
              <span className="codex-step-number">3</span>
              <div className="codex-step-copy">
                <strong>登入並重新開啟 Codex</strong>
                <p>GPT Plus 使用 ChatGPT 帳號登入；CLI 版可輸入 <code>/login</code>。啟用後重開 Codex 一次。</p>
              </div>
              <span className="badge subtle">最後一步</span>
            </li>
          </ol>
          <div className="codex-setup-footnote">
            <p>Plus 登入由 Codex 處理；供應商 API Key 留在 KumoSwitch。</p>
            <button className="linklike" type="button" onClick={() => onSimple(false)}>進階設定</button>
          </div>
        </section>
      ) : (
      <div className="current-strip">
        <div className="current-provider">
          <span className="eyebrow">{proxyAttached ? "即時切換中" : "目前套用"}</span>
          <strong>
            {proxyAttached
              ? upstreamProvider?.name || "本機代理"
              : activeProvider?.name || tool.current.model || "尚未選擇供應商"}
          </strong>
          {(proxyAttached ? upstreamModel : tool.current.model) ? (
            <span className="current-model">
              <span>{proxyAttached ? "路由模型" : "模型"}</span>
              <code>{proxyAttached ? upstreamModel : tool.current.model}</code>
            </span>
          ) : null}
          {proxyAttached ? (
            <div className="instant-controls">
              <span className="badge ok">連線方式：即時</span>
              {activeProvider?.codex_gateway ? (
                <span className="badge subtle" title="模型清單由 Codex 從 kumoSwitch 路由讀取">
                  在 Codex 模型選單切換
                </span>
              ) : (
                <select
                  className="mini-select"
                  aria-label="即時切換供應商與模型"
                  title="選擇已加入的供應商模型；只列出與目前 API 類型相容的模型"
                  value={upstreamProvider && upstreamModel ? JSON.stringify([upstreamProvider.id, upstreamModel]) : ""}
                  onChange={(event) => {
                    try {
                      const [providerId, modelId] = JSON.parse(event.target.value) as [string, string];
                      if (providerId && modelId) onUpstream(providerId, modelId);
                    } catch {
                      // Ignore malformed option values.
                    }
                  }}
                  disabled={busy || upstreamModelOptions.length === 0}
                >
                  {upstreamOptions.map((provider) => {
                    const models = upstreamModelOptions.filter((option) => option.provider.id === provider.id);
                    if (models.length === 0) return null;
                    return (
                      <optgroup key={provider.id} label={provider.name}>
                        {models.map(({ model }) => (
                          <option key={model.id} value={JSON.stringify([provider.id, model.id])}>
                            {model.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              )}
              <button type="button" className="ghost small" onClick={onProxyMode} disabled={busy}>
                代理設定
              </button>
            </div>
          ) : null}
        </div>
        <div className="current-meta">
          <span className="current-url mono" title={tool.current.base_url || "尚未設定 Base URL"}>
            {tool.current.base_url || "尚未設定 Base URL"}
          </span>
          <span>金鑰 {tool.current.api_key_tail || "—"}</span>
          {proxyAttached ? null : (
            <button className="small ghost" type="button" onClick={onProxyMode} disabled={busy} title="目前對話需重開一次；之後切換即時生效">
              改成即時切換
            </button>
          )}
          {previousProvider ? (
            <button className="ghost small" type="button" onClick={() => onApply(previousProvider)}>
              切回上一個供應商
            </button>
          ) : null}
        </div>
        <span className="current-restart">{tool.restart}</span>
      </div>
      )}

      {showProviderManager ? (
        <>
      {codexFlow ? (
        <div className="codex-manage-head" ref={codexManageRef}>
          <div>
            <h3>供應商與模型</h3>
            <p>管理 OpenCode、Command Code 和其他已加入的模型來源。</p>
          </div>
          <button className="ghost small" type="button" onClick={closeCodexProviderManager}>收起管理</button>
        </div>
      ) : null}
      {tool.cc_switch?.available && tool.cc_switch.providers.length ? (
        <p className="ccswitch-inline">
          <span className="ccswitch-mark">⇄</span>
          相容資料庫另有 {tool.cc_switch.providers.length} 個供應商
          <button
            type="button"
            className="linklike"
            onClick={() => {
              const el = document.getElementById("ccswitch-managed") as HTMLDetailsElement | null;
              if (!el) return;
              el.open = true;
              el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            查看／匯入
          </button>
        </p>
      ) : null}

      <div className="provider-list-head">
        <div>
          <h3>供應商 <span className="badge subtle">{total}</span></h3>
          {simple ? null : <p>先選供應商，再進入它的模型。模型是供應商底下的子項目。</p>}
        </div>
      </div>

      <div className="toolbar">
        <input
          ref={searchRef}
          className="search"
          type="search"
          placeholder="搜尋供應商名稱、URL 或模型…（按 / 聚焦）"
          autoComplete="off"
          value={filter}
          aria-label="篩選供應商"
          onChange={(event) => onFilter(event.target.value)}
        />
        <span className="muted small">
          {rows.length} / {total} 個供應商
        </span>
        <div className="spacer" />
        {simple ? null : (
          <select
            className="mini-select"
            value={sort}
            aria-label="排序方式"
            onChange={(event) => onSort(event.target.value as "manual" | "name" | "recent")}
          >
            <option value="manual">原始順序</option>
            <option value="name">依名稱</option>
            <option value="recent">最近使用</option>
          </select>
        )}
        {simple && total > 0 ? null : (
          <button
            className="ghost"
            onClick={onImportConfig}
            disabled={busy}
            title="讀取這個工具現有的設定檔，把裡面的供應商收進 kumoSwitch"
          >
            從設定檔導入
            {tool.importable > 0 ? <span className="cnt">{tool.importable}</span> : null}
          </button>
        )}
        <div className="segmented compact view-mode" role="group" aria-label="介面模式">
          <button type="button" className={simple ? "on" : ""} aria-pressed={simple} onClick={() => onSimple(true)}>簡單</button>
          <button type="button" className={!simple ? "on" : ""} aria-pressed={!simple} onClick={() => onSimple(false)}>進階</button>
        </div>
        <div className={`more${moreOpen ? " open" : ""}`} ref={moreRef}>
          <button
            ref={moreTriggerRef}
            type="button"
            className="ghost more-trigger"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-controls="harness-more-menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            更多
          </button>
          {moreOpen ? (
            <div className="more-menu" id="harness-more-menu" role="menu" ref={moreMenuRef}>
              <button type="button" role="menuitem" onClick={menuAction(onProxyMode)}>
                即時切換設定
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onPalette)}>
                快速切換 <kbd>Ctrl</kbd><kbd>K</kbd>
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onBackups)}>
                備份紀錄
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onDiagnostics)}>
                匯出診斷摘要
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onCheckUpdate)}>
                檢查更新
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onOpenInstall)}>
                開啟安裝／更新向導
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onToggleAutoHealth)}>
                {autoHealth ? "✓ 自動健康檢查（10 分鐘）" : "自動健康檢查（關）"}
              </button>
              <button type="button" role="menuitem" onClick={menuAction(onToggleAutoModelSync)}>
                {autoModelSync ? "✓ 自動模型同步（供應商排程）" : "自動模型同步（關）"}
              </button>
            </div>
          ) : null}
        </div>
        <button className="primary" onClick={onAdd} title="新增供應商 (Ctrl+N)">
          ＋ 新增供應商
        </button>
      </div>

      <ProviderTable
        rows={rows}
        total={total}
        tests={tests}
        history={history}
        activeId={tool.active_id}
        simple={simple}
        pinned={pinned}
        onTogglePin={onTogglePin}
        onAttemptReorder={(ids) => onReorder(ids)}
        onSwitchModel={onSwitchModel}
        onApply={onApply}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
      />

      {tool.cc_switch?.available ? (
        <details className="ccswitch-source" id="ccswitch-managed" open={simple ? undefined : true}>
          <summary>
            <div className="ccswitch-source-title">
              <span className="ccswitch-mark">⇄</span>
              <span>
                <strong>其他切換工具管理的供應商</strong>
                <em>來自本機相容資料庫，不是 Codex 實際 config.toml</em>
              </span>
            </div>
            <div className="ccswitch-source-badges">
              <span className={`badge ${tool.cc_switch.attached ? "warn" : "subtle"}`}>{tool.cc_switch.mode === "proxy" ? "代理／路由模式" : "相容資料庫"}</span>
              <span className="badge subtle">{tool.cc_switch.providers.length} 個</span>
              <span className="badge subtle">快取 {tool.cc_switch.last_refreshed ? new Date(tool.cc_switch.last_refreshed).toLocaleTimeString() : "—"}</span>
            </div>
          </summary>
          <div className="ccswitch-batch-bar">
            <button type="button" className="ghost small" onClick={onRefreshCcSwitch}>重新讀取資料庫</button>
            <span className="muted small">{ccSelected.size ? `已選 ${ccSelected.size} 個` : "逐項選取後可批次匯入或鏡像路由順序"}</span>
            <span className="spacer" />
            <button type="button" className="ghost small" disabled={!ccSelected.size} onClick={() => onImportCcSwitchBatch([...ccSelected])}>批次匯入</button>
            <button type="button" className="primary small" onClick={onMirrorCcSwitchRoute}>鏡像路由堆疊</button>
          </div>
          <div className="ccswitch-explainer">
            <p>
              {tool.cc_switch.attached && tool.cc_switch.mode === "proxy"
                ? "這個工具目前只把相容工具的本地代理位址寫進 config.toml，所以 kumoSwitch 會看到 custom／127.0.0.1，而不是底層供應商。下面列出的是相容資料庫裡實際被路由的供應商。"
                : "下面是相容資料庫中的供應商，和工具實際 config.toml 是兩份不同資料。"}
            </p>
            <code>{tool.cc_switch.db_path}</code>
          </div>
          {tool.cc_switch.error ? <div className="note error">{tool.cc_switch.error}</div> : null}
          {!tool.cc_switch.providers.length && !tool.cc_switch.error ? <div className="note">相容資料庫中目前沒有這個 App 的供應商。</div> : null}
          <div className="ccswitch-provider-grid">
            {tool.cc_switch.providers.map((provider) => (
              <article className="ccswitch-provider" key={provider.id}>
                <label className="ccswitch-select" title="選取這個供應商進行批次操作">
                  <input
                    type="checkbox"
                    checked={ccSelected.has(provider.id)}
                    onChange={(event) => setCcSelected((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(provider.id); else next.delete(provider.id);
                      return next;
                    })}
                  />
                  <span className="sr-only">選取 {provider.name}</span>
                </label>
                <div className="ccswitch-provider-head">
                  <span className="provider-avatar">{provider.name.slice(0, 1).toUpperCase()}</span>
                  <div><strong>{provider.name}</strong><span>{provider.category || provider.kind || "供應商"}</span></div>
                  <div className="ccswitch-provider-state">
                    {provider.is_current ? <span className="badge ok">路由中</span> : null}
                    {provider.in_failover_queue && !provider.is_current ? <span className="badge warn">候選</span> : null}
                  </div>
                </div>
                <code>{provider.base_url}</code>
                <div className="provider-model-list">
                  {provider.models.slice(0, 3).map((model) => <span className="provider-model-chip" key={model.id}>{model.name || model.id}</span>)}
                  {provider.models.length > 3 ? <span className="provider-model-more">+{provider.models.length - 3}</span> : null}
                </div>
                <div className="ccswitch-provider-foot">
                  <span>{provider.models.length} 個模型 · {provider.has_api_key ? "金鑰已保存" : "沒有金鑰"}</span>
                  <button type="button" className="ghost small" disabled={provider.already_imported} onClick={() => onImportCcSwitch(provider.id)}>
                    {provider.already_imported ? "已匯入" : "匯入 kumoSwitch"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </details>
      ) : null}

        </>
      ) : null}

    </section>
  );
}

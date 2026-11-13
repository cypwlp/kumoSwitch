import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorText, MOCK } from "./api";
import { hasLayer } from "./focus";
import { useTheme } from "./theme";
import { checkForUpdate, installUpdate, type UpdateCheck } from "./updater";
import type {
  AppInfo,
  BackupInfo,
  ExportResult,
  Preview,
  Provider,
  HistoryMap,
  ToolView,
  ImportCandidate,
  ImportDecision,
  EncryptedBackupInfo,
  ModelProfile,
} from "./types";
import { Rail } from "./components/Rail";
import { ToolPanel } from "./components/ToolPanel";
import { EditorModal } from "./components/EditorModal";
import { DiffModal } from "./components/DiffModal";
import { BackupModal } from "./components/BackupModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { ExportModal } from "./components/ExportModal";
import { EncryptedBackupModal } from "./components/EncryptedBackupModal";
import { ImportPreviewModal } from "./components/ImportPreviewModal";
import { CommandPalette } from "./components/CommandPalette";
import { Onboarding } from "./components/Onboarding";
import { StatsView } from "./components/StatsView";
import { ProxyView } from "./components/ProxyView";
import { DriftView } from "./components/DriftView";
import { Toasts, useToasts } from "./components/Toasts";
import type { TestState } from "./components/ProviderTable";

type ModalState =
  | { kind: "editor"; provider: Provider | null }
  | { kind: "diff"; tool: ToolView; provider: Provider; preview: Preview }
  | { kind: "backups"; backups: BackupInfo[] }
  | { kind: "export"; result: ExportResult; variant: "encrypted" | "diagnostics" }
  | { kind: "encrypted"; mode: "export" | "import"; fileName?: string }
  | { kind: "import-preview"; candidates: ImportCandidate[] }
  | null;

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<void>;
}

function hashTokens(): string[] {
  return window.location.hash.replace(/^#/, "").split(",").filter(Boolean);
}

export default function App() {
  const { mode, setMode } = useTheme();
  const { items: toasts, push } = useToasts();

  const [tools, setTools] = useState<ToolView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [toolFilter, setToolFilter] = useState("");
  const [filter, setFilter] = useState("");
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [history, setHistory] = useState<HistoryMap>({});
  const [autoHealth, setAutoHealth] = useState(false);
  const [autoModelSync, setAutoModelSync] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showProxy, setShowProxy] = useState(false);
  const [showDrift, setShowDrift] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [pendingImport, setPendingImport] = useState<{ text: string; name: string; info?: EncryptedBackupInfo } | null>(null);
  const [palette, setPalette] = useState(false);
  const [sort, setSort] = useState<"manual" | "name" | "recent">("manual");
  const [update, setUpdate] = useState<UpdateCheck>({ kind: "idle" });
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [onboarded, setOnboarded] = useState<boolean>(() => {
    if (MOCK) {
      return new URLSearchParams(window.location.search).get("onboarded") === "1";
    }
    try {
      let value = window.localStorage.getItem("kumoswitch.onboarded");
      if (value === null) {
        for (const legacyKey of ["switchtower.onboarded", "switchyard.onboarded"]) {
          const legacy = window.localStorage.getItem(legacyKey);
          if (legacy === "1") {
            window.localStorage.setItem("kumoswitch.onboarded", "1");
            value = legacy;
            break;
          }
        }
      }
      return value === "1";
    } catch {
      return false;
    }
  });
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => tools.find((t) => t.id === selectedId) ?? null,
    [tools, selectedId],
  );

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? providers.filter((p) =>
          [p.name, p.base_url, p.model, p.note, p.kind].join(" ").toLowerCase().includes(q),
        )
      : providers.slice();
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    if (sort === "recent") list.sort((a, b) => (b.last_used ?? 0) - (a.last_used ?? 0));
    return list;
  }, [providers, filter, sort]);

  /* ------------------------------------------------------------ loading */

  const refreshTools = useCallback(async () => {
    const list = await api.toolList();
    setTools(list);
    return list;
  }, []);

  const loadProviders = useCallback(async (toolId: string) => {
    const list = await api.providerList(toolId);
    setProviders(list);
    try {
      setHistory(await api.testHistory(toolId));
    } catch {
      setHistory({});
    }
    return list;
  }, []);

  const reload = useCallback(
    async (toolId: string) => {
      await refreshTools();
      await loadProviders(toolId);
    },
    [refreshTools, loadProviders],
  );

  const selectTool = useCallback(
    async (id: string, keepFilter = false) => {
      setSelectedId(id);
      if (!keepFilter) setFilter("");
      setTests({});
      try {
        await loadProviders(id);
      } catch (err) {
        push(errorText(err), "err");
      }
    },
    [loadProviders, push],
  );

  const openDiff = useCallback(
    async (toolId: string, provider: Provider) => {
      try {
        const preview = await api.preview(toolId, provider.id);
        if (preview.files.length === 0) {
          push("設定已是最新，沒有變更", "ok");
          return;
        }
        const tool = tools.find((item) => item.id === toolId);
        if (!tool) throw new Error("找不到這個 Harness");
        setModal({ kind: "diff", tool, provider, preview });
      } catch (err) {
        push(errorText(err), "err");
      }
    },
    [push, tools],
  );

  const openBackups = useCallback(
    async (toolId: string) => {
      try {
        const backups = await api.backupList(toolId);
        setModal({ kind: "backups", backups });
      } catch (err) {
        push(errorText(err), "err");
      }
    },
    [push],
  );

  /* --------------------------------------------------------------- boot */

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const appInfo = await api.appInfo();
        if (alive) {
          setInfo(appInfo);
          setAutoHealth(Boolean(appInfo.autoHealth));
          setAutoModelSync(Boolean(appInfo.autoModelSync));
        }
      } catch {
        /* version banner is optional */
      }
      let list: ToolView[] = [];
      try {
        list = await api.toolList();
        if (!alive) return;
        setTools(list);
      } catch (err) {
        push(errorText(err), "err");
        return;
      }

      const tokens = hashTokens();
      const needsCodex = tokens.some((t) => ["codex", "modal", "diff", "backup"].includes(t));
      if (!needsCodex || !alive) return;
      const codex = list.find((t) => t.id === "codex") ?? list[0];
      if (!codex) return;
      setSelectedId(codex.id);
      let seeded: Provider[] = [];
      try {
        seeded = await loadProviders(codex.id);
        if (!alive) return;
      } catch {
        return;
      }
      if (tokens.includes("modal")) setModal({ kind: "editor", provider: null });
      if (tokens.includes("diff")) {
        const target = seeded.find((p) => p.id !== codex.active_id) ?? seeded[0];
        if (target) await openDiff(codex.id, target);
      }
      if (tokens.includes("backup")) await openBackups(codex.id);
    })();
    return () => {
      alive = false;
    };
  }, [push, openDiff, openBackups]);

  /* ---------------------------------------------------------- shortcuts */

  const openEditor = useCallback((provider: Provider | null) => {
    setModal({ kind: "editor", provider });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setPalette((open) => !open);
        return;
      }
      if (hasLayer()) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === "n" || event.key === "N")) {
        if (!selectedId) return;
        event.preventDefault();
        openEditor(null);
        return;
      }
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        const typing =
          !!target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable);
        if (typing || !selectedId) return;
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, openEditor]);

  useEffect(() => {
    if (MOCK && hashTokens().includes("palette")) setPalette(true);
    if (MOCK && hashTokens().includes("stats")) setShowStats(true);
    if (MOCK && hashTokens().includes("proxy")) setShowProxy(true);
  }, []);

  const runUpdateCheck = useCallback(
    async (manual: boolean) => {
      const result = await checkForUpdate();
      setUpdate(result);
      if (manual) {
        if (result.kind === "none") push("已是最新版本", "ok");
        else if (result.kind === "available") push(`有新版本 ${result.version}`, "ok");
        else if (result.kind === "error") push(result.message, "err");
      }
    },
    [push],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void runUpdateCheck(false), 2500);
    return () => window.clearTimeout(timer);
  }, [runUpdateCheck]);

  /* ------------------------------------------- tray / cross-window events */

  useEffect(() => {
    if (MOCK) return;
    let dispose: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const offToast = await listen<{ text: string; kind: string }>("kumoswitch://toast", (event) => {
          push(event.payload.text, event.payload.kind === "err" ? "err" : "ok");
        });
        const offChanged = await listen("kumoswitch://changed", () => {
          void refreshTools();
          if (selectedId) void loadProviders(selectedId);
        });
        dispose = () => {
          offToast();
          offChanged();
        };
      } catch {
        /* not running inside Tauri */
      }
    })();
    return () => dispose?.();
  }, [push, refreshTools, loadProviders, selectedId]);

  /* ------------------------------------------------------------ actions */

  const saveProvider = async (payload: Provider, previewAfter = false) => {
    if (!selected) return;
    const toolId = selected.id;
    setBusy(true);
    try {
      const saved = await api.providerSave(toolId, payload);
      const list = await loadProviders(toolId);
      setModal(null);
      push(`已儲存「${saved.name}」`, "ok");
      const savedView = list.find((provider) => provider.id === saved.id);
      if (previewAfter && savedView) await openDiff(toolId, savedView);
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const rememberModelTest = (model: ModelProfile) => {
    if (modal?.kind !== "editor" || !modal.provider) return;
    const providerId = modal.provider.id;
    setProviders((current) => current.map((provider) => (
      provider.id === providerId
        ? { ...provider, models: (provider.models ?? []).map((item) => item.id === model.id ? model : item) }
        : provider
    )));
  };

  const switchProviderModel = async (modelId: string) => {
    if (!selected || modal?.kind !== "editor" || !modal.provider) return;
    const toolId = selected.id;
    const providerId = modal.provider.id;
    setBusy(true);
    try {
      const updated = await api.providerSelectModel(toolId, providerId, modelId);
      await loadProviders(toolId);
      setModal(null);
      push(`已選擇模型「${modelId}」，請確認 diff 後套用`, "ok");
      await openDiff(toolId, updated);
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const switchModelFromCard = async (provider: Provider, modelId: string) => {
    if (!selected || !modelId || modelId === provider.model) return;
    const toolId = selected.id;
    setBusy(true);
    try {
      const updated = await api.providerSelectModel(toolId, provider.id, modelId);
      await loadProviders(toolId);
      push(`${provider.name} → ${modelId}，請確認 diff`, "ok");
      await openDiff(toolId, updated);
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const reorderProviders = async (ids: string[]) => {
    if (!selected) return;
    try {
      setProviders(await api.providerReorder(selected.id, ids));
    } catch (err) {
      push(errorText(err), "err");
    }
  };

  const askDelete = (provider: Provider) => {
    if (!selected) return;
    const toolId = selected.id;
    setConfirm({
      title: "刪除供應商",
      message: `確定刪除「${provider.name}」？\n這只會刪除 kumoSwitch 裡的紀錄，不會改動你的設定檔。`,
      confirmLabel: "刪除",
      danger: true,
      run: async () => {
        await api.providerDelete(toolId, provider.id);
        push("已刪除", "ok");
        await reload(toolId);
      },
    });
  };

  const confirmApply = async () => {
    if (modal?.kind !== "diff") return;
    const toolId = modal.tool.id;
    setBusy(true);
    try {
      const result = await api.applyProvider(toolId, modal.provider.id);
      setModal(null);
      push(result.message, "ok");
      await reload(toolId);
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const askRestore = (backup: BackupInfo) => {
    if (!selected) return;
    const toolId = selected.id;
    setConfirm({
      title: "還原備份",
      message: `還原會用 ${backup.created} 這份備份覆蓋目前的設定檔，確定嗎？`,
      confirmLabel: "還原",
      danger: true,
      run: async () => {
        const files = await api.backupRestore(toolId, backup.id);
        setModal(null);
        push(`已還原：${files.join("、")}`, "ok");
        await reload(toolId);
      },
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await confirm.run();
      setConfirm(null);
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const runTest = async (provider: Provider) => {
    if (!selected) return;
    const toolId = selected.id;
    setTests((prev) => ({ ...prev, [provider.id]: "pending" }));
    try {
      const result = await api.testProvider(toolId, provider.id);
      setTests((prev) => ({ ...prev, [provider.id]: result }));
      const status = result.status > 0 ? String(result.status) : "連線失敗";
      push(`${provider.name}：${status} · ${result.ms}ms — ${result.message}`, result.ok ? "ok" : "err");
    } catch (err) {
      setTests((prev) => {
        const next = { ...prev };
        delete next[provider.id];
        return next;
      });
      push(errorText(err), "err");
    }
  };

  const importCcSwitchProvider = async (providerId: string) => {
    if (!selected) return;
    const toolId = selected.id;
    setBusy(true);
    try {
      const result = await api.importCcSwitchProvider(toolId, providerId);
      push(result.already_imported ? `「${result.provider.name}」已經在 kumoSwitch 中` : `已從 CC Switch 匯入「${result.provider.name}」`, "ok");
      await reload(toolId);
    } catch (error) {
      push(errorText(error), "err");
    } finally {
      setBusy(false);
    }
  };

  const scanConfig = async () => {
    setBusy(true);
    try {
      const candidates = await api.importScan();
      if (candidates.length === 0) {
        push("所有 Harness 都沒有找到可匯入的供應商", "ok");
        return;
      }
      setModal({ kind: "import-preview", candidates });
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const applyImport = async (decisions: ImportDecision[]) => {
    setBusy(true);
    try {
      const result = await api.importApply(decisions);
      setModal(null);
      push(`已匯入 ${result.imported} 筆，略過 ${result.skipped} 筆`, "ok");
      await refreshTools();
      if (selectedId) await loadProviders(selectedId);
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const exportList = () => {
    setModal({ kind: "encrypted", mode: "export" });
  };

  const readImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        const text = String(reader.result ?? "");
        if (file.name.toLowerCase().endsWith(".kumoswitch")) {
          try {
            const info = await api.inspectEncryptedBackup(text);
            setPendingImport({ text, name: file.name, info });
            setModal({ kind: "encrypted", mode: "import", fileName: file.name });
          } catch (err) {
            push(errorText(err), "err");
          }
          return;
        }
        try {
          const result = await api.importProvidersJson(text);
          push(`已匯入舊明文格式 ${result.imported} 筆，略過 ${result.skipped} 筆`, "ok");
          await refreshTools();
          if (selectedId) await loadProviders(selectedId);
        } catch (err) {
          push(errorText(err), "err");
        }
      })();
    };
    reader.onerror = () => push("讀取檔案失敗", "err");
    reader.readAsText(file);
  };

  const chooseSavePath = async (defaultName: string, extension: string): Promise<string | undefined | null> => {
    if (MOCK) return undefined;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      return await save({
        defaultPath: `${info?.dataDir || ""}/${defaultName}`,
        filters: [{ name: extension === "kumoswitch" ? "kumoSwitch backup" : "Text", extensions: [extension] }],
      });
    } catch (error) {
      push(errorText(error), "err");
      return null;
    }
  };

  const handleEncryptedSubmit = async (password: string) => {
    if (modal?.kind !== "encrypted") return;
    if (modal.mode === "export") {
      const destination = await chooseSavePath(`kumoswitch-backup-${Date.now()}.kumoswitch`, "kumoswitch");
      if (destination === null) return;
      const result = await api.exportProvidersEncrypted(password, destination || undefined);
      setModal({ kind: "export", result, variant: "encrypted" });
      return;
    }
    if (!pendingImport) throw new Error("找不到要匯入的備份檔");
    const result = await api.importProvidersEncrypted(pendingImport.text, password);
    setPendingImport(null);
    setModal(null);
    push(`已解密匯入 ${result.imported} 筆，略過 ${result.skipped} 筆`, "ok");
    await refreshTools();
    if (selectedId) await loadProviders(selectedId);
  };

  const reveal = async (toolId: string | null) => {
    if (!toolId) {
      push("請先選擇一個工具", "err");
      return;
    }
    try {
      await api.revealConfig(toolId);
    } catch (err) {
      push(errorText(err), "err");
    }
  };

  const rescan = async () => {
    setBusy(true);
    try {
      await refreshTools();
      if (selectedId) await loadProviders(selectedId);
      push("已重新掃描", "ok");
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const importMany = async (toolIds: string[]) => {
    setBusy(true);
    let total = 0;
    try {
      for (const id of toolIds) {
        const result = await api.importFromConfig(id);
        total += result.imported.length;
      }
      markOnboarded();
      await refreshTools();
      const first = toolIds[0];
      if (first) await selectTool(first, true);
      push(total > 0 ? `已導入 ${total} 個供應商` : "沒有新供應商可導入", "ok");
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const markOnboarded = () => {
    setOnboarded(true);
    try {
      window.localStorage.setItem("kumoswitch.onboarded", "1");
    } catch {
      /* ignore */
    }
  };

  const cloneProvider = async () => {
    if (!selected || modal?.kind !== "editor" || !modal.provider) return;
    setBusy(true);
    try {
      const copy = await api.providerClone(selected.id, modal.provider.id);
      await reload(selected.id);
      setModal(null);
      push(`已建立完整副本「${copy.name}」`, "ok");
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoModelSync = async () => {
    const next = !autoModelSync;
    try {
      await api.setAutoModelSync(next);
      setAutoModelSync(next);
      push(next ? "已開啟自動模型同步（每 24 小時）" : "已關閉自動模型同步", "ok");
    } catch (err) {
      push(errorText(err), "err");
    }
  };

  const toggleAutoHealth = async () => {
    const next = !autoHealth;
    try {
      await api.setAutoHealth(next);
      setAutoHealth(next);
      push(next ? "已開啟自動健康檢查（每 10 分鐘）" : "已關閉自動健康檢查", "ok");
    } catch (err) {
      push(errorText(err), "err");
    }
  };

  const diagnostics = async () => {
    try {
      const destination = await chooseSavePath(`kumoswitch-diagnostics-${Date.now()}.txt`, "txt");
      if (destination === null) return;
      const result = await api.exportDiagnostics(destination || undefined);
      push(`診斷已匯出（${result.count} 個供應商摘要）`, "ok");
      setModal({ kind: "export", result, variant: "diagnostics" });
    } catch (err) {
      push(errorText(err), "err");
    }
  };

  const startUpdate = async () => {
    setUpdating(true);
    setProgress(0);
    try {
      await installUpdate(setProgress);
    } catch (err) {
      push(errorText(err), "err");
      setUpdating(false);
    }
  };

  /* ------------------------------------------------------------- render */

  const showOnboarding =
    !onboarded && tools.length > 0 && tools.every((t) => t.provider_count === 0);

  return (
    <>
      <div className="app">
        <Rail
          tools={tools}
          selectedId={selectedId}
          filter={toolFilter}
          info={info}
          theme={mode}
          busy={busy}
          onFilter={setToolFilter}
          onSelect={(id) => { setShowDrift(false); setShowProxy(false); setShowStats(false); void selectTool(id); }}
          onRescan={() => void rescan()}
          onTheme={setMode}
          onExport={() => void exportList()}
          onImport={() => fileRef.current?.click()}
          statsActive={showStats}
          onStats={() => { setShowDrift(false); setShowProxy(false); setShowStats((v) => !v); }}
          proxyActive={showProxy}
          onProxy={() => { setShowDrift(false); setShowStats(false); setShowProxy((v) => !v); }}
          driftActive={showDrift}
          onDrift={() => { setShowProxy(false); setShowStats(false); setShowDrift((v) => !v); }}
        />

        <main className="main">
          {showDrift ? (
            <DriftView
              onError={(message) => push(message, "err")}
              onToast={(message, kind) => push(message, kind ?? "ok")}
              onOpenDiff={(toolId, provider) => void openDiff(toolId, provider)}
              onImport={() => void scanConfig()}
            />
          ) : showProxy ? (
            <ProxyView onError={(m) => push(m, "err")} onToast={(m, k) => push(m, k ?? "ok")} />
          ) : showStats ? (
            <StatsView onError={(m) => push(m, "err")} />
          ) : (
          <>
          {update.kind === "available" ? (
            <div className="update-bar">
              <span className="dot" />
              <span>
                有新版本 <strong>{update.version}</strong>
                {updating ? ` · 下載中 ${progress}%` : ""}
              </span>
              <div className="spacer" />
              {updating ? (
                <div className="progress">
                  <i style={{ width: `${progress}%` }} />
                </div>
              ) : (
                <>
                  <button className="ghost small" onClick={() => setUpdate({ kind: "idle" })}>
                    稍後
                  </button>
                  <button className="primary small" onClick={() => void startUpdate()}>
                    立即更新
                  </button>
                </>
              )}
            </div>
          ) : null}

          {selected ? (
            <ToolPanel
              key={selected.id}
              tool={selected}
              activeProvider={providers.find((provider) => provider.id === selected.active_id) ?? null}
              previousProvider={providers.find((provider) => provider.id === selected.previous_id) ?? null}
              rows={rows}
              total={providers.length}
              filter={filter}
              busy={busy}
              tests={tests}
              history={history}
              searchRef={searchRef}
              onFilter={setFilter}
              onReveal={() => void reveal(selected.id)}
              onBackups={() => void openBackups(selected.id)}
              onAdd={() => openEditor(null)}
              onImportConfig={() => void scanConfig()}
              onImportCcSwitch={(providerId) => void importCcSwitchProvider(providerId)}
              sort={sort}
              onSort={setSort}
              onPalette={() => setPalette(true)}
              onDiagnostics={() => void diagnostics()}
              onCheckUpdate={() => void runUpdateCheck(true)}
              onOpenInstall={() => void api.openInstallPage().catch((error) => push(errorText(error), "err"))}
              autoHealth={autoHealth}
              onToggleAutoHealth={() => void toggleAutoHealth()}
              autoModelSync={autoModelSync}
              onToggleAutoModelSync={() => void toggleAutoModelSync()}
              onApply={(p) => void openDiff(selected.id, p)}
              onReorder={(ids) => void reorderProviders(ids)}
              onSwitchModel={(provider, modelId) => void switchModelFromCard(provider, modelId)}
              onEdit={(p) => openEditor(p)}
              onDelete={askDelete}
              onTest={(p) => void runTest(p)}
            />
          ) : showOnboarding ? (
            <Onboarding
              tools={tools}
              busy={busy}
              onImport={importMany}
              onSkip={markOnboarded}
            />
          ) : (
            <div className="welcome">
              <div className="welcome-card">
                <h2>選擇左側的 Harness 開始</h2>
                <p>
                  kumoSwitch 只改寫供應商相關的那幾個鍵，
                  <br />
                  你的註解、外掛、MCP 與其他設定原樣保留。
                </p>
                <ul>
                  <li>套用前一定顯示逐行 diff</li>
                  <li>每次寫入自動建立時間戳備份，可一鍵還原</li>
                  <li>所有資料只留在本機</li>
                </ul>
                <div className="kbd-hint">
                  <kbd>/</kbd> 聚焦搜尋 · <kbd>Ctrl</kbd>+<kbd>N</kbd> 新增供應商 · 點擊供應商查看模型與設定 · 套用前先看 diff
                  {MOCK ? " · 預覽模式（假資料）" : ""}
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </main>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".kumoswitch,application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) readImportFile(file);
        }}
      />

      {palette ? (
        <CommandPalette
          tools={tools}
          onError={(message) => push(message, "err")}
          onClose={() => setPalette(false)}
          onPick={(tool, provider, model) => {
            setPalette(false);
            if (model && model.id !== provider.model) void switchModelFromCard(provider, model.id);
            else void openDiff(tool.id, provider);
          }}
        />
      ) : null}

      {modal?.kind === "editor" && selected ? (
        <EditorModal
          tool={selected}
          provider={modal.provider}
          history={modal.provider ? history[modal.provider.id] : undefined}
          busy={busy}
          onCancel={() => setModal(null)}
          onSave={(payload, previewAfter) => saveProvider(payload, previewAfter)}
          onSwitchModel={(modelId) => switchProviderModel(modelId)}
          onModelTested={rememberModelTest}
          onClone={() => void cloneProvider()}
        />
      ) : null}

      {modal?.kind === "diff" ? (
        <DiffModal
          tool={modal.tool}
          provider={modal.provider}
          preview={modal.preview}
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={() => void confirmApply()}
        />
      ) : null}

      {modal?.kind === "backups" && selected ? (
        <BackupModal
          tool={selected}
          backups={modal.backups}
          busy={busy}
          onClose={() => setModal(null)}
          onRestore={askRestore}
        />
      ) : null}

      {modal?.kind === "import-preview" ? (
        <ImportPreviewModal
          candidates={modal.candidates}
          busy={busy}
          onCancel={() => setModal(null)}
          onApply={applyImport}
        />
      ) : null}

      {modal?.kind === "encrypted" ? (
        <EncryptedBackupModal
          mode={modal.mode}
          fileName={modal.fileName}
          backupInfo={pendingImport?.info}
          onCancel={() => {
            setModal(null);
            setPendingImport(null);
          }}
          onSubmit={handleEncryptedSubmit}
        />
      ) : null}

      {modal?.kind === "export" ? (
        <ExportModal
          result={modal.result}
          variant={modal.variant}
          onClose={() => setModal(null)}
          onReveal={() => void api.revealPath(modal.result.path)}
        />
      ) : null}

      {confirm ? (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runConfirm()}
        />
      ) : null}

      <Toasts items={toasts} />
    </>
  );
}
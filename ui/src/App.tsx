import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorText, MOCK } from "./api";
import { hasLayer } from "./focus";
import { useTheme } from "./theme";
import type {
  AppInfo,
  BackupInfo,
  ExportResult,
  Preview,
  Provider,
  ToolView,
} from "./types";
import { Rail } from "./components/Rail";
import { ToolPanel } from "./components/ToolPanel";
import { EditorModal } from "./components/EditorModal";
import { DiffModal } from "./components/DiffModal";
import { BackupModal } from "./components/BackupModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { ExportModal } from "./components/ExportModal";
import { Toasts, useToasts } from "./components/Toasts";
import type { EditField, TestState } from "./components/ProviderTable";

type ModalState =
  | { kind: "editor"; provider: Provider | null }
  | { kind: "diff"; provider: Provider; preview: Preview }
  | { kind: "backups"; backups: BackupInfo[] }
  | { kind: "export"; result: ExportResult }
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
  const [modal, setModal] = useState<ModalState>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => tools.find((t) => t.id === selectedId) ?? null,
    [tools, selectedId],
  );

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) =>
      [p.name, p.base_url, p.model, p.note, p.kind].join(" ").toLowerCase().includes(q),
    );
  }, [providers, filter]);

  /* ------------------------------------------------------------ loading */

  const refreshTools = useCallback(async () => {
    const list = await api.toolList();
    setTools(list);
    return list;
  }, []);

  const loadProviders = useCallback(async (toolId: string) => {
    const list = await api.providerList(toolId);
    setProviders(list);
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
        setModal({ kind: "diff", provider, preview });
      } catch (err) {
        push(errorText(err), "err");
      }
    },
    [push],
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
        if (alive) setInfo(appInfo);
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
        seeded = await api.providerList(codex.id);
        if (!alive) return;
        setProviders(seeded);
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

  /* ------------------------------------------------------------ actions */

  const saveProvider = async (payload: Provider) => {
    if (!selected) return;
    setBusy(true);
    try {
      const saved = await api.providerSave(selected.id, payload);
      setModal(null);
      push(`已儲存「${saved.name}」`, "ok");
      await reload(selected.id);
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const inlineSave = async (provider: Provider, field: EditField, value: string) => {
    if (!selected) return;
    const next = value.trim();
    if (next === provider[field]) return;
    if (field !== "model" && !next) {
      push("名稱與 Base URL 不能空白", "err");
      return;
    }
    try {
      await api.providerSave(selected.id, { ...provider, [field]: next });
      push(`已更新「${next}」`, "ok");
      await reload(selected.id);
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLTableRowElement>(`tr[data-row="${provider.id}"]`)
          ?.focus({ preventScroll: true });
      });
    } catch (err) {
      push(errorText(err), "err");
    }
  };

  const askDelete = (provider: Provider) => {
    if (!selected) return;
    const toolId = selected.id;
    setConfirm({
      title: "刪除供應商",
      message: `確定刪除「${provider.name}」？\n這只會刪除 SwitchYard 裡的紀錄，不會改動你的設定檔。`,
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
    if (!selected || modal?.kind !== "diff") return;
    const toolId = selected.id;
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

  const importConfig = async () => {
    if (!selected) return;
    const toolId = selected.id;
    setBusy(true);
    try {
      const result = await api.importFromConfig(toolId);
      push(
        `從設定檔導入 ${result.imported.length} 筆，略過 ${result.skipped} 筆`,
        result.imported.length ? "ok" : "",
      );
      await reload(toolId);
    } catch (err) {
      push(errorText(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const exportList = async () => {
    try {
      const result = await api.exportProviders();
      setModal({ kind: "export", result });
    } catch (err) {
      push(errorText(err), "err");
    }
  };

  const readJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          const result = await api.importProvidersJson(String(reader.result ?? ""));
          push(`匯入 ${result.imported} 筆，略過 ${result.skipped} 筆`, "ok");
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

  /* ------------------------------------------------------------- render */

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
          onSelect={(id) => void selectTool(id)}
          onRescan={() => void rescan()}
          onTheme={setMode}
          onExport={() => void exportList()}
          onImport={() => fileRef.current?.click()}
        />

        <main className="main">
          {selected ? (
            <ToolPanel
              key={selected.id}
              tool={selected}
              rows={rows}
              total={providers.length}
              filter={filter}
              busy={busy}
              tests={tests}
              searchRef={searchRef}
              onFilter={setFilter}
              onReveal={() => void reveal(selected.id)}
              onBackups={() => void openBackups(selected.id)}
              onAdd={() => openEditor(null)}
              onImportConfig={() => void importConfig()}
              onApply={(p) => void openDiff(selected.id, p)}
              onEdit={(p) => openEditor(p)}
              onDelete={askDelete}
              onTest={(p) => void runTest(p)}
              onInlineSave={(p, field, value) => void inlineSave(p, field, value)}
            />
          ) : (
            <div className="welcome">
              <div className="welcome-card">
                <h2>選擇左側的工具開始</h2>
                <p>
                  SwitchYard 只改寫供應商相關的那幾個鍵，
                  <br />
                  你的註解、外掛、MCP 與其他設定原樣保留。
                </p>
                <ul>
                  <li>套用前一定顯示逐行 diff</li>
                  <li>每次寫入自動建立時間戳備份，可一鍵還原</li>
                  <li>所有資料只留在本機</li>
                </ul>
                <div className="kbd-hint">
                  <kbd>/</kbd> 聚焦搜尋 · <kbd>Ctrl</kbd>+<kbd>N</kbd> 新增供應商 ·{" "}
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> 移動列 · <kbd>Enter</kbd> 看 diff · <kbd>F2</kbd> 行內編輯
                  {MOCK ? " · 預覽模式（假資料）" : ""}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) readJsonFile(file);
        }}
      />

      {modal?.kind === "editor" && selected ? (
        <EditorModal
          tool={selected}
          provider={modal.provider}
          busy={busy}
          onCancel={() => setModal(null)}
          onSave={(payload) => void saveProvider(payload)}
        />
      ) : null}

      {modal?.kind === "diff" && selected ? (
        <DiffModal
          tool={selected}
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

      {modal?.kind === "export" ? (
        <ExportModal
          result={modal.result}
          onClose={() => setModal(null)}
          onReveal={() => void reveal(selectedId ?? tools[0]?.id ?? null)}
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
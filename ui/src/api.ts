import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { mockInvoke } from "./mock";
import type {
  AppInfo,
  ApplyResult,
  BackupInfo,
  ExportResult,
  ImportResult,
  JsonImportResult,
  Preview,
  Provider,
  TestResult,
  ToolView,
  HistoryMap,
} from "./types";

/** `?mock=1` runs the whole UI against the in-browser fake backend. */
export const MOCK = new URLSearchParams(window.location.search).get("mock") === "1";

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (MOCK) return mockInvoke(cmd, args) as Promise<T>;
  return tauriInvoke<T>(cmd, args);
}

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  toolList: () => call<ToolView[]>("tool_list"),
  providerList: (tool: string) => call<Provider[]>("provider_list", { tool }),
  providerSave: (tool: string, provider: Provider) => call<Provider>("provider_save", { tool, provider }),
  providerDelete: (tool: string, id: string) => call<void>("provider_delete", { tool, id }),
  preview: (tool: string, providerId: string) => call<Preview>("preview", { tool, providerId }),
  applyProvider: (tool: string, providerId: string) => call<ApplyResult>("apply_provider", { tool, providerId }),
  backupList: (tool: string) => call<BackupInfo[]>("backup_list", { tool }),
  backupRestore: (tool: string, id: string) => call<string[]>("backup_restore", { tool, id }),
  revealConfig: (tool: string) => call<void>("reveal_config", { tool }),
  importFromConfig: (tool: string) => call<ImportResult>("import_from_config", { tool }),
  testProvider: (tool: string, providerId: string) => call<TestResult>("test_provider", { tool, providerId }),
  testHistory: (tool: string) => call<HistoryMap>("test_history", { tool }),
  setAutoHealth: (enabled: boolean) => call<boolean>("set_auto_health", { enabled }),
  exportProviders: () => call<ExportResult>("export_providers"),
  exportDiagnostics: () => call<ExportResult>("export_diagnostics"),
  importProvidersJson: (text: string) => call<JsonImportResult>("import_providers_json", { text }),
};

export function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
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
  Preset,
  UsageReport,
  HealthOverview,
  ProxyConfig,
  ProviderConfigPreview,
  ImportCandidate,
  ImportDecision,
  ProxyMetrics,
  EncryptedBackupInfo,
  AuditEntry,
  ModelTestResult,
  LiveTestPolicy,
  ModelDiscovery,
  CcSwitchImportResult,
  ModelProfile,
  DriftReport,
  ProviderSearchRow,
} from "./types";

/** `?mock=1` runs the whole UI against the in-browser fake backend. */
export const MOCK = new URLSearchParams(window.location.search).get("mock") === "1";

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (MOCK) return mockInvoke(cmd, args) as Promise<T>;
  return tauriInvoke<T>(cmd, args);
}

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  openInstallPage: () => call<void>("open_install_page"),
  toolList: () => call<ToolView[]>("tool_list"),
  driftOverview: () => call<DriftReport[]>("drift_overview"),
  providerSearchIndex: () => call<ProviderSearchRow[]>("provider_search_index"),
  providerList: (tool: string) => call<Provider[]>("provider_list", { tool }),
  providerSave: (tool: string, provider: Provider) => call<Provider>("provider_save", { tool, provider }),
  providerClone: (tool: string, id: string) => call<Provider>("provider_clone", { tool, id }),
  importCcSwitchProvider: (tool: string, providerId: string) => call<CcSwitchImportResult>("import_cc_switch_provider", { tool, providerId }),
  revealProviderKey: (tool: string, id: string) => call<string>("reveal_provider_key", { tool, id }),
  providerConfigPreview: (tool: string, id: string) => call<ProviderConfigPreview[]>("provider_config_preview", { tool, id }),
  providerSelectModel: (tool: string, id: string, model: string) => call<Provider>("provider_select_model", { tool, id, model }),
  discoverModels: (tool: string, providerId: string) => call<ModelDiscovery>("discover_provider_models", { tool, providerId }),
  toggleModelFavorite: (tool: string, id: string, modelId: string, favorite: boolean) => call<ModelProfile>("toggle_model_favorite", { tool, id, modelId, favorite }),
  archiveModel: (tool: string, id: string, modelId: string, archived: boolean) => call<ModelProfile>("archive_model", { tool, id, modelId, archived }),
  providerReorder: (tool: string, ids: string[]) => call<Provider[]>("provider_reorder", { tool, ids }),
  providerDelete: (tool: string, id: string) => call<void>("provider_delete", { tool, id }),
  preview: (tool: string, providerId: string) => call<Preview>("preview", { tool, providerId }),
  applyProvider: (tool: string, providerId: string) => call<ApplyResult>("apply_provider", { tool, providerId }),
  backupList: (tool: string) => call<BackupInfo[]>("backup_list", { tool }),
  backupRestore: (tool: string, id: string) => call<string[]>("backup_restore", { tool, id }),
  revealConfig: (tool: string) => call<void>("reveal_config", { tool }),
  importFromConfig: (tool: string) => call<ImportResult>("import_from_config", { tool }),
  importScan: () => call<ImportCandidate[]>("import_scan"),
  importApply: (decisions: ImportDecision[]) => call<JsonImportResult>("import_apply", { decisions }),
  testProvider: (tool: string, providerId: string) => call<TestResult>("test_provider", { tool, providerId }),
  testModel: (tool: string, providerId: string, modelId: string) => call<ModelTestResult>("test_model", { tool, providerId, modelId }),
  liveTestModel: (tool: string, providerId: string, modelId: string) => call<ModelTestResult>("live_test_model", { tool, providerId, modelId }),
  liveTestPolicy: () => call<LiveTestPolicy>("live_test_policy"),
  setLiveTestPolicy: (dailyLimit: number, maxOutputTokens: number) => call<LiveTestPolicy>("set_live_test_policy", { dailyLimit, maxOutputTokens }),
  testHistory: (tool: string) => call<HistoryMap>("test_history", { tool }),
  setAutoHealth: (enabled: boolean) => call<boolean>("set_auto_health", { enabled }),
  setAutoModelSync: (enabled: boolean) => call<boolean>("set_auto_model_sync", { enabled }),
  usageReport: (days: number) => call<UsageReport>("usage_report", { days }),
  providerPresets: () => call<Preset[]>("provider_presets"),
  healthOverview: () => call<HealthOverview>("health_overview"),
  proxyStatus: () => call<ProxyConfig>("proxy_status"),
  proxyMetrics: () => call<ProxyMetrics>("proxy_metrics"),
  proxyResetMetrics: () => call<void>("proxy_reset_metrics"),
  proxySave: (config: ProxyConfig) => call<ProxyConfig>("proxy_save", { config }),
  proxyAttach: (tool: string) => call<ApplyResult>("proxy_attach", { tool }),
  exportProvidersEncrypted: (password: string, destination?: string) => call<ExportResult>("export_providers_encrypted", { password, destination }),
  exportDiagnostics: (destination?: string) => call<ExportResult>("export_diagnostics", { destination }),
  importProvidersJson: (text: string) => call<JsonImportResult>("import_providers_json", { text }),
  inspectEncryptedBackup: (text: string) => call<EncryptedBackupInfo>("inspect_encrypted_backup", { text }),
  importProvidersEncrypted: (text: string, password: string) => call<JsonImportResult>("import_providers_encrypted", { text, password }),
  revealPath: (path: string) => call<void>("reveal_path", { path }),
  auditLog: (limit: number) => call<AuditEntry[]>("audit_log", { limit }),
};

export function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
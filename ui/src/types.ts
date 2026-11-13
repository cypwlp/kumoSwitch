export type Fmt = "TOML" | "JSON" | "YAML" | "ENV";

export interface ModelCheck {
  ts: number;
  ok: boolean;
  ms: number;
  status: number;
}

export interface ModelProfile {
  id: string;
  name: string;
  context_window?: number;
  max_output?: number;
  reasoning?: boolean;
  vision?: boolean;
  tools?: boolean;
  metadata?: unknown;
  checks?: ModelCheck[];
  favorite?: boolean;
  last_used_at?: number;
  last_seen_at?: number;
  archived?: boolean;
}

export interface Provider {
  id: string;
  config_id: string;
  name: string;
  base_url: string;
  api_key: string;
  api_key_masked?: string;
  has_api_key?: boolean;
  clear_api_key?: boolean;
  model: string;
  models?: ModelProfile[];
  kind: string;
  note: string;
  /** Unix millis of the last successful apply. */
  last_used?: number;
  model_synced_at?: number;
  previous_model?: string;
  model_sync_interval_secs?: number;
  model_sync_jitter_secs?: number;
  model_sync_next_at?: number;
  model_sync_retry_at?: number;
  model_sync_failures?: number;
  model_sync_last_error?: string;
}

export interface CurrentState {
  base_url: string;
  model: string;
  api_key_tail: string;
  source: string;
}

export interface CcSwitchProviderView {
  id: string;
  name: string;
  base_url: string;
  model: string;
  models: ModelProfile[];
  kind: string;
  website_url: string;
  category: string;
  icon: string;
  icon_color: string;
  is_current: boolean;
  in_failover_queue: boolean;
  has_api_key: boolean;
  already_imported: boolean;
}

export interface CcSwitchSource {
  available: boolean;
  mode: string;
  attached: boolean;
  db_path: string;
  providers: CcSwitchProviderView[];
  error: string | null;
}

export interface ToolView {
  id: string;
  name: string;
  blurb: string;
  path: string;
  format: Fmt;
  verified: boolean;
  restart: string;
  detected: boolean;
  takeover: boolean;
  provider_count: number;
  active_id: string | null;
  previous_id: string | null;
  current: CurrentState;
  kind_choices: string[];
  importable: number;
  cc_switch: CcSwitchSource | null;
}

export interface ProviderSearchRow {
  tool: string;
  tool_name: string;
  provider: Provider;
}

export interface DriftReport {
  tool: string;
  tool_name: string;
  status: "clean" | "drifted" | "unmanaged" | "empty";
  active_id: string | null;
  expected_name: string | null;
  current_base_url: string;
  current_model: string;
  current_key_tail: string;
  expected_base_url: string;
  expected_model: string;
  expected_key_tail: string;
  changed_fields: string[];
  unmanaged_providers: string[];
  message: string;
}

export interface FileDiff {
  file: string;
  fmt: Fmt;
  existed: boolean;
  diff: string;
  added: number;
  removed: number;
}

export interface Preview {
  files: FileDiff[];
  warnings: string[];
  changed_fields: string[];
}

export interface ApplyResult {
  changed: boolean;
  backup_id: string | null;
  written: string[];
  message: string;
}

export interface BackupInfo {
  id: string;
  created: string;
  files: string[];
}

export interface TestResult {
  ok: boolean;
  status: number;
  ms: number;
  message: string;
}

export interface ModelTestResult {
  model: ModelProfile;
  result: TestResult;
}

export interface LiveTestPolicy {
  daily_limit: number;
  used_24h: number;
  remaining_24h: number;
  max_output_tokens: number;
}

export interface ModelDiscovery {
  models: ModelProfile[];
  missing: string[];
  endpoint: string;
  message: string;
}

export interface AppInfo {
  autoHealth?: boolean;
  autoModelSync?: boolean;
  version: string;
  dataDir: string;
  encrypted: boolean;
}

export interface CcSwitchImportResult {
  provider: Provider;
  already_imported: boolean;
}

export interface ImportResult {
  imported: Provider[];
  skipped: number;
}

export interface ExportResult {
  path: string;
  count: number;
  sha256?: string | null;
}

export interface AuditEntry {
  ts: number;
  action: string;
  detail: string;
  version: string;
}

export interface EncryptedBackupInfo {
  format: string;
  version: number;
  created_at: number;
  provider_count: number;
  plaintext_sha256: string;
  has_checksum: boolean;
}

export interface JsonImportResult {
  imported: number;
  skipped: number;
}

export interface ProviderConfigPreview {
  file: string;
  fmt: Fmt;
  content: string;
}

export type ImportAction = "skip" | "import" | "overwrite" | "merge" | "copy";

export interface ImportCandidate {
  tool: string;
  tool_name: string;
  config_id: string;
  name: string;
  base_url: string;
  model: string;
  models: ModelProfile[];
  kind: string;
  conflict: boolean;
  differences: string[];
}

export interface ImportDecision {
  tool: string;
  config_id: string;
  action: ImportAction;
}
export interface Sample {
  ts: number;
  ok: boolean;
  ms: number;
  status: number;
}

export interface HistorySummary {
  samples: Sample[];
  success_rate: number;
  avg_ms: number;
  last_ts: number;
  total: number;
}

export type HistoryMap = Record<string, HistorySummary>;

export interface Preset {
  id: string;
  name: string;
  base_url: string;
  kind: string;
  models: string[];
  docs: string;
  note: string;
}

export interface UsageRow {
  source: string;
  model: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  records: number;
  cost: number | null;
}

export interface DayRow { day: string; input: number; output: number; total: number; }

export interface UsageRoot {
  source: string;
  path: string;
  exists: boolean;
  files: number;
  scanned_files: number;
}

export interface UsageReport {
  rows: UsageRow[];
  days: DayRow[];
  files: number;
  records: number;
  total_input: number;
  total_output: number;
  total_cache: number;
  total_cost: number | null;
  days_scanned: number;
  roots: UsageRoot[];
  skipped_files: number;
  errors: string[];
  elapsed_ms: number;
}

export interface HealthOverview { tests: number; ok: number; avg_ms: number; providers_tested: number; }

export type RoutingStrategy = "ordered" | "priority" | "weighted" | "health";

export interface ProxyTargetPolicy {
  weight: number;
  priority: number;
  timeout_secs: number;
  failure_cooldown_secs: number;
  backoff_429_secs: number;
  failure_threshold: number;
  max_concurrency: number;
  allowed_models: string[];
  model_map: Record<string, string>;
}

export interface ProxyConfig {
  enabled: boolean;
  port: number;
  stack: string[];
  strategy: RoutingStrategy;
  policies: Record<string, ProxyTargetPolicy>;
}

export interface ProxyLogEntry {
  ts: number;
  target: string;
  event: string;
  status: number | null;
  ttfb_ms: number | null;
  message: string;
}

export interface TargetMetrics {
  active: number;
  requests: number;
  successes: number;
  failures: number;
  failovers: number;
  success_rate: number;
  consecutive_failures: number;
  circuit_open_until: number;
  last_ttfb_ms: number;
  avg_ttfb_ms: number;
  last_status: number;
  last_used: number;
}

export interface ProxyAttempt {
  target: string;
  order: number;
  outcome: "success" | "failed" | "timeout" | "rate_limited" | "server_error" | "skipped" | string;
  reason: string;
  status: number | null;
  ttfb_ms: number | null;
  circuit_open_until: number;
  model: string | null;
}

export interface ProxyTrace {
  id: number;
  ts: number;
  method: string;
  path: string;
  requested_model: string | null;
  strategy: string;
  candidate_order: string[];
  attempts: ProxyAttempt[];
  selected: string | null;
  final_status: number;
  total_ms: number;
  outcome: "success" | "failed" | string;
}

export interface ProxyMetrics {
  strategy: string;
  targets: Record<string, TargetMetrics>;
  logs: ProxyLogEntry[];
  traces: ProxyTrace[];
}

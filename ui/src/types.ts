export type Fmt = "TOML" | "JSON" | "YAML" | "ENV";

export interface ModelCheck {
  ts: number;
  ok: boolean;
  ms: number;
  status: number;
}

export interface ApiKeyView {
  id: string;
  label: string;
  fingerprint: string;
  created_at: number;
  expires_at: number;
  last_tested_at: number;
  last_ok_at: number;
  last_status: number;
  status: "active" | "standby" | "expired" | "retired" | string;
  note: string;
  active: boolean;
  expired: boolean;
}

export interface ApiKeyInput {
  provider_id: string;
  id?: string;
  label?: string;
  secret?: string;
  expires_at?: number;
  note?: string;
  activate?: boolean;
}

export interface KeyTestResult {
  key: ApiKeyView;
  result: TestResult;
}

export interface ModelProfile {
  id: string;
  name: string;
  context_window?: number;
  max_output?: number;
  reasoning?: boolean;
  reasoning_levels?: string[];
  reasoning_level?: string;
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
  profile_id?: string;
  api_keys?: ApiKeyView[];
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
  last_refreshed: number;
}

export interface CcSwitchBatchResult {
  imported: number;
  skipped: number;
  providers: Provider[];
}

export interface CcSwitchRouteResult {
  imported: number;
  stack: string[];
  providers: Provider[];
}

export interface ToolView {
  id: string;
  name: string;
  blurb: string;
  path: string;
  format: Fmt;
  verified: boolean;
  surface: "cli" | "desktop" | "both";
  reasoning_levels: string[];
  reasoning_target: string;
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
  tool: string;
  tool_name: string;
  reason: string;
  version: string;
  size_bytes: number;
  checksum: string;
}

export interface BackupPolicy {
  scheduled: boolean;
  interval_hours: number;
  keep: number;
  last_run: number;
}

export interface BackupStats {
  snapshots: number;
  tools: number;
  files: number;
  size_bytes: number;
  newest: string;
  oldest: string;
}

export interface BackupCenter {
  backups: BackupInfo[];
  stats: BackupStats;
  policy: BackupPolicy;
}

export interface PreUpdateBackupResult {
  snapshots: number;
  tools: number;
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
  guardian?: GuardianPolicy;
  backup?: BackupPolicy;
  updateChannel?: string;
  preUpdateBackup?: boolean;
  releaseChannel?: string;
  buildCommit?: string;
  signing?: string;
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
  category: "account" | "official" | "third_party" | "cloud" | "local" | "unified";
  auth_type: "api_key" | "oauth" | "local";
  icon: string;
  icon_color: string;
  website_url: string;
  requires_routing: boolean;
  login_hint: string;
}

export interface ModelReasoningDiscovery {
  levels: string[];
  default_level: string;
  source: "saved" | "catalog" | "harness" | "none" | string;
  supported: boolean;
  target: string;
  context_window: number | null;
  max_output: number | null;
  message: string;
}

export interface HarnessManagerEntry {
  id: string;
  name: string;
  blurb: string;
  surface: "cli" | "desktop" | "both";
  surface_label: string;
  config_path: string;
  config_dir: string;
  detected: boolean;
  cli_path: string | null;
  installed: boolean;
  website_url: string;
  docs_url: string;
  desktop_url: string | null;
  desktop_available: boolean;
  desktop_note: string;
  install_manager: string | null;
  install_package: string | null;
  install_command: string | null;
  installable: boolean;
}

export interface HarnessInstallResult {
  ok: boolean;
  command: string;
  output: string;
  exit_code: number;
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

export interface ProxyAlertRules {
  enabled: boolean;
  notify: boolean;
  min_requests: number;
  success_rate_below_pct: number;
  slow_ttfb_ms: number;
  cooldown_secs: number;
}

export interface ProxyConfig {
  enabled: boolean;
  port: number;
  stack: string[];
  strategy: RoutingStrategy;
  policies: Record<string, ProxyTargetPolicy>;
  alerts: ProxyAlertRules;
}

export interface ProxyAlert {
  id: number;
  ts: number;
  target: string;
  kind: string;
  severity: "warning" | "error" | string;
  message: string;
  value: string;
  circuit_open_until: number;
}

export interface ProxySummary {
  targets_configured: number;
  targets_reporting: number;
  requests: number;
  success_rate: number;
  avg_ttfb_ms: number;
  failovers: number;
  active_alerts: number;
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
  alerts: ProxyAlert[];
  summary: ProxySummary;
  rules: ProxyAlertRules;
}

export interface CompatibilityCheck {
  key: string;
  label: string;
  status: "ok" | "info" | "warn" | "fail" | string;
  detail: string;
}

export interface ModelCompatibility {
  tool: string;
  tool_name: string;
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  status: "compatible" | "warning" | "incompatible" | string;
  score: number;
  checks: CompatibilityCheck[];
  issues: string[];
}

export interface GuardianPolicy {
  enabled: boolean;
  auto_repair: boolean;
  notify: boolean;
  poll_secs: number;
  retention: number;
}

export interface GuardianFile {
  file: string;
  path: string;
  exists: boolean;
  modified_at: number;
  fingerprint: string;
}

export interface GuardianToolStatus {
  tool: string;
  tool_name: string;
  status: "clean" | "drifted" | "unmanaged" | "empty" | "error" | string;
  active_id: string | null;
  expected_name: string | null;
  current_base_url: string;
  current_model: string;
  current_key_tail: string;
  expected_base_url: string;
  expected_model: string;
  changed_fields: string[];
  unmanaged_providers: string[];
  message: string;
  actor: string;
  files: GuardianFile[];
  drift_signature: string;
  last_checked: number;
}

export interface GuardianEvent {
  id: string;
  ts: number;
  tool: string;
  tool_name: string;
  kind: string;
  status: string;
  severity: string;
  actor: string;
  changed_fields: string[];
  message: string;
  current_base_url: string;
  current_model: string;
  expected_name: string | null;
  file_modified_at: number;
}

export interface GuardianSummary {
  clean: number;
  drifted: number;
  unmanaged: number;
  empty: number;
  error: number;
  watched_tools: number;
}

export interface GuardianOverview {
  policy: GuardianPolicy;
  watching: boolean;
  last_scan: number;
  last_self_write: number;
  summary: GuardianSummary;
  statuses: GuardianToolStatus[];
  events: GuardianEvent[];
}

export interface SharedProfileTarget {
  tool: string;
  provider_id: string;
  model: string;
  kind: string;
  enabled: boolean;
  last_synced_at: number;
}

export interface SharedProfileView {
  id: string;
  name: string;
  base_url: string;
  kind: string;
  model: string;
  models: ModelProfile[];
  note: string;
  tags: string[];
  targets: SharedProfileTarget[];
  key_count: number;
  active_key_label: string;
  api_key_masked: string;
  has_api_key: boolean;
  created_at: number;
  updated_at: number;
}

export interface SharedProfileInput extends Omit<SharedProfileView, "key_count" | "active_key_label" | "api_key_masked" | "has_api_key" | "created_at" | "updated_at"> {
  api_key: string;
  clear_api_key: boolean;
}

export interface ProfileSyncItem {
  tool: string;
  provider_id: string;
  provider_name: string;
  model: string;
  created: boolean;
}

export interface ProfileSyncResult {
  profile_id: string;
  synced: ProfileSyncItem[];
  skipped: string[];
}

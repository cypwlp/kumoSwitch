export type Fmt = "TOML" | "JSON" | "YAML" | "ENV";

export interface Provider {
  id: string;
  config_id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  kind: string;
  note: string;
  /** Unix millis of the last successful apply. */
  last_used?: number;
}

export interface CurrentState {
  base_url: string;
  model: string;
  api_key_tail: string;
  source: string;
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
  current: CurrentState;
  kind_choices: string[];
  importable: number;
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

export interface AppInfo {
  autoHealth?: boolean;
  version: string;
  dataDir: string;
  encrypted: boolean;
}

export interface ImportResult {
  imported: Provider[];
  skipped: number;
}

export interface ExportResult {
  path: string;
  count: number;
}

export interface JsonImportResult {
  imported: number;
  skipped: number;
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
}

export interface HealthOverview { tests: number; ok: number; avg_ms: number; providers_tested: number; }

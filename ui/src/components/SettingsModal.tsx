import type { AppInfo } from "../types";
import type { ThemeMode } from "../theme";
import type { UpdateCheck } from "../updater";
import { AutoIcon, MoonIcon, SunIcon } from "./Icons";
import { Modal } from "./Modal";

interface SettingsModalProps {
  info: AppInfo | null;
  update: UpdateCheck;
  checking: boolean;
  updating: boolean;
  progress: number;
  theme: ThemeMode;
  autoHealth: boolean;
  autoModelSync: boolean;
  onTheme: (mode: ThemeMode) => void;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  onOpenInstall: () => void;
  onRevealDataDir: () => void;
  onToggleAutoHealth: () => void;
  onToggleAutoModelSync: () => void;
  onClose: () => void;
}

const THEMES: { mode: ThemeMode; label: string; icon: typeof MoonIcon }[] = [
  { mode: "dark", label: "暗色", icon: MoonIcon },
  { mode: "light", label: "亮色", icon: SunIcon },
  { mode: "system", label: "系統", icon: AutoIcon },
];

function updateStatus(update: UpdateCheck, checking: boolean) {
  if (checking) return "檢查中…";
  if (update.kind === "none") return "已是最新版本";
  if (update.kind === "available") return `有新版本 v${update.version}`;
  if (update.kind === "error") return "檢查失敗";
  return "尚未檢查";
}

export function SettingsModal({
  info,
  update,
  checking,
  updating,
  progress,
  theme,
  autoHealth,
  autoModelSync,
  onTheme,
  onCheckUpdate,
  onInstallUpdate,
  onOpenInstall,
  onRevealDataDir,
  onToggleAutoHealth,
  onToggleAutoModelSync,
  onClose,
}: SettingsModalProps) {
  const available = update.kind === "available";
  const status = updateStatus(update, checking);

  return (
    <Modal
      title="設定與更新"
      onClose={onClose}
      footer={
        <button className="ghost" onClick={onClose}>
          關閉
        </button>
      }
    >
      <div className="settings-grid">
        <section className="settings-card settings-update-card">
          <div className="settings-card-title">
            <span className="kicker">Application</span>
            <h4>版本與更新</h4>
          </div>
          <div className="settings-version-row">
            <div>
              <span className="settings-label">目前版本</span>
              <strong>v{info?.version ?? "—"}</strong>
            </div>
            <span className={`settings-status ${checking ? "checking" : update.kind}`}>{status}</span>
          </div>
          <p className="settings-help">
            手動向 GitHub Releases 查詢簽章更新。若自動更新不可用，也可以直接開啟安裝向導下載最新版。
          </p>
          {available ? (
            <div className="settings-release">
              <span>可用更新</span>
              <strong>v{update.version}</strong>
              {update.notes ? <small>{update.notes.slice(0, 180)}</small> : null}
            </div>
          ) : null}
          {update.kind === "error" ? <div className="note error">{update.message}</div> : null}
          <div className="settings-actions">
            <button className="primary" onClick={onCheckUpdate} disabled={checking || updating}>
              {checking ? "檢查中…" : "檢查更新"}
            </button>
            {available ? (
              <button className="primary" onClick={onInstallUpdate} disabled={updating}>
                {updating ? `更新中 ${progress}%` : "立即下載並更新"}
              </button>
            ) : null}
            <button className="ghost" onClick={onOpenInstall}>
              開啟安裝／更新向導
            </button>
          </div>
          {updating ? (
            <div className="settings-progress">
              <div className="progress"><i style={{ width: `${progress}%` }} /></div>
              <span>{progress}%</span>
            </div>
          ) : null}
        </section>

        <section className="settings-card">
          <div className="settings-card-title">
            <span className="kicker">Appearance</span>
            <h4>外觀</h4>
          </div>
          <div className="segmented settings-theme">
            {THEMES.map(({ mode, label, icon: Icon }) => (
              <button key={mode} className={theme === mode ? "on" : ""} onClick={() => onTheme(mode)} aria-pressed={theme === mode}>
                <Icon />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-title">
            <span className="kicker">Automation</span>
            <h4>自動化</h4>
          </div>
          <button className={`settings-toggle${autoHealth ? " on" : ""}`} onClick={onToggleAutoHealth} aria-pressed={autoHealth}>
            <span><strong>自動健康檢查</strong><small>每 10 分鐘檢查供應商可用性</small></span>
            <i aria-hidden="true" />
          </button>
          <button className={`settings-toggle${autoModelSync ? " on" : ""}`} onClick={onToggleAutoModelSync} aria-pressed={autoModelSync}>
            <span><strong>自動模型同步</strong><small>依供應商排程更新模型目錄</small></span>
            <i aria-hidden="true" />
          </button>
        </section>

        <section className="settings-card settings-data-card">
          <div className="settings-card-title">
            <span className="kicker">Local data</span>
            <h4>資料位置</h4>
          </div>
          <code className="settings-path">{info?.dataDir ?? "—"}</code>
          <button className="ghost small" onClick={onRevealDataDir} disabled={!info}>
            開啟資料夾
          </button>
        </section>
      </div>
      <p className="settings-footer-note">更新檔案由 GitHub Releases 提供；安裝前會驗證簽章。設定與 API Key 不會上傳。</p>
    </Modal>
  );
}
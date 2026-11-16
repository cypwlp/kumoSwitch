import type { AppInfo } from "../types";
import type { ThemeMode } from "../theme";
import type { UpdateCheck } from "../updater";
import type { Density, TextScale, UiPreferences } from "../preferences";
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
  preferences: UiPreferences;
  updateChannel: string;
  preUpdateBackup: boolean;
  onTheme: (mode: ThemeMode) => void;
  onPreferences: (patch: Partial<UiPreferences>) => void;
  onUpdateChannel: (channel: string) => void;
  onTogglePreUpdateBackup: () => void;
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
  preferences,
  updateChannel,
  preUpdateBackup,
  onTheme,
  onPreferences,
  onUpdateChannel,
  onTogglePreUpdateBackup,
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
          <div className="settings-update-preferences">
            <label className="field inline-field">
              <span>更新通道</span>
              <select value={updateChannel} onChange={(event) => onUpdateChannel(event.target.value)}>
                <option value="stable">Stable（自動更新）</option>
                <option value="beta">Beta（向導手動下載）</option>
              </select>
            </label>
            <button className={`settings-toggle compact${preUpdateBackup ? " on" : ""}`} onClick={onTogglePreUpdateBackup} aria-pressed={preUpdateBackup}>
              <span><strong>更新前備份</strong><small>先為所有偵測到的 Harness 建立設定快照</small></span><i aria-hidden="true" />
            </button>
          </div>
          <p className="settings-help">自動更新一律使用 Stable 的簽章清單；Beta 通道會開啟對應的預覽版安裝向導，避免預覽版誤推送給一般使用者。</p>
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
          <div className="settings-build-meta">
            <span>Build channel <strong>{info?.releaseChannel ?? "stable"}</strong></span>
            <span>Signing <strong>{info?.signing ?? "optional"}</strong></span>
            {info?.buildCommit ? <span>Commit <code>{info.buildCommit.slice(0, 12)}</code></span> : null}
          </div>
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

        <section className="settings-card settings-accessibility-card">
          <div className="settings-card-title">
            <span className="kicker">Accessibility</span>
            <h4>無障礙與閱讀</h4>
          </div>
          <button className={`settings-toggle${preferences.highContrast ? " on" : ""}`} onClick={() => onPreferences({ highContrast: !preferences.highContrast })} aria-pressed={preferences.highContrast}>
            <span><strong>高對比模式</strong><small>提高文字、邊框與焦點環的對比</small></span>
            <i aria-hidden="true" />
          </button>
          <button className={`settings-toggle${preferences.reduceMotion ? " on" : ""}`} onClick={() => onPreferences({ reduceMotion: !preferences.reduceMotion })} aria-pressed={preferences.reduceMotion}>
            <span><strong>降低動態效果</strong><small>停用非必要的過場與脈動動畫</small></span>
            <i aria-hidden="true" />
          </button>
          <div className="settings-choice-row">
            <span>文字大小</span>
            <div className="segmented compact" role="group" aria-label="文字大小">
              {([
                ["normal", "標準"],
                ["large", "大"],
                ["xlarge", "特大"],
              ] as [TextScale, string][]).map(([value, label]) => (
                <button key={value} className={preferences.textScale === value ? "on" : ""} aria-pressed={preferences.textScale === value} onClick={() => onPreferences({ textScale: value })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="settings-choice-row">
            <span>介面密度</span>
            <div className="segmented compact" role="group" aria-label="介面密度">
              {([
                ["comfortable", "舒適"],
                ["compact", "緊湊"],
              ] as [Density, string][]).map(([value, label]) => (
                <button key={value} className={preferences.density === value ? "on" : ""} aria-pressed={preferences.density === value} onClick={() => onPreferences({ density: value })}>{label}</button>
              ))}
            </div>
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
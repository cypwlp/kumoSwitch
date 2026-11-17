import { useState } from "react";
import type { AppInfo } from "../types";
import { ACCENTS, type Accent, type ThemeMode } from "../theme";
import type { UpdateCheck } from "../updater";
import type { Density, TextScale, UiMode, UiPreferences } from "../preferences";
import { AutoIcon, MoonIcon, SunIcon } from "./Icons";
import { LangToggle } from "./LangToggle";
import { t } from "../i18n";
import { Modal } from "./Modal";

interface SettingsModalProps {
  info: AppInfo | null;
  update: UpdateCheck;
  checking: boolean;
  updating: boolean;
  progress: number;
  theme: ThemeMode;
  accent: Accent;
  autoHealth: boolean;
  autoModelSync: boolean;
  preferences: UiPreferences;
  updateChannel: string;
  preUpdateBackup: boolean;
  ccSwitchBridge: boolean;
  onToggleCcSwitchBridge: (enabled: boolean) => void;
  onTheme: (mode: ThemeMode) => void;
  onAccent: (accent: Accent) => void;
  onPreferences: (patch: Partial<UiPreferences>) => void;
  onUpdateChannel: (channel: string) => void;
  onTogglePreUpdateBackup: () => void;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  onOpenInstall: () => void;
  onRevealDataDir: () => void;
  onOpenStats: () => void;
  onOpenProxy: () => void;
  onOpenGuardian: () => void;
  onOpenProfiles: () => void;
  onOpenBackups: () => void;
  onOpenHarnesses: () => void;
  onExport: () => void;
  onImport: () => void;
  onRescan: () => void;
  onScanConfigs: () => void;
  onOpenMigration: () => void;
  onOpenFeedback: () => void;
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
  accent,
  autoHealth,
  autoModelSync,
  preferences,
  updateChannel,
  preUpdateBackup,
  ccSwitchBridge,
  onToggleCcSwitchBridge,
  onTheme,
  onAccent,
  onPreferences,
  onUpdateChannel,
  onTogglePreUpdateBackup,
  onCheckUpdate,
  onInstallUpdate,
  onOpenInstall,
  onRevealDataDir,
  onOpenStats,
  onOpenProxy,
  onOpenGuardian,
  onOpenProfiles,
  onOpenBackups,
  onOpenHarnesses,
  onExport,
  onImport,
  onRescan,
  onScanConfigs,
  onOpenMigration,
  onOpenFeedback,
  onToggleAutoHealth,
  onToggleAutoModelSync,
  onClose,
}: SettingsModalProps) {
  const available = update.kind === "available";
  const status = updateStatus(update, checking);
  const [tab, setTab] = useState<"basic" | "advanced">("basic");

  return (
    <Modal
      title="設定與更新"
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onOpenFeedback}>{t("提供回饋")}</button>
          <button className="ghost" onClick={onClose}>{t("關閉")}</button>
        </>
      }
    >
      <div className="settings-tabs segmented compact" role="tablist" aria-label="設定分類">
        <button role="tab" aria-selected={tab === "basic"} className={tab === "basic" ? "on" : ""} onClick={() => setTab("basic")}>基本</button>
        <button role="tab" aria-selected={tab === "advanced"} className={tab === "advanced" ? "on" : ""} onClick={() => setTab("advanced")}>進階</button>
      </div>
      <div className={`settings-grid${tab === "basic" ? " settings-basic-grid" : ""}`}>
      {tab === "basic" ? (
        <>
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
              <span><strong>更新前備份</strong><small>先為所有偵測到的工具建立設定快照</small></span><i aria-hidden="true" />
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
          <div className="settings-choice-row theme-accent-row">
            <span>主題色</span>
            <div className="accent-swatches" role="group" aria-label="主題色">
              {ACCENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`accent-swatch${accent === item.id ? " on" : ""}`}
                  aria-pressed={accent === item.id}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => onAccent(item.id)}
                >
                  <i style={{ background: item.color }} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-choice-row">
            <span>介面模式</span>
            <div className="segmented compact" role="group" aria-label="介面模式">
              {([
                ["simple", "簡單"],
                ["advanced", "進階"],
              ] as [UiMode, string][]).map(([value, label]) => (
                <button key={value} className={preferences.uiMode === value ? "on" : ""} aria-pressed={preferences.uiMode === value} onClick={() => onPreferences({ uiMode: value })}>{label}</button>
              ))}
            </div>
          </div>
          <p className="settings-help">簡單模式只保留切換供應商需要的資訊；進階模式顯示健康度、協議、模型與批次工具。</p>
          <div className="settings-choice-row settings-language-row">
            <span>語言</span>
            <LangToggle />
          </div>
          <button className={`settings-toggle${preferences.quickApply ? " on" : ""}`} onClick={() => onPreferences({ quickApply: !preferences.quickApply })} aria-pressed={preferences.quickApply}>
            <span><strong>快速切換</strong><small>簡單模式略過變更預覽，直接備份並套用；可從通知復原</small></span>
            <i aria-hidden="true" />
          </button>
        </section>
        </>
      ) : (
        <>
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

        <section className="settings-card settings-nav-card">
          <div className="settings-card-title">
            <span className="kicker">Workspace</span>
            <h4>工具與頁面</h4>
          </div>
          <div className="settings-nav-grid">
            <button onClick={onOpenHarnesses}><strong>工具管理</strong><small>安裝、桌面版與設定位置</small></button>
            <button onClick={onOpenStats}><strong>用量統計</strong><small>Token、成本與掃描診斷</small></button>
            <button onClick={onOpenProxy}><strong>代理與路由</strong><small>故障轉移、路由與即時觀測</small></button>
            <button onClick={onOpenGuardian}><strong>設定守護</strong><small>漂移、時間線與自動修復</small></button>
            <button onClick={onOpenProfiles}><strong>共用 Profile</strong><small>跨工具重用供應商</small></button>
            <button onClick={onOpenBackups}><strong>備份中心</strong><small>版本、排程與遷移</small></button>
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

        <section className="settings-card">
          <div className="settings-card-title">
            <span className="kicker">Compatibility</span>
            <h4>相容匯入</h4>
          </div>
          <button className={`settings-toggle${ccSwitchBridge ? " on" : ""}`} onClick={() => onToggleCcSwitchBridge(!ccSwitchBridge)} aria-pressed={ccSwitchBridge}>
            <span><strong>讀取其他切換工具的本機資料</strong><small>預設關閉；只讀取本機 cc-switch.db，不上傳、不修改</small></span>
            <i aria-hidden="true" />
          </button>
          <p className="settings-help">
            開啟後才會顯示相容資料庫中的供應商。匯入前請自行確認第三方工具的使用條款；kumoSwitch 與任何第三方工具都沒有官方合作或背書關係。
          </p>
        </section>

        <section className="settings-card settings-data-card">
          <div className="settings-card-title">
            <span className="kicker">Data</span>
            <h4>資料管理</h4>
          </div>
          <div className="settings-data-actions">
            <button className="primary small" onClick={onOpenMigration}>搬家中心</button>
            <button className="ghost small" onClick={onExport}>匯出加密清單</button>
            <button className="ghost small" onClick={onImport}>匯入清單／遷移包</button>
            <button className="ghost small" onClick={onRescan}>重新掃描工具</button>
            <button className="ghost small" onClick={onScanConfigs}>掃描所有工具設定</button>
          </div>
          <span className="settings-label">本機資料位置</span>
          <code className="settings-path">{info?.dataDir ?? ""}</code>
          <button className="ghost small" onClick={onRevealDataDir} disabled={!info}>
            開啟資料夾
          </button>
        </section>
        </>
      )}
      </div>
      <p className="settings-footer-note">更新檔案由 GitHub Releases 提供；安裝前會驗證簽章。設定與 API Key 不會上傳。</p>
    </Modal>
  );
}
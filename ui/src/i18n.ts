/**
 * Runtime translation layer.
 *
 * The app is authored in Traditional Chinese; English is applied by walking the
 * rendered DOM and swapping known phrases. Doing it here (instead of threading a
 * `t()` through every component) also covers strings that come back from the
 * Rust side — restart hints, warnings, error messages — which would otherwise
 * stay Chinese in the English UI.
 */

export type Lang = "zh" | "zh-Hans" | "en";

const KEY = "kumoswitch.lang";
const LEGACY_KEYS = ["switchtower.lang", "switchyard.lang"];

const DICT: Record<string, string> = {
  "AI CLI 供應商切換": "AI CLI provider switcher",
  "AI Harness 供應商切換": "AI Harness provider switcher",
  "管理 AI Harness 供應商，不動其他一行設定。": "Manage AI Harness providers without touching another line.",
  "Harness 管理": "Harness management",
  "Harness 安裝與管理": "Harness setup & management",
  "Harness 安裝完成": "Harness install complete",
  "Harness 安裝未完成": "Harness install incomplete",
  "CLI + 桌面版": "CLI + desktop",
  "桌面版": "Desktop",
  "桌面版可取得": "Desktop available",
  "CLI 可用": "CLI available",
  "未找到 CLI": "CLI not found",
  "已偵測": "Detected",
  "未安裝": "Not installed",
  "帳號登入": "Account login",
  "模型廠商": "Model vendors",
  "第三方平台": "Third-party platforms",
  "雲服務商": "Cloud providers",
  "跨應用": "Cross-app",
  "需要路由": "Needs routing",
  "瀏覽供應商目錄": "Browse provider catalog",
  "使用自訂配置": "Use custom config",
  "搜尋名稱、Base URL、模型，例如 Kimi、OpenRouter…": "Search names, Base URLs or models, e.g. Kimi, OpenRouter…",
  "搜尋 Harness、套件或設定路徑…": "Search Harnesses, packages or config paths…",
  "安裝 CLI": "Install CLI",
  "更新 CLI": "Update CLI",
  "取得桌面版": "Get desktop app",
  "開啟設定位置": "Open config location",
  "官方網站": "Official website",
  "官方安裝說明": "Official install guide",
  "設定檔": "Config file",
  "套件": "Package",
  "安裝邊界": "Install scope",
  "執行固定命令": "Run fixed command",
  "安裝或更新": "Install or update",
  "Harness lifecycle": "Harness lifecycle",
  "搜尋目前供應商的模型": "Search models in this provider",
  "思考等級": "Thinking level",
  "目前選擇": "Current selection",
  "自動獲取模型資訊": "Fetch model information",
  "模型／Harness 預設": "Model / Harness default",
  "此 Harness 尚未支援寫入；等級仍會保存在模型資料": "This Harness cannot write the level yet; it will still be saved in model data",
  "進階能力與 Metadata": "Advanced capabilities & metadata",
  "候選思考等級（逗號分隔）": "Candidate thinking levels (comma-separated)",
  "測試模型目錄": "Test model catalogue",
  "真實模型實測": "Live model test",
  "封存模型": "Archive model",
  "移除模型": "Remove model",
  "kumoSwitch 只改寫供應商相關的那幾個鍵，": "kumoSwitch rewrites only the provider keys,",
  "你的註解、外掛、MCP 與其他設定原樣保留。": "your comments, plugins, MCP and other settings stay untouched.",
  "cc-switch 正在接管這個工具": "cc-switch is managing this tool",
  "偵測到代理模式啟用中，套用後可能被 cc-switch 覆蓋。建議先切回直連模式。":
    "Proxy mode is active, so cc-switch may overwrite what you apply. Switch it back to direct mode first.",
  "· 預覽模式（假資料）": "· preview mode (fake data)",
  "主題": "Theme",
  "亮色": "Light",
  "暗色": "Dark",
  "系統": "System",
  "以下工具已經有供應商設定。勾選後按一次匯入，kumoSwitch 會讀取設定檔建立清單，":
    "These tools already have provider settings. Pick the ones to read; kumoSwitch only creates its own list,",
  "不會改動你的設定檔": "your config files are not modified",
  "以下是實際會寫入的變更。只列出被修改的行；未列出的內容一個字都不會動。寫入前會自動建立時間戳備份。":
    "These are the exact changes. Only modified lines are shown; everything else stays byte-identical. A timestamped backup is created before writing.",
  "使用中": "In use",
  "例：OpenCode Go": "e.g. OpenCode Go",
  "例：glm-5.3-flash": "e.g. glm-5.3-flash",
  "依名稱": "By name",
  "最近使用": "Recently used",
  "原始順序": "Manual order",
  "健康度": "Health",
  "備註": "Note",
  "備份紀錄": "Backups",
  "先看 diff 再套用": "Review the diff before applying",
  "刪除": "Delete",
  "刪除供應商": "Delete provider",
  "動作": "Actions",
  "匯入中…": "Importing…",
  "匯入清單": "Import list",
  "匯出清單": "Export list",
  "匯出完成": "Export complete",
  "匯出診斷摘要": "Export diagnostics",
  "協議": "Protocol",
  "類型": "Type",
  "取消": "Cancel",
  "另存為副本": "Save as copy",
  "名稱": "Name",
  "模型": "Model",
  "此供應商的模型": "Models in this provider",
  "協議／類型": "Protocol / type",
  "進入供應商詳情": "Open provider details",
  "開啟安裝／更新向導": "Open install / update guide",
  "供應商是獨立的 endpoint＋金鑰；模型是供應商底下的子項目。先選供應商，再進入它的模型。": "A provider is an endpoint plus credentials. Models belong to that provider; select the provider first, then open its models.",
  "名稱與 Base URL 不能空白": "Name and Base URL cannot be empty",
  "套用": "Apply",
  "套用前一定顯示逐行 diff": "Always shows a line-by-line diff first",
  "完成": "Done",
  "尚未安裝或沒有設定目錄": "Not installed (no config directory)",
  "已偵測到設定目錄": "Config directory found",
  "工具清單": "Tools",
  "已刪除": "Deleted",
  "已加密": "Encrypted",
  "已是最新版本": "Already up to date",
  "已複製": "Copied",
  "已重新掃描": "Rescanned",
  "待用": "Idle",
  "必須包含路徑前綴（多數供應商要 /v1）": "Include the path prefix (most providers need /v1)",
  "快速切換": "Quick switch",
  "所有資料只留在本機": "All data stays on this machine",
  "把你現有的供應商收進來": "Bring in the providers you already have",
  "把所有供應商匯出成 JSON": "Export every provider as JSON",
  "排序方式": "Sort order",
  "搜尋供應商": "Search providers",
  "新增供應商": "Add provider",
  "新增供應商 (Ctrl+N)": "Add provider (Ctrl+N)",
  "更多": "More",
  "設定與更新": "Settings & updates",
  "版本與更新": "Version & updates",
  "目前版本": "Current version",
  "尚未檢查": "Not checked yet",
  "檢查失敗": "Check failed",
  "外觀": "Appearance",
  "自動化": "Automation",
  "自動健康檢查": "Automatic health checks",
  "每 10 分鐘檢查供應商可用性": "Check provider availability every 10 minutes",
  "依供應商排程更新模型目錄": "Refresh model catalogues on each provider's schedule",
  "資料位置": "Data location",
  "更新來源尚未發佈（或網路不可達）": "Update source not published yet (or network unreachable)",
  "未加密": "Not encrypted",
  "未測試": "Untested",
  "查看 diff": "View diff",
  "格式已驗證": "Format verified",
  "格式未實測，請先看 diff": "Format unverified — check the diff first",
  "檔案不存在，將新建": "File missing, will be created",
  "檢查更新": "Check for updates",
  "歡迎使用 kumoSwitch": "Welcome to kumoSwitch",
  "此環境不支援自動更新": "Auto-update is unavailable here",
  "每次寫入自動建立時間戳備份，可一鍵還原": "A timestamped backup is taken before every write, restorable in one click",
  "沒有可安裝的更新": "No update to install",
  "沒有新供應商可導入": "No new providers to import",
  "沒有符合條件的供應商": "No providers match",
  "沒有符合的供應商": "No matching providers",
  "沒有符合的工具": "No matching tools",
  "清空搜尋框可看全部": "Clear the search box to see everything",
  "測試": "Test",
  "測試中": "Testing",
  "狀態": "Status",
  "狀態來源": "Read from",
  "用目前欄位內容建立一個新供應商": "Create a new provider from these values",
  "由工具介面選擇": "Chosen inside the tool",
  "略過，稍後再說": "Skip for now",
  "目前 Base URL": "Current base URL",
  "目前狀態是從這個鍵讀出來的": "Which key this state was read from",
  "目前金鑰": "Current key",
  "直接編輯欄位": "Edit the field directly",
  "看 diff ·": "View diff ·",
  "移動": "Move",
  "移動列 ·": "Move rows ·",
  "稍後": "Later",
  "立即更新": "Update now",
  "第一次啟動": "First run",
  "篩選供應商": "Filter providers",
  "篩選工具": "Filter tools",
  "篩選工具…": "Filter tools…",
  "編輯供應商": "Edit provider",
  "聚焦搜尋 ·": "Focus search ·",
  "複製路徑": "Copy path",
  "設定已是最新，沒有變更": "Configuration already up to date",
  "設定檔路徑": "Config path",
  "請先選擇一個工具": "Pick a tool first",
  "讀取檔案失敗": "Could not read the file",
  "讀取這個工具現有的設定檔，把裡面的供應商收進 kumoSwitch":
    "Read this tool's config file and pull its providers into kumoSwitch",
  "跳到任何供應商…（輸入名稱、模型或工具）": "Jump to any provider… (name, model or tool)",
  "輸入即篩：名稱、URL、模型…（按 / 聚焦）": "Type to filter… (press /)",
  "送一個最小請求測試這組 Base URL / API Key": "Send one tiny request to test this base URL and key",
  "這個工具還沒有備份": "No backups for this tool yet",
  "連線失敗": "Connection failed",
  "選填": "Optional",
  "選擇左側的工具開始": "Pick a tool on the left",
  "還原備份": "Restore backup",
  "還沒有任何供應商": "No providers yet",
  "還沒有供應商": "No providers yet",
  "重啟": "Restart",
  "重新掃描": "Rescan",
  "重新掃描設定檔": "Rescan config files",
  "開啟工具資料夾": "Open tool folder",
  "開啟目前工具的設定資料夾": "Open this tool's config folder",
  "開啟資料夾": "Open folder",
  "開始新增供應商": "Start adding a provider",
  "關閉": "Close",
  "關閉 (Esc)": "Close (Esc)",
  "隱藏": "Hide",
  "顯示": "Show",
  "雙擊或按 F2 直接編輯": "Double-click or press F2 to edit",
  "點右上「＋ 新增供應商」，填入 Base URL 與 API Key 即可":
    "Use “+ Add provider” above and fill in the base URL and API key",
  "＋ 新增供應商": "+ Add provider",
  "供應商": "Providers",
  "個供應商": "providers",
  "有新版本": "Update available",
  "行內編輯": "inline edit",
  "統計": "Stats",
  "代理": "Proxy",
  "代理／故障轉移": "Proxy / failover",
  "本地反向代理，依序備援；Beta": "Local reverse proxy with ordered failover; beta",
  "啟用代理": "Enable proxy",
  "連接埠": "Port",
  "備援順序（勾選加入，順序即故障轉移順序）": "Failover order (check to add; order = failover order)",
  "把工具掛載到代理": "Attach a tool to the proxy",
  "選擇工具…": "Choose a tool…",
  "還沒有供應商，先到各工具新增或導入": "No providers yet; add or import them first",
  "統計儀表板": "Usage dashboard",
  "串流讀取 Claude Code／Codex 本機 session log，只在本機計算": "Streams local Claude Code / Codex session logs; computed on-device",
  "輸入 tokens": "Input tokens",
  "輸出 tokens": "Output tokens",
  "快取 tokens": "Cached tokens",
  "估算成本": "Est. cost",
  "用量記錄": "Usage records",
  "掃描檔案": "Files scanned",
  "連線測試次數": "Connection tests",
  "測試成功率": "Test success rate",
  "平均延遲": "Avg latency",
  "已測供應商": "Providers tested",
  "每日用量（近 30 天）": "Daily usage (last 30 days)",
  "依模型": "By model",
  "來源": "Source",
  "筆數": "Records",
  "未定價": "unpriced",
  "從預設選擇（選完仍可修改）": "Pick a preset (editable afterwards)",
  "選擇一個已知供應商…": "Choose a known provider…",
  "成本為公開單價估算（每百萬 token），非帳單金額；未列入價目表的模型顯示「未定價」。": "Costs are public-rate estimates per million tokens, not invoices; models without a price show “unpriced”.",
  "掃描 session log 中…": "Scanning session logs…",
  "正在串流掃描 session log…": "Streaming session logs…",
  "掃描診斷": "Scan diagnostics",
  "已掃描檔案": "Files scanned",
  "找不到 session log": "No session logs found",
  "找到 log，但沒有可解析的 token 用量": "Logs found, but no parseable token usage",
  "再試一次": "Try again",
  "沒有可顯示的統計": "No statistics to show",
  "這個範圍內沒有用量記錄": "No usage records in this range",
  "已開啟自動健康檢查（每 10 分鐘）": "Auto health checks on (every 10 min)",
  "已關閉自動健康檢查": "Auto health checks off",
  "自動健康檢查（關）": "Auto health checks (off)",
  "✓ 自動健康檢查（10 分鐘）": "✓ Auto health checks (10 min)",
  "Qoder CLI 自訂模型": "Qoder CLI custom models",
  "需要重開終端": "Restart your terminal",
  "需要重開終端或 Codex 才會生效": "Restart your terminal or Codex to take effect",
  "Claude Code 支援熱切換，新開的 session 即生效": "Claude Code hot-reloads; new sessions pick it up",
  "改完在 Qoder 重新載入模型設定": "Reload the model settings inside Qoder",
  "需要重開 DSH 桌面端": "Restart the DSH desktop app",
  "從設定檔導入": "Import from config",
  "此供應商未填模型": "This provider has no model",
  "同一組 Base URL／Key／模型可以橫跨多個工具重複使用": "One base URL / key / model can be reused across tools",
  "下載中": "Downloading",
  "加密匯出供應商": "Encrypted provider export",
  "匯入加密備份": "Import encrypted backup",
  "建立加密備份": "Create encrypted backup",
  "解密並匯入": "Decrypt & import",
  "備份密碼": "Backup password",
  "再次輸入密碼": "Confirm password",
  "至少 8 個字元": "At least 8 characters",
  "密碼至少需要 8 個字元": "Password must be at least 8 characters",
  "備份密碼至少需要 8 個字元": "Backup password must be at least 8 characters",
  "兩次輸入的密碼不一致": "The passwords do not match",
  "加密備份完成": "Encrypted backup complete",
  "診斷匯出完成": "Diagnostics export complete",
  "備份會使用 Argon2id 派生金鑰並以 AES-256-GCM 加密。密碼不會儲存，遺失後無法找回。":
    "The backup uses an Argon2id-derived key and AES-256-GCM encryption. The password is not stored and cannot be recovered.",
  "輸入建立這份備份時設定的密碼。若密碼錯誤，檔案不會被修改。":
    "Enter the password used when this backup was created. A wrong password leaves everything unchanged.",
  "留空會保留現有金鑰；按「查看」才會把完整金鑰載入編輯器。":
    "Leave blank to keep the current key; only “View” loads the full key into the editor.",
  "儲存後會移除這個供應商的 API Key。": "Saving will remove this provider's API key.",
  "金鑰會以系統安全儲存加密後留在本機。": "The key is encrypted with system secure storage and stays on this machine.",
  "查看": "View",
  "清除金鑰": "Clear key",
  "保留金鑰": "Keep key",
  "讀取中…": "Reading…",
  "儲存後清除": "Clear on save",
  "已儲存": "Stored",
  "建立一份包含 API Key 的完整副本": "Create a complete copy including the API key",
  "開啟所在資料夾": "Open containing folder",
  "把所有供應商加密匯出成 .kumoswitch": "Export every provider as an encrypted .kumoswitch backup",
  "從 .kumoswitch 加密備份或舊 JSON 匯入供應商": "Import an encrypted .kumoswitch backup or legacy JSON",
  "篩選 Harness…": "Filter Harnesses…",
  "篩選 Harness": "Filter Harnesses",
  "Harness 清單": "Harness list",
  "選擇左側的 Harness 開始": "Choose a Harness on the left",
  "點擊供應商查看模型與設定 · 套用前先看 diff": "Click a provider to view its model and settings · review the diff before applying",
  "目前套用": "Currently applied",
  "尚未選擇供應商": "No provider selected",
  "尚未設定 Base URL": "No base URL configured",
  "未指定，沿用 Harness 目前模型": "Not specified; inherits the Harness model",
  "查看模型與連線設定": "View model and connection settings",
  "重新套用": "Reapply",
  "cc-switch 正在接管這個 Harness": "cc-switch is managing this Harness",
  "供應商詳情": "Provider details",
  "套用後 Harness 會使用這個模型；可從預設清單快速選取或自行輸入。":
    "The Harness will use this model after applying. Pick a suggested model or enter one manually.",
  "搜尋供應商名稱、URL 或模型…（按 / 聚焦）": "Search provider name, URL or model… (press /)",
  "讀取這個 Harness 現有的設定檔，把裡面的供應商收進 kumoSwitch":
    "Read this Harness config and import its providers into kumoSwitch",
  "概覽": "Overview",
  "連線": "Connection",
  "紀錄": "History",
  "原始設定": "Raw config",
  "已知模型": "known models",
  "管理模型": "Manage models",
  "編輯連線": "Edit connection",
  "目前模型": "Current model",
  "設為目前": "Use this model",
  "新增模型": "Add model",
  "從預設加入模型": "Add preset models",
  "選擇供應商預設…": "Choose a provider preset…",
  "顯示名稱": "Display name",
  "移除": "Remove",
  "只儲存": "Save only",
  "儲存並預覽": "Save & preview",
  "建立供應商": "Create provider",
  "放棄未儲存的變更？": "Discard unsaved changes?",
  "放棄變更": "Discard changes",
  "最近備份": "Recent backups",
  "敏感操作稽核": "Sensitive-operation audit",
  "測試與變更紀錄": "Tests and change history",
  "套用後設定": "Configuration after applying",
  "還沒有模型。新增模型，或從供應商預設加入。": "No models yet. Add one or choose a provider preset.",
  "還沒有測試紀錄。": "No test history yet.",
  "還沒有備份紀錄。": "No backups yet.",
  "還沒有稽核紀錄。": "No audit entries yet.",
  "衝突處理": "Conflict handling",
  "衝突處理方式": "Conflict policy",
  "全部保留本機": "Keep all local",
  "全部合併模型": "Merge all models",
  "全部用設定檔覆蓋": "Overwrite all from config",
  "全部建立副本": "Create copies for all",
  "已存在": "Existing",
  "保留本機": "Keep local",
  "匯入為新項目": "Import as new",
  "合併模型": "Merge models",
  "以設定檔覆蓋": "Overwrite from config",
  "建立副本": "Create copy",
  "沒有找到可匯入的供應商。": "No importable providers were found.",
  "路由策略": "Routing strategy",
  "固定順序": "Ordered",
  "優先級": "Priority",
  "加權分配": "Weighted",
  "健康優先": "Health first",
  "照勾選順序逐一嘗試": "Try selected targets in order",
  "priority 高的先使用": "Use the highest priority first",
  "依 weight 平衡請求": "Balance requests by weight",
  "成功率高、延遲低者優先": "Prefer higher success rates and lower latency",
  "供應商順序與個別策略": "Provider order and policies",
  "未加入": "Not in stack",
  "冷卻中": "Cooling down",
  "策略設定": "Policy settings",
  "權重": "Weight",
  "Timeout（秒）": "Timeout (seconds)",
  "最大併發": "Max concurrency",
  "失敗門檻": "Failure threshold",
  "熔斷冷卻（秒）": "Circuit cooldown (seconds)",
  "429 退避（秒）": "429 backoff (seconds)",
  "把 Harness 掛載到代理": "Attach a Harness to the proxy",
  "選擇 Harness…": "Choose a Harness…",
  "寫入代理設定": "Write proxy config",
  "成功率": "Success rate",
  "平均 TTFB": "Average TTFB",
  "換手": "Failovers",
  "進行中": "Active",
  "尚無代理請求。": "No proxy requests yet.",
  "尚無代理紀錄。": "No proxy logs yet.",
  "重新整理指標": "Refresh metrics",
  "清空指標": "Clear metrics",
  "儲存並套用": "Save & apply",
  "連線池、智慧路由、冷卻與即時觀測": "Connection pooling, smart routing, cooldowns and live metrics",
  "格式版本": "Format version",
  "建立時間": "Created",
  "供應商數量": "Provider count",
  "完整性": "Integrity",
  "含 SHA-256 校驗": "SHA-256 checksum included",
  "舊版無校驗": "Legacy backup (no checksum)",
  "未知": "Unknown",
  "更多操作": "More actions",
  "待處理": "Needs attention",
  "批次匯入": "Batch import",
  "批次重新套用": "Batch reapply",
  "最近請求決策": "Recent request decisions",
  "候選順序": "Candidate order",
  "事件紀錄": "Event log",
  "自動模型同步": "Automatic model sync",
  "實測成本保護": "Live-test cost guard",
  "同步間隔": "Sync interval",
  "隨機延遲（分鐘）": "Jitter (minutes)",
  "每日實測次數": "Daily live tests",
  "每次輸出上限": "Output cap per test",
  "儲存政策": "Save policy",
  "選取": "Select",
  "離線快取": "Offline cache",
  "CC Switch 管理的供應商": "Providers managed by CC Switch",
  "來自 cc-switch.db，不是 Codex 實際 config.toml": "From cc-switch.db, not Codex config.toml",
  "代理／路由模式": "Proxy / route mode",
  "CC Switch 資料庫": "CC Switch database",
  "路由中": "Routing",
  "候選": "Candidate",
  "匯入 kumoSwitch": "Import to kumoSwitch",
  "已匯入": "Imported",
  "金鑰已保存": "Key stored",
  "沒有金鑰": "No key",
  "Codex 目前只把 CC Switch 的本地代理位址寫進 config.toml，所以 kumoSwitch 會看到 custom／127.0.0.1，而不是底層供應商。下面列出的才是 CC Switch 資料庫裡實際被路由的供應商。": "Codex currently writes only the CC Switch local proxy address into config.toml, so kumoSwitch sees custom / 127.0.0.1 instead of the upstream providers. The entries below are the providers actually routed by CC Switch.",
  "下面是 CC Switch 自己資料庫中的供應商，和 Codex 實際 config.toml 是兩份不同資料。": "These providers come from the CC Switch database and are separate from the real Codex config.toml.",
  "CC Switch 資料庫中目前沒有這個 App 的供應商。": "CC Switch has no providers for this app yet.",
  "共用供應商 Profile": "Shared provider profiles",
  "共用 Profile": "Shared profiles",
  "備份中心": "Backup center",
  "守護": "Guardian",
  "Cross-Harness library": "Cross-Harness library",
  "新增 Profile": "Add profile",
  "重新整理": "Refresh",
  "從現有供應商建立": "Create from an existing provider",
  "沿用其加密金鑰與模型目錄，不必重新輸入。": "Reuse its encrypted key and model catalogue without retyping them.",
  "建立 Profile": "Create profile",
  "同步全部": "Sync all",
  "編輯": "Edit",
  "尚未選擇要同步的 Harness": "No Harnesses selected yet",
  "編輯共用 Profile": "Edit shared profile",
  "新增共用 Profile": "Add shared profile",
  "預設模型": "Default model",
  "標籤": "Label",
  "API Key（留空保留現有）": "API Key (leave blank to keep current)",
  "清除 Profile 金鑰": "Clear profile key",
  "取消清除金鑰": "Cancel key removal",
  "要同步到哪些 Harness？": "Which Harnesses should receive this profile?",
  "儲存 Profile": "Save profile",
  "刪除共用 Profile？": "Delete shared profile?",
  "確認刪除": "Confirm delete",
  "設定守護中心": "Settings Guardian",
  "背景守護中": "Watching in background",
  "背景監看": "Background watch",
  "自動修復": "Auto-repair",
  "變更通知": "Change notifications",
  "掃描間隔": "Scan interval",
  "變更時間線": "Change timeline",
  "清空": "Clear",
  "外部工具": "External tool",
  "來源不明": "Unknown source",
  "備份／遷移中心": "Backup & migration center",
  "匯入遷移包": "Import migration pack",
  "建立加密遷移包": "Create encrypted migration pack",
  "快照": "Snapshots",
  "涵蓋檔案": "Files covered",
  "本機容量": "Local size",
  "最新／最舊": "Newest / oldest",
  "排程與保留": "Schedule & retention",
  "啟用排程快照": "Enable scheduled snapshots",
  "只備份設定檔，不備份對話紀錄": "Config files only; no conversation logs",
  "間隔（小時）": "Interval (hours)",
  "每個 Harness 保留": "Keep per Harness",
  "立即建立快照": "Create snapshot now",
  "手動快照": "Manual snapshot",
  "排程快照": "Scheduled snapshot",
  "更新前快照": "Pre-update snapshot",
  "還原前安全快照": "Pre-restore safety snapshot",
  "套用供應商前": "Before provider apply",
  "還原": "Restore",
  "還原這份設定快照？": "Restore this snapshot?",
  "確認還原": "Confirm restore",
  "API Key 生命週期": "API key lifecycle",
  "新增／輪替金鑰": "Add / rotate key",
  "新 API Key": "New API Key",
  "加密保存並切換": "Encrypt, save and activate",
  "待命": "Standby",
  "已過期": "Expired",
  "切換使用": "Activate",
  "隔離原則": "Isolation policy",
  "Harness 相容性矩陣": "Harness compatibility matrix",
  "相容": "Compatible",
  "提醒": "Warning",
  "不相容": "Incompatible",
  "即時觀測": "Live observability",
  "作用中告警": "Active alerts",
  "告警規則與通知": "Alert rules & notifications",
  "啟用告警": "Enable alerts",
  "桌面內通知": "In-app notifications",
  "至少請求數": "Minimum requests",
  "成功率低於 %": "Success rate below %",
  "慢 TTFB（ms）": "Slow TTFB (ms)",
  "重複通知冷卻（秒）": "Notification cooldown (seconds)",
  "常見失敗原因": "Common failure reasons",
  "匯出代理診斷": "Export proxy diagnostics",
  "無障礙與閱讀": "Accessibility & reading",
  "高對比模式": "High contrast",
  "降低動態效果": "Reduce motion",
  "文字大小": "Text size",
  "介面密度": "Interface density",
  "標準": "Normal",
  "大": "Large",
  "特大": "Extra large",
  "舒適": "Comfortable",
  "緊湊": "Compact",
  "更新通道": "Update channel",
  "更新前備份": "Pre-update backup",
  "立即建立設定快照": "Create a config snapshot now",
  "語言": "Language",
  "工具與頁面": "Tools & pages",
  "用量統計": "Usage stats",
  "代理與路由": "Proxy & routing",
  "設定守護": "Settings Guardian",
  "資料管理": "Data management",
  "匯出加密清單": "Export encrypted list",
  "匯入清單／遷移包": "Import list / migration pack",
  "重新掃描 Harness": "Rescan Harnesses",
  "語言、外觀、工具與資料": "Language, appearance, tools and data",
};

interface Rule {
  re: RegExp;
  out: (m: RegExpMatchArray) => string;
}

const RULES: Rule[] = [
  { re: /^已儲存「(.+)」$/, out: (m) => `Saved “${m[1]}”` },
  { re: /^掃描到 (\d+) 個供應商$/, out: (m) => `Found ${m[1]} providers` },
  { re: /^(\d+) 個將匯入 · (\d+) 個衝突$/, out: (m) => `${m[1]} to import · ${m[2]} conflicts` },
  { re: /^匯入 (\d+) 個$/, out: (m) => `Import ${m[1]}` },
  { re: /^已匯入 (\d+) 筆，略過 (\d+) 筆$/, out: (m) => `Imported ${m[1]}, skipped ${m[2]}` },
  { re: /^放棄未儲存的變更？$/, out: () => "Discard unsaved changes?" },
  { re: /^(.+) · (.+) Harness：模型與連線設定$/, out: (m) => `${m[1]} · ${m[2]} Harness: model and connection settings` },
  { re: /^這裡列出 (.+) Harness 的供應商。點擊供應商即可查看它的模型、Base URL 與金鑰設定。$/, out: (m) => `Providers configured for the ${m[1]} Harness. Click one to view its model, base URL and key settings.` },
  { re: /^查看供應商 (.+) 的模型與設定$/, out: (m) => `View model and settings for provider ${m[1]}` },
  { re: /^供應商 (.+) 的操作$/, out: (m) => `Actions for provider ${m[1]}` },
  { re: /^已建立完整副本「(.+)」$/, out: (m) => `Created a complete copy of “${m[1]}”` },
  { re: /^已匯入舊明文格式 (\d+) 筆，略過 (\d+) 筆$/, out: (m) => `Imported ${m[1]} legacy plaintext entries; skipped ${m[2]}` },
  { re: /^已解密匯入 (\d+) 筆，略過 (\d+) 筆$/, out: (m) => `Decrypted and imported ${m[1]} entries; skipped ${m[2]}` },
  { re: /^已加密匯出 (\d+) 個供應商。請妥善保管密碼；沒有密碼無法還原。$/, out: (m) => `Encrypted export contains ${m[1]} providers. Keep the password safe; it cannot be recovered.` },
  { re: /^已匯出 (\d+) 個供應商摘要。診斷檔不含完整 API Key。$/, out: (m) => `Exported a summary of ${m[1]} providers. The diagnostics file contains no full API keys.` },
  { re: /^已建立「(.+)」$/, out: (m) => `Created “${m[1]}”` },
  { re: /^已更新「(.+)」$/, out: (m) => `Updated “${m[1]}”` },
  { re: /^已套用「(.+)」$/, out: (m) => `Applied “${m[1]}”` },
  { re: /^套用「(.+)」到 (.+)$/, out: (m) => `Apply “${m[1]}” to ${m[2]}` },
  { re: /^已導入 (\d+) 個供應商$/, out: (m) => `Imported ${m[1]} providers` },
  { re: /^匯入 (\d+) 筆，略過 (\d+) 筆$/, out: (m) => `Imported ${m[1]}, skipped ${m[2]}` },
  { re: /^匯入 (\d+) 個工具的供應商$/, out: (m) => `Import providers from ${m[1]} tools` },
  { re: /^有新版本 (.+)$/, out: (m) => `Update available ${m[1]}` },
  { re: /^失敗 · (\d+)ms$/, out: (m) => `Failed · ${m[1]}ms` },
  { re: /^成功 · (\d+)ms$/, out: (m) => `OK · ${m[1]}ms` },
  { re: /^(\d+) \/ (\d+) 個供應商$/, out: (m) => `${m[1]} / ${m[2]} providers` },
  { re: /^(\d+) 個供應商$/, out: (m) => `${m[1]} providers` },
  { re: /^已還原：(.+)$/, out: (m) => `Restored: ${m[1]}` },
  { re: /^主題：(.+)$/, out: (m) => `Theme: ${m[1]}` },
  { re: /^備份紀錄 · (.+)$/, out: (m) => `Backups · ${m[1]}` },
  { re: /^供應商 (.+)$/, out: (m) => `Provider ${m[1]}` },
  { re: /^最近 (\d+) 筆 · 平均 (\d+)ms · (.+)$/, out: (m) => `Last ${m[1]} tests · avg ${m[2]}ms · ${m[3]}` },
  { re: /^· 下載中 (\d+)%$/, out: (m) => `· downloading ${m[1]}%` },
  { re: /^還原會用 (.+) 這份備份覆蓋目前的設定檔，確定嗎？$/, out: (m) => `Restore the backup from ${m[1]}? This overwrites the current config file.` },
  { re: /^診斷已匯出（(\d+) 個供應商摘要）$/, out: (m) => `Diagnostics exported (${m[1]} providers summarised)` },
  { re: /^(.+) 副本$/, out: (m) => `${m[1]} copy` },
  { re: /^已有 (\d+) 個供應商$/, out: (m) => `${m[1]} providers found` },
  { re: /^從設定檔導入 (\d+)$/, out: (m) => `Import from config (${m[1]})` },
  { re: /^選取待處理 (\d+)$/, out: (m) => `Select ${m[1]} attention items` },
  { re: /^批次匯入(?: (\d+))?$/, out: (m) => m[1] ? `Batch import ${m[1]}` : "Batch import" },
  { re: /^批次重新套用(?: (\d+))?$/, out: (m) => m[1] ? `Batch reapply ${m[1]}` : "Batch reapply" },
  { re: /^實測選取(?: (\d+))?$/, out: (m) => m[1] ? `Test selected (${m[1]})` : "Test selected" },
  { re: /^近 24 小時已使用：(\d+) \/ (\d+)$/, out: (m) => `Used in last 24h: ${m[1]} / ${m[2]}` },
  { re: /^上次成功：(.+)$/, out: (m) => `Last success: ${m[1]}` },
  { re: /^下次排程：(.+)$/, out: (m) => `Next run: ${m[1]}` },
  { re: /^離線快取：(\d+) 個模型$/, out: (m) => `Offline cache: ${m[1]} models` },
  { re: /^已選 (\d+) 個模型$/, out: (m) => `${m[1]} models selected` },
  { re: /^剩餘 (\d+)$/, out: (m) => `${m[1]} left` },
  { re: /^此供應商未填模型，將沿用目前的「(.+)」。要一併切換請先補上模型名稱。$/,
    out: (m) => `No model set for this provider, so the current “${m[1]}” is kept. Add a model name to switch it too.` },
  { re: /^(.+) 的設定格式尚未在真實安裝上驗證，請仔細核對下方 diff 再套用。$/,
    out: (m) => `${m[1]} has not been verified against a real install. Check the diff below before applying.` },
  { re: /^cc-switch 正以代理模式接管此工具，套用後可能被它覆蓋。$/,
    out: () => "cc-switch is proxying this tool; it may overwrite what you apply." },
];

const ATTRS = ["placeholder", "title", "aria-label", "alt"];

const HANS_PHRASES: [string, string][] = [
  ["無障礙與閱讀", "无障碍与阅读"], ["設定與更新", "设置与更新"], ["供應商", "供应商"], ["設定", "设置"], ["連線", "连接"],
  ["檢查", "检查"], ["測試", "测试"], ["備份", "备份"], ["還原", "还原"], ["紀錄", "记录"],
  ["變更", "变更"], ["金鑰", "密钥"], ["帳號", "账号"], ["套用", "应用"], ["預覽", "预览"],
  ["匯入", "导入"], ["匯出", "导出"], ["進階", "高级"], ["開關", "开关"], ["啟用", "启用"],
  ["關閉", "关闭"], ["自動", "自动"], ["偵測", "侦测"], ["錯誤", "错误"], ["檔案", "文件"],
  ["路徑", "路径"], ["資料", "数据"], ["選擇", "选择"], ["新增", "新增"], ["刪除", "删除"],
  ["編輯", "编辑"], ["保存", "保存"], ["儲存", "保存"], ["載入", "加载"], ["讀取", "读取"],
  ["寫入", "写入"], ["執行", "执行"], ["啟動", "启动"], ["停止", "停止"], ["逾時", "超时"],
  ["延遲", "延迟"], ["成功", "成功"], ["失敗", "失败"], ["目前", "当前"], ["最近", "最近"],
  ["狀態", "状态"], ["服務", "服务"], ["應用", "应用"], ["環境", "环境"], ["系統", "系统"],
  ["隱藏", "隐藏"], ["顯示", "显示"], ["複製", "复制"], ["貼上", "粘贴"], ["搜尋", "搜索"],
  ["篩選", "筛选"], ["排序", "排序"], ["模型", "模型"], ["協議", "协议"], ["類型", "类型"],
  ["名稱", "名称"], ["備註", "备注"], ["版本", "版本"], ["更新", "更新"], ["下載", "下载"],
  ["安裝", "安装"], ["解除安裝", "卸载"], ["還原前", "还原前"], ["更新前", "更新前"],
  ["設定檔", "配置文件"], ["資料夾", "文件夹"], ["時間", "时间"], ["分鐘", "分钟"],
  ["小時", "小时"], ["個月", "个月"], ["無障礙", "无障碍"], ["文字大小", "文字大小"],
  ["介面密度", "界面密度"], ["高對比", "高对比"], ["動態效果", "动态效果"],
  ["開發", "开发"], ["發行", "发布"], ["簽章", "签名"], ["驗證", "验证"], ["來源", "来源"],
  ["文件", "文件"], ["工作", "工作"], ["安全", "安全"], ["本機", "本机"], ["平台", "平台"],
  ["擴充", "扩展"], ["觀測", "观测"], ["告警", "告警"], ["路由", "路由"], ["代理", "代理"],
  ["鏡像", "镜像"], ["相容", "兼容"], ["能力", "能力"], ["矩陣", "矩阵"], ["生命週期", "生命周期"],
  ["輪替", "轮换"], ["稽核", "审计"], ["隔離", "隔离"], ["遷移", "迁移"], ["排程", "计划"],
  ["保留", "保留"], ["權限", "权限"], ["密碼", "密码"], ["加密", "加密"], ["解密", "解密"],
  ["歷史", "历史"], ["測試與變更", "测试与变更"], ["設定守護", "设置守护"],
];

const HANS_CHARS: [string, string][] = [
  ["們","们"],["個","个"],["這","这"],["麼","么"],["為","为"],["與","与"],["來","来"],
  ["時","时"],["會","会"],["說","说"],["對","对"],["於","于"],["過","过"],["還","还"],
  ["進","进"],["實","实"],["現","现"],["開","开"],["關","关"],["發","发"],["現","现"],
  ["動","动"],["態","态"],["點","点"],["擊","击"],["檢","检"],["測","测"],["試","试"],
  ["錯","错"],["誤","误"],["讀","读"],["寫","写"],["檔","档"],["案","案"],["資","资"],
  ["料","料"],["錄","录"],["變","变"],["更","更"],["鑰","钥"],["帳","账"],["號","号"],
  ["預","预"],["覽","览"],["匯","汇"],["導","导"],["級","级"],["啟","启"],["閉","闭"],
  ["認","认"],["證","证"],["確","确"],["佈","布"],["載","载"],["執","执"],["啟","启"],
  ["週","周"],["際","际"],["離","离"],["遷","迁"],["權","权"],["鏈","链"],["結","结"],
  ["協","协"],["議","议"],["類","类"],["別","别"],["稱","称"],["註","注"],["體","体"],
  ["數","数"],["據","据"],["夾","夹"],["鐘","钟"],["無","无"],["礙","碍"],["對","对"],
  ["比","比"],["籤","签"],["驗","验"],["擴","扩"],["觀","观"],["測","测"],["鏡","镜"],
  ["像","像"],["容","容"],["據","据"],["輪","轮"],["替","替"],["稽","稽"],["隔","隔"],
  ["離","离"],["隨","随"],["機","机"],["壓","压"],["縮","缩"],["風","风"],["險","险"],
  ["穩","稳"],["優","优"],["質","质"],["廠","厂"],["商","商"],["網","网"],["頁","页"],
  ["線","线"],["程","程"],["戶","户"],["從","从"],["將","将"],["並","并"],["檔","档"],
  ["選","选"],["擇","择"],["單","单"],["雙","双"],["鍵","键"],["螢","荧"],["幕","幕"],
  ["寬","宽"],["緊","紧"],["湊","凑"],["標","标"],["題","题"],["顯","显"],["示","示"],
  ["隱","隐"],["藏","藏"],["複","复"],["貼","贴"],["搜","搜"],["尋","寻"],["篩","筛"],
  ["穩","稳"],["總","总"],["計","计"],["統","统"],["圖","图"],["錶","表"],["勢","势"],
  ["趨","趋"],["異","异"],["常","常"],["環","环"],["節","节"],["點","点"],["將","将"],
  ["會","会"],["儲","储"],["僅","仅"],["帶","带"],["們","们"],["產","产"],["專","专"],
  ["業","业"],["應該","应该"],["應","应"],["該","该"],["讓","让"],["這","这"],["邊","边"],
  ["裡","里"],["後","后"],["前","前"],["間","间"],["現","现"],["實","实"],["際","际"],
  ["運","运"],["轉","转"],["換","换"],["備","备"],["份","份"],["還","还"],["原","原"],
  ["舊","旧"],["新","新"],["舊","旧"],["刪","删"],["除","除"],["確","确"],["認","认"],
  ["頁","页"],["籤","签"],["證","证"],["書","书"],["碼","码"],["驗","验"],["證","证"],
  ["據","据"],["庫","库"],["檔","档"],["檢","检"],["查","查"],["讀","读"],["寫","写"],
  ["錯","错"],["誤","误"],["訊","讯"],["息","息"],["警","警"],["告","告"],["監","监"],
  ["聽","听"],["埠","端口"],["網","网"],["址","址"],["權","权"],["限","限"],["製","制"],
  ["造","造"],["應","应"],["用","用"],["發","发"],["佈","布"],["版","版"],["號","号"],
];

function simplify(input: string): string {
  let text = input;
  for (const [from, to] of HANS_PHRASES) text = text.split(from).join(to);
  for (const [from, to] of HANS_CHARS) text = text.split(from).join(to);
  return text;
}

export function readLang(): Lang {
  try {
    let stored = window.localStorage.getItem(KEY);
    if (stored === null) {
      for (const legacyKey of LEGACY_KEYS) {
        const legacy = window.localStorage.getItem(legacyKey);
        if (legacy === "zh" || legacy === "zh-Hans" || legacy === "en") {
          window.localStorage.setItem(KEY, legacy);
          stored = legacy;
          break;
        }
      }
    }
    if (stored === "zh" || stored === "zh-Hans" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  const hash = window.location.hash.toLowerCase();
  if (hash.includes("lang=en") || hash.split(",").includes("en")) return "en";
  if (hash.includes("lang=zh-hans") || hash.includes("lang=zh-cn") || hash.split(",").includes("zh-hans")) return "zh-Hans";
  if (hash.includes("lang=zh") || hash.split(",").includes("zh")) return "zh";
  const language = navigator.language.toLowerCase();
  if (!language.startsWith("zh")) return "en";
  return language.includes("cn") || language.includes("hans") || language.includes("sg") ? "zh-Hans" : "zh";
}

export function saveLang(lang: Lang) {
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    /* ignore */
  }
}

function translate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const direct = DICT[trimmed];
  if (direct) return value.replace(trimmed, direct);
  for (const rule of RULES) {
    const m = trimmed.match(rule.re);
    if (m) return value.replace(trimmed, rule.out(m));
  }
  if (trimmed.endsWith(" ·")) {
    const core = translate(trimmed.slice(0, -2));
    if (core) return value.replace(trimmed, `${core} ·`);
  }
  if (trimmed.startsWith("· ")) {
    const core = translate(trimmed.slice(2));
    if (core) return value.replace(trimmed, `· ${core}`);
  }
  const badge = trimmed.match(/^(\d+) (個供應商|個工具)$/);
  if (badge) {
    const unit = badge[2] === "個工具" ? "tools" : "providers";
    return value.replace(trimmed, `${badge[1]} ${unit}`);
  }
  return null;
}

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
const originalText = new WeakMap<Text, string>();
const renderedText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Map<string, string>>();

function translateFor(lang: Lang, value: string): string | null {
  if (lang === "zh") return null;
  if (lang === "en") return translate(value);
  const simplified = simplify(value);
  return simplified === value ? null : simplified;
}

function rememberAttr(el: Element, attr: string) {
  let map = originalAttrs.get(el);
  if (!map) {
    map = new Map();
    originalAttrs.set(el, map);
  }
  if (!map.has(attr)) map.set(attr, el.getAttribute(attr) ?? "");
}

function restore(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const node = root as Text;
    const original = originalText.get(node);
    if (original != null && node.nodeValue !== original) node.nodeValue = original;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as HTMLElement;
  const attrs = originalAttrs.get(el);
  if (attrs) {
    for (const [attr, value] of attrs) el.setAttribute(attr, value);
  }
  el.childNodes.forEach(restore);
}

function walk(root: Node, lang: Lang) {
  if (root.nodeType === Node.TEXT_NODE) {
    const node = root as Text;
    const parent = node.parentElement;
    if (parent && SKIP.has(parent.tagName)) return;
    const text = node.nodeValue ?? "";
    if (!originalText.has(node)) originalText.set(node, text);
    const source = originalText.get(node) ?? text;
    const next = translateFor(lang, source);
    const rendered = next ?? source;
    renderedText.set(node, rendered);
    if (node.nodeValue !== rendered) node.nodeValue = rendered;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as HTMLElement;
  if (SKIP.has(el.tagName)) return;
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    rememberAttr(el, attr);
    const source = originalAttrs.get(el)?.get(attr) ?? value;
    const next = translateFor(lang, source);
    if (next && next !== value) el.setAttribute(attr, next);
  }
  el.childNodes.forEach((child) => walk(child, lang));
}

let observer: MutationObserver | null = null;
let currentLang: Lang = "zh";

export function applyLang(lang: Lang) {
  currentLang = lang;
  document.documentElement.lang = lang === "en" ? "en" : lang === "zh-Hans" ? "zh-Hans" : "zh-Hant";
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  restore(document.body);
  if (lang === "zh") return;
  walk(document.body, lang);
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") {
        const node = record.target as Text;
        const current = node.nodeValue ?? "";
        const previousRender = renderedText.get(node);
        if (previousRender != null && current === previousRender) continue;
        originalText.set(node, current);
        const next = translateFor(currentLang, current);
        const rendered = next ?? current;
        renderedText.set(node, rendered);
        if (rendered !== current) node.nodeValue = rendered;
      } else {
        record.addedNodes.forEach((node) => walk(node, currentLang));
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

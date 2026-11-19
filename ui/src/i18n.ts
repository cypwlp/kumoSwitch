/**
 * Runtime translation layer.
 *
 * The app is authored in Traditional Chinese; English is applied by walking the
 * rendered DOM and swapping known phrases. Doing it here (instead of threading a
 * `t()` through every component) also covers strings that come back from the
 * Rust side — restart hints, warnings, error messages — which would otherwise
 * stay Chinese in the English UI.
 */

import { useEffect, useState } from "react";

export type Lang = "zh" | "zh-Hans" | "en";

const KEY = "kumoswitch.lang";
const LEGACY_KEYS = ["switchtower.lang", "switchyard.lang"];

const DICT: Record<string, string> = {
  "AI CLI 供應商切換": "AI CLI provider switcher",
  "AI 工具供應商切換": "AI tool provider switcher",
  "管理 AI 工具供應商，不動其他一行設定。": "Manage AI tool providers without touching another line.",
  "工具管理": "Tool management",
  "工具安裝與管理": "Tool setup & management",
  "工具安裝完成": "Tool install complete",
  "工具安裝未完成": "Tool install incomplete",
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
  "搜尋工具、套件或設定路徑…": "Search tools, packages or config paths…",
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
  "Tool lifecycle": "Tool lifecycle",
  "搜尋目前供應商的模型": "Search models in this provider",
  "思考等級": "Thinking level",
  "目前選擇": "Current selection",
  "自動獲取模型資訊": "Fetch model information",
  "模型／工具預設": "Model / tool default",
  "此工具尚未支援寫入；等級仍會保存在模型資料": "This tool cannot write the level yet; it will still be saved in model data",
  "進階能力與 Metadata": "Advanced capabilities & metadata",
  "候選思考等級（逗號分隔）": "Candidate thinking levels (comma-separated)",
  "測試模型目錄": "Test model catalogue",
  "真實模型實測": "Live model test",
  "封存模型": "Archive model",
  "移除模型": "Remove model",
  "kumoSwitch 只改寫供應商相關的那幾個鍵，": "kumoSwitch rewrites only the provider keys,",
  "你的註解、外掛、MCP 與其他設定原樣保留。": "your comments, plugins, MCP and other settings stay untouched.",
  "其他切換工具正在接管這個工具": "Another switching tool is managing this tool",
  "偵測到代理模式啟用中，套用後可能被接管工具覆蓋。建議先切回直連模式。":
    "Proxy mode is active, so the managing tool may overwrite what you apply. Switch it back to direct mode first.",
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
  "先看變更預覽 再套用": "Review the change preview before applying",
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
  "供應商是獨立的連線位址＋金鑰；模型是供應商底下的子項目。先選供應商，再進入它的模型。": "A provider is a connection address plus credentials. Models belong to that provider; select the provider first, then open its models.",
  "名稱與 Base URL 不能空白": "Name and Base URL cannot be empty",
  "套用": "Apply",
  "套用前一定顯示逐行變更預覽": "Always shows a line-by-line change preview first",
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
  "查看變更預覽": "View change preview",
  "格式已驗證": "Format verified",
  "格式未實測，請先看變更預覽": "Format unverified — check the change preview first",
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
  "看變更預覽 ·": "View change preview ·",
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
  "GPT Plus 與其他模型": "GPT Plus and other models",
  "快速設定 · 3 步": "Quick setup · 3 steps",
  "讓 Codex 顯示 GPT Plus 和其他模型": "Show GPT Plus and other models in Codex",
  "照著流程做一次，之後直接在 Codex 的模型選單切換。": "Follow these steps once, then switch models from Codex’s model menu.",
  "尚未連接": "Not connected",
  "Codex 已連接": "Codex connected",
  "加入其他模型（可略過）": "Add other models (optional)",
  "OpenCode 或 Command Code 模型要先加入；GPT Plus 不用填 API Key。": "Add OpenCode or Command Code models here; GPT Plus does not need an API key.",
  "管理供應商": "Manage providers",
  "＋新增供應商": "＋Add provider",
  "連接 Codex 模型選單": "Connect the Codex model menu",
  "已連接；模型會從 Codex 的模型選單切換。": "Connected. Switch models from Codex’s model menu.",
  "啟用後，Codex 會列出 GPT Plus 和已加入的 Codex 供應商模型。": "Once enabled, Codex lists GPT Plus and the Codex providers you have added.",
  "Codex 模型目錄已啟用；請重開 Codex 並在模型選單切換。ChatGPT Plus 使用 Codex 登入；CommandCode、OpenCode Go 等 Codex 供應商的模型會一併列出。": "Codex model catalogue enabled. Restart Codex and switch from its model menu. ChatGPT Plus uses Codex sign-in; models from Codex providers such as CommandCode and OpenCode Go are listed too.",
  "已完成": "Done",
  "一鍵啟用": "Enable in one click",
  "登入並重新開啟 Codex": "Sign in and restart Codex",
  "GPT Plus 使用 ChatGPT 帳號登入；CLI 版可輸入": "For GPT Plus, sign in to ChatGPT; in the CLI, enter",
  "。啟用後重開 Codex 一次。": ". Restart Codex once after enabling.",
  "最後一步": "Last step",
  "Plus 登入由 Codex 處理；供應商 API Key 留在 KumoSwitch。": "Codex handles Plus sign-in; provider API keys stay in KumoSwitch.",
  "進階設定": "Advanced settings",
  "供應商與模型": "Providers and models",
  "管理 OpenCode、Command Code 和其他已加入的模型來源。": "Manage OpenCode, Command Code and other model sources added here.",
  "收起管理": "Close provider management",
  "簡易設定": "Simple setup",
  "完成供應商設定": "Finish provider setup",
  "加入供應商、套用模型，再依提示重新載入工具。": "Add a provider, apply a model, then reload the tool as instructed.",
  "即時切換已啟用": "Instant switching is on",
  "供應商已套用": "Provider applied",
  "尚未設定": "Not set up",
  "準備供應商": "Prepare a provider",
  "先新增或匯入一個供應商；模型可在供應商底下管理。": "Add or import a provider first; manage its models under that provider.",
  "套用供應商與模型": "Apply a provider and model",
  "即時切換已啟用。": "Instant switching is on.",
  "目前已套用：": "Currently applied: ",
  "在清單選擇供應商，再按「套用」。": "Choose a provider from the list, then select Apply.",
  "選擇供應商": "Choose a provider",
  "讓變更生效": "Make the change take effect",
  "請依工具提示重新開啟或重新載入。": "Restart or reload the tool as instructed.",
  "供應商設定保存在 KumoSwitch；已加入的模型可在此管理。": "Provider settings stay in KumoSwitch; manage added models here.",
  "新增、編輯或套用供應商。": "Add, edit or apply a provider.",
  "選擇下拉清單中的供應商與模型，切換即時生效。": "Choose a provider and model from the list; switching takes effect immediately.",
  "即時切換供應商與模型": "Switch upstream provider and model",
  "選擇供應商與模型": "Choose a provider and model",
  "切換供應商": "Switch provider",
  "選擇已加入的供應商模型；切換後立即生效": "Choose an added provider model; changes take effect immediately",
  "首次啟用請依工具提示重新開啟或重新載入；之後切換即時生效。": "After enabling for the first time, restart or reload as instructed; later switches take effect immediately.",
  "Claude Code 支援熱切換，新開的 session 即生效": "Claude Code hot-reloads; new sessions pick it up",
  "改完在 Qoder 重新載入模型設定": "Reload the model settings inside Qoder",
  "需要重開 DSH 桌面端": "Restart the DSH desktop app",
  "重新啟動 Pi，或在目前 session 執行 /reload": "Restart Pi, or run /reload in the current session",
  "重新啟動 omp／Oh My Pi session": "Restart the omp / Oh My Pi session",
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
  "點擊供應商查看模型與設定 · 套用前先看變更預覽": "Click a provider to view its model and settings · review the change preview before applying",
  "目前套用": "Currently applied",
  "尚未選擇供應商": "No provider selected",
  "尚未設定 Base URL": "No base URL configured",
  "未指定，沿用工具目前模型": "Not specified; inherits the tool model",
  "查看模型與連線設定": "View model and connection settings",
  "重新套用": "Reapply",
  "供應商詳情": "Provider details",
  "套用後工具會使用這個模型；可從預設清單快速選取或自行輸入。":
    "The tool will use this model after applying. Pick a suggested model or enter one manually.",
  "搜尋供應商名稱、URL 或模型…（按 / 聚焦）": "Search provider name, URL or model… (press /)",
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
  "其他切換工具管理的供應商": "Providers managed by another switching tool",
  "來自本機相容資料庫，不是 Codex 實際 config.toml": "From a local compatibility database, not the real Codex config.toml",
  "代理／路由模式": "Proxy / route mode",
  "相容資料庫": "Compatibility database",
  "路由中": "Routing",
  "候選": "Candidate",
  "匯入 kumoSwitch": "Import to kumoSwitch",
  "已匯入": "Imported",
  "金鑰已保存": "Key stored",
  "沒有金鑰": "No key",
  "這個工具目前只把相容工具的本地代理位址寫進 config.toml，所以 kumoSwitch 會看到 custom／127.0.0.1，而不是底層供應商。下面列出的是相容資料庫裡實際被路由的供應商。": "This tool currently writes only the compatibility tool's local proxy address into config.toml, so kumoSwitch sees custom / 127.0.0.1 instead of the upstream providers. The entries below are the providers actually routed by the compatibility database.",
  "下面是相容資料庫中的供應商，和工具實際 config.toml 是兩份不同資料。": "These providers come from the compatibility database and are separate from the real tool config.toml.",
  "相容資料庫中目前沒有這個 App 的供應商。": "The compatibility database has no providers for this app yet.",
  "共用供應商 Profile": "Shared provider profiles",
  "共用 Profile": "Shared profiles",
  "備份中心": "Backup center",
  "守護": "Guardian",
  "Cross-tool library": "Cross-tool library",
  "新增 Profile": "Add profile",
  "重新整理": "Refresh",
  "從現有供應商建立": "Create from an existing provider",
  "沿用其加密金鑰與模型目錄，不必重新輸入。": "Reuse its encrypted key and model catalogue without retyping them.",
  "建立 Profile": "Create profile",
  "同步全部": "Sync all",
  "編輯": "Edit",
  "尚未選擇要同步的工具": "No tools selected yet",
  "編輯共用 Profile": "Edit shared profile",
  "新增共用 Profile": "Add shared profile",
  "預設模型": "Default model",
  "標籤": "Label",
  "API Key（留空保留現有）": "API Key (leave blank to keep current)",
  "清除 Profile 金鑰": "Clear profile key",
  "取消清除金鑰": "Cancel key removal",
  "要同步到哪些工具？": "Which tools should receive this profile?",
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
  "每個工具保留": "Keep per tool",
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
  "工具相容性矩陣": "Tool compatibility matrix",
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
  "重新掃描工具": "Rescan tools",
  "語言、外觀、工具與資料": "Language, appearance, tools and data",
  "先選供應商，再進入它的模型。模型是供應商底下的子項目。": "Pick a provider first, then open its models.",
  "簡單": "Simple",
  "基本": "Basic",
  "進階": "Advanced",
  "介面模式": "Interface mode",
  "簡單模式只保留切換供應商需要的資訊；進階模式顯示健康度、協議、模型與批次工具。": "Simple mode keeps only what you need to switch providers. Advanced mode also shows health, protocol, models and batch tools.",
  "我的工具": "My tools",
  "其他工具": "Other tools",
  "連線位址": "Connection address",
  "變更預覽": "Change preview",
  "只讀本機 session log，統計 Claude Code、Codex、Pi、Oh My Pi、DSH": "Reads local session logs only: Claude Code, Codex, Pi, Oh My Pi and DSH",
  "來源篩選": "Source filter",
  "搜尋模型": "Search models",
  "全部": "All",
  "平均": "Avg",
  "速度": "Speed",
  "首字": "First token",
  "平均回應時間": "Avg response",
  "平均輸出速度": "Avg output speed",
  "首字延遲（估算）": "First-token latency (est.)",
  "有計時請求": "Timed requests",
  "簡單模式略過變更預覽，直接備份並套用；可從通知復原": "Simple mode skips the preview, writes a backup and applies immediately; undo from the toast",
  "最近": "Recent",
  "最近切換": "Recent switches",
  "復原": "Undo",
  "已復原切換前的設定": "Restored the previous configuration",
  "快速新增": "Quick add",
  "儲存並切換": "Save & switch",
  "完整編輯": "Full editor",
  "名稱（選填）": "Name (optional)",
  "模型 ID（選填）": "Model ID (optional)",
  "自動以網域命名": "Auto-name from domain",
  "留空則自動偵測": "Leave blank to auto-detect",
  "儲存後自動讀取供應商的模型目錄": "Fetch the provider model catalogue after saving",
  "☆ 釘選": "☆ Pin",
  "★ 釘選": "★ Pinned",
  "取消釘選": "Unpin",
  "釘選到最前面": "Pin to top",
  "相容匯入": "Compatibility import",
  "讀取其他切換工具的本機資料": "Read another switcher's local data",
  "預設關閉；只讀取本機 cc-switch.db，不上傳、不修改": "Off by default; reads the local cc-switch.db only, with no upload or modification",
  "開啟後才會顯示相容資料庫中的供應商。匯入前請自行確認第三方工具的使用條款；kumoSwitch 與任何第三方工具都沒有官方合作或背書關係。": "Providers from the compatibility database appear only after this is enabled. Check the third-party tool's terms before importing; kumoSwitch has no partnership with or endorsement from any third-party tool.",
  "重新讀取資料庫": "Reload database",
  "逐項選取後可批次匯入或鏡像路由順序": "Select individual providers to bulk import or mirror the route order",
  "鏡像路由堆疊": "Mirror route stack",
  "相容供應商目錄已重新讀取": "Compatibility provider catalogue reloaded",
  "設定分類": "Settings sections",
  "從供應商目錄選擇": "Choose from the provider catalogue",
  "已內建 28 個預設，會自動填入 Base URL、模型與協議": "28 presets with Base URL, model and protocol filled in",
  "此預設需要先在官方 CLI 完成登入；快速新增只建立供應商資料。": "This preset needs an official CLI login first; quick add only creates the provider record.",
  "掃描所有工具設定": "Scan all tool configs",
  "按「＋ 新增供應商」快速建立，或按「從設定檔導入」讀取這個工具現有的供應商": "Use “+ Add provider” for a quick setup, or “Import from config” to read this tool's existing providers",
  "有效吞吐（總量）": "Effective throughput (total)",
  "慢請求（>60 秒）": "Slow requests (>60s)",
  "思考 tokens": "Reasoning tokens",
  "P50 速度": "P50 speed",
  "解碼速度（估算）": "Decode speed (est.)",
  "固定等待（估算）": "Fixed overhead (est.)",
  "解碼速度": "Decode speed",
  "主題色": "Accent colour",
  "海洋": "Ocean",
  "極光": "Aurora",
  "日落": "Sunset",
  "森林": "Forest",
  "玫瑰": "Rose",
  "琥珀": "Amber",
  "設定": "Settings",
  "語言、主題、導覽、資料與更新": "Language, theme, navigation, data and updates",
  "新增供應商 · 點擊供應商查看模型與設定 · 套用前先看變更預覽": "Add provider · click a provider to view models and settings · review the change preview before applying",
  "由工具決定": "Determined by tool",
  "尚未設定模型": "No model configured",
  "詳細": "Details",
  "支援桌面版": "Desktop app supported",
  "拖曳調整供應商順序；也可用上下鍵移動": "Drag to reorder providers; arrow keys also work",
  "先看變更預覽再套用": "Review the change preview before applying",
  "直接切換模型並預覽變更": "Switch model and preview the change",
  "主力": "Primary",
  "工具": "Tool",
  "金鑰": "Key",
  "詳情": "Details",
  "手動向 GitHub Releases 查詢簽章更新。若自動更新不可用，也可以直接開啟安裝向導下載最新版。": "Check GitHub Releases for a signed update. If automatic updates are unavailable, open the install guide to download the latest build.",
  "Stable（自動更新）": "Stable (automatic updates)",
  "Beta（向導手動下載）": "Beta (manual download via guide)",
  "先為所有偵測到的工具建立設定快照": "Snapshot every detected tool before updating",
  "自動更新一律使用 Stable 的簽章清單；Beta 通道會開啟對應的預覽版安裝向導，避免預覽版誤推送給一般使用者。": "Automatic updates always use the Stable signed manifest. The Beta channel opens the matching preview install guide so preview builds are not pushed to regular users.",
  "更新檔案由 GitHub Releases 提供；安裝前會驗證簽章。設定與 API Key 不會上傳。": "Update files come from GitHub Releases and are signature-checked before install. Settings and API keys are never uploaded.",
  "提高文字、邊框與焦點環的對比": "Increase contrast for text, borders and focus rings",
  "停用非必要的過場與脈動動畫": "Disable non-essential transitions and pulsing animations",
  "安裝、桌面版與設定位置": "Installation, desktop apps and config locations",
  "Token、成本與掃描診斷": "Tokens, cost and scan diagnostics",
  "故障轉移、路由與即時觀測": "Failover, routing and live observability",
  "漂移、時間線與自動修復": "Drift, timeline and auto-repair",
  "跨工具重用供應商": "Reuse providers across tools",
  "版本、排程與遷移": "Versions, schedules and migration",
  "本機資料位置": "Local data location",
  "模型與連線": "Models & connection",
  "金鑰生命週期": "API key lifecycle",
  "最近套用": "Last applied",
  "尚未套用": "Not applied yet",
  "目前位置": "Current location",
  "供應商詳情分類": "Provider detail sections",
  "設定這個供應商可用的模型。圓點代表下次套用時要寫入工具的模型。": "Models available to this provider. The dot marks the model written to the tool on the next apply.",
  "尚未同步模型目錄。": "The model catalogue has not been synced yet.",
  "↻ 同步模型": "↻ Sync models",
  "⌕ 從目錄新增": "⌕ Add from catalogue",
  "＋ 新增模型": "+ Add model",
  "自動同步與實測成本保護": "Auto-sync and live-test cost guard",
  "同步排程、失敗退避與真實模型實測配額": "Sync schedule, failure backoff and live-test budget",
  "展開": "Expand",
  "收起": "Collapse",
  "智譜 GLM": "Zhipu GLM",
  "封存": "Archive",
  "取消封存": "Unarchive",
  "實測": "Live test",
  "★ 常用": "★ Favourite",
  "★ 取消常用": "★ Remove favourite",
  "☆ 設為常用": "☆ Add favourite",
  "套用後寫入 config.toml → model_reasoning_effort": "Written to config.toml → model_reasoning_effort after applying",
  "符合": "Compatible",
  "工具能力符合": "Tool calling supported",
  "支援": "Supported",
  "不支援": "Not supported",
  "尚未測試這個模型": "This model has not been tested yet",
  "切換並預覽": "Switch & preview",
  "讀取供應商的 /models，先預覽再合併；不會刪除既有模型": "Read the provider /models catalogue, preview and merge; existing models are never deleted",
  "一次實測勾選的模型；送出前會顯示配額與費用估算": "Live-test the selected models; quota and estimated cost are shown before sending",
  "搜尋供應商 /models 回報的所有模型": "Search every model reported by the provider /models endpoint",
  "搜尋模型名稱、ID、思考等級…": "Search model name, ID or reasoning level…",
  "選取此模型進行批次實測": "Select this model for batch live testing",
  "把這個模型設為供應商預設": "Set this model as the provider default",
  "只更新模型欄位，開啟變更預覽後再確認": "Update only the model fields, then review the change preview",
  "同一供應商可保存多把輪替金鑰；只有使用中的金鑰會寫入工具。其他金鑰保持加密待命，可隨時測試或切回。": "A provider can keep multiple rotating keys. Only the active key is written to the tool; other keys stay encrypted and ready to test or reactivate.",
  "建立": "Created",
  "無到期日": "No expiry",
  "新增後預設切換為使用中；舊金鑰會保留為待命版本。": "The new key becomes active by default; the old key stays as a standby version.",
  "到期日（選填）": "Expiry date (optional)",
  "不同工具的供應商各自保存金鑰版本；共用 Profile 同步時才會複製金鑰到對應工具。所有輪替、切換、測試與刪除都會寫入本機稽核紀錄。": "Each tool keeps its own key versions; only shared Profile sync copies keys to another tool. Rotations, switches, tests and deletions are recorded in the local audit log.",
  "例：2026 Q4 輪替": "e.g. 2026 Q4 rotation",
  "輪替原因、負責人或用途": "Reason, owner or purpose",
  "到期日": "Expiry date",
  "Mock 預覽資料": "Mock preview data",
  "搜尋模型廠商、第三方平台、雲服務、本機服務與帳號登入": "Search model vendors, third-party platforms, cloud services, local services and account logins",
  "複製": "Copy",
  "留空會保留現有金鑰；按「查看」才會載入完整金鑰，顯示 30 秒後會自動隱藏。": "Leave blank to keep the current key. Press “View” to load the full key; it hides automatically after 30 seconds.",
  "套用時只會寫入": "Applying writes only",
  "的供應商相關鍵位，其他設定與註解不會被動到。": "provider-related keys; other settings and comments are untouched.",
  "模型顯示名稱": "Model display name",
  "候選思考等級": "Candidate reasoning levels",
  "模型 metadata": "Model metadata",
  "個模型": "models",
  "個版本": "versions",
  "類型（": "Type (",
  "更多效能指標": "More performance metrics",
  "供應商連線測試": "Provider connectivity tests",
  "每日用量（近": "Daily usage (last",
  "天）": " days)",
  "輸入": "Input",
  "輸出": "Output",
  "快取": "Cache",
  "思考": "Reasoning",
  "耗時": "Elapsed",
  "ms · 已掃描": "ms · scanned",
  "個檔案 · 跳過": "files · skipped",
  "個": "",
  "已找到用量": "Usage found",
  "已找到": "Found",
  "個檔案 · 實際讀取": "files · read",
  "路徑不存在": "Path not found",
  "成本為公開單價估算（每百萬 token），非帳單金額；未列入價目表的模型顯示「未定價」。Pi／DSH 的思考 tokens 會另計並納入成本。表格的「解碼速度」是把每筆請求時間對輸出 tokens 做迴歸、扣掉固定等待後的估算；例如 Pi 的 deepseek-v4.1-flash 約 174 tok/s、固定等待約 13.2 秒。上方「有效吞吐」才是包含等待的總量÷總時間。Codex 目前沒有可用的時間戳。": "Cost is an estimate from public per-million-token prices, not a bill. Models without a price show “Unpriced”. Pi/DSH reasoning tokens are counted separately and included in cost. The decode speed regresses request time against output tokens and subtracts fixed wait; for example, Pi deepseek-v4.1-flash is about 174 tok/s with about 13.2s fixed wait. The effective throughput above is total tokens ÷ total time, including waiting. Codex has no usable timestamps.",
  "目前可讀取這五種工具的本機用量。Gemini CLI、OpenCode、Qwen Code、Kilo Code、Crush、Qoder、Grok Build 等工具的 session 檔沒有穩定的 token 欄位，因此不會被估算；等實際格式可解析時會自動納入。": "Local usage is available for these five tools. Session files from Gemini CLI, OpenCode, Qwen Code, Kilo Code, Crush, Qoder and Grok Build do not expose stable token fields, so they are not estimated; they will be added automatically when a parseable format exists.",
  "有計時資料的請求平均花費時間；不是連線測試延遲": "Average time for timed requests; this is not connectivity test latency",
  "輸出 tokens ÷ 有計時請求的總時間；包含首字等待、思考、網路與重試": "Output tokens ÷ total time for timed requests, including first-token wait, reasoning, network and retries",
  "將每筆 duration 對輸出 tokens 迴歸，估出的解碼速度；已扣掉固定等待": "Decode speed estimated by regressing each request duration against output tokens; fixed wait is removed",
  "每筆請求的固定等待：首字、排隊、重試與網路；由迴歸截距估算": "Fixed wait per request: first token, queue, retries and network; estimated from the regression intercept",
  "Claude Code session log 的使用者訊息→首個 assistant 區塊時間差，僅為估算": "Claude Code user message → first assistant block time gap; estimate only",
  "超過 60 秒的請求，通常是逾時、重試或排隊；速度統計會保留這些樣本": "Requests over 60 seconds, usually timeouts, retries or queueing; speed statistics keep these samples",
  "每日 token 用量": "Daily token usage",
  "有計時資料的請求平均花費時間": "Average time for timed requests",
  "duration 對輸出 tokens 迴歸估算的解碼速度；已扣掉固定等待，滑過儲存格可看 P50": "Decode speed from regressing duration against output tokens, fixed wait removed; hover for P50",
  "首字延遲估算（目前只有 Claude Code 時間戳可推算）": "Estimated first-token latency (currently only derivable from Claude Code timestamps)",
  "統計範圍": "Date range",
  "搜尋模型…": "Search models…",
  "天": "days",
  "最近請求": "Recent requests",
  "這個範圍內沒有符合條件的請求記錄": "No matching requests in this range",
  "時間": "Time",
  "ID": "ID",
  "載入更多（尚餘": "Load more (",
  "）": ")",
  "個已知模型": "known models",
  "搬家中心": "Migration centre",
  "先備份現在的設定": "Back up your current setup",
  "把 current providers 加密匯出成 .kumoswitch；換機或直接升級前都能還原。": "Export current providers as an encrypted .kumoswitch file so you can restore after a machine change or upgrade.",
  "從官方設定檔帶入": "Import from official config files",
  "只讀取各工具自己的設定檔（TOML / JSON / YAML），逐項預覽後再匯入。": "Read each tool's own config file (TOML / JSON / YAML), preview the items, then import.",
  "第三方相容匯入（選用）": "Third-party compatibility import (optional)",
  "前往相容匯入設定": "Open compatibility import settings",
  "目前未開啟。": "Currently off.",
  "目前已開啟。": "Currently on.",
  "kumoSwitch 與任何第三方切換工具都沒有官方合作或背書關係。相容匯入使用前請自行確認第三方工具的條款。": "kumoSwitch has no partnership with or endorsement from any third-party switching tool. Check the third-party terms before using compatibility import.",
  "供應商篩選": "Provider filter",
  "模型篩選": "Model filter",
  "全部工具（": "All tools (",
  "全部供應商": "All providers",
  "全部模型": "All models",
  "提供回饋": "Send feedback",
  "回饋類型": "Feedback type",
  "問題回報": "Bug report",
  "功能想法": "Idea",
  "看不懂／找不到": "Confusing / hard to find",
  "其他": "Other",
  "整體感受（選填）": "Overall feeling (optional)",
  "整體感受": "Overall feeling",
  "不好用": "Hard to use",
  "普通": "Okay",
  "好用": "Great",
  "你想說什麼？": "What would you like to say?",
  "哪裡卡住、預期什麼、實際發生什麼…": "Where did you get stuck, what did you expect, what happened…",
  "附上診斷摘要（不含 API Key、prompt 或對話內容）": "Attach diagnostics (no API keys, prompts or conversation content)",
  "所有內容只會在本機產生；按下複製或開啟 GitHub 後，由你決定是否送出。kumoSwitch 不會自動上傳任何回饋。": "Everything is generated locally. After copying or opening GitHub, you decide whether to send it. kumoSwitch never uploads feedback automatically.",
  "預覽內容": "Preview",
  "隱藏預覽": "Hide preview",
  "複製到剪貼簿": "Copy to clipboard",
  "開啟 GitHub Issue": "Open GitHub issue",
  "回饋內容已複製": "Feedback copied to clipboard",
  "複製失敗，請改用預覽手動複製": "Copy failed; use the preview to copy manually",
  "已開啟 GitHub，送出前請再檢查內容": "GitHub opened; review the content before submitting",
  "無法開啟 GitHub，請改用複製": "Could not open GitHub; use copy instead",
  "自動重新整理": "Auto refresh",
  "自動：關": "Auto: off",
  "每 5 秒": "Every 5s",
  "每 15 秒": "Every 15s",
  "每 30 秒": "Every 30s",
  "每 60 秒": "Every 60s",
  "本機定時重新掃描；不上传任何資料": "Periodic local rescan; nothing is uploaded",
  "即時切換": "Instant switch",
  "連線方式：即時": "Connection: instant",
  "改成即時切換": "Use instant switch",
  "代理設定": "Proxy settings",
  "即時切換設定": "Instant switch settings",
  "即時切換中": "Instant switching",
  "即時切換上游": "Upstream for instant switch",
  "一鍵即時切換": "One-click instant switch",
  "一鍵啟用即時切換": "Enable instant switch",
  "即時切換與故障轉移": "Instant switch & failover",
  "已啟用即時切換。目前對話需重開一次；之後切換即時生效": "Instant switch enabled. Restart the current chat once; later upstream switches apply immediately.",
  "讓目前正在使用的工具不必重開也能換上游；第一次啟用需重開一次對話。": "Switch upstream without restarting the tool. Restart the current chat once when enabling for the first time.",
  "管理即時切換": "Manage instant switch",
  "目前對話需重開一次；之後切換即時生效": "Restart the current chat once; later switches apply immediately",
  "今天": "Today",
  "近 7 天": "Last 7 days",
  "近 30 天": "Last 30 days",
  "近 90 天": "Last 90 days",
  "近 365 天": "Last 365 days",
  "固定開銷": "Fixed overhead",
  "每日用量（今天）": "Daily usage (today)",
  "各工具固定開銷": "Fixed overhead by tool",
  "每日 token 用量：輸入、輸出與快取": "Daily token usage: input, output and cache",
};

interface Rule {
  re: RegExp;
  out: (m: RegExpMatchArray) => string;
}

const RULES: Rule[] = [
  { re: /^已儲存「(.+)」$/, out: (m) => `Saved “${m[1]}”` },
  { re: /^KumoSwitch 已管理 (\d+) 個供應商。$/, out: (m) => `KumoSwitch manages ${m[1]} providers.` },
  { re: /^已加入 (\d+) 個供應商；下一步可直接選擇。$/, out: (m) => `Added ${m[1]} providers; choose one in the next step.` },
  { re: /^掃描到 (\d+) 個供應商$/, out: (m) => `Found ${m[1]} providers` },
  { re: /^(\d+) 個將匯入 · (\d+) 個衝突$/, out: (m) => `${m[1]} to import · ${m[2]} conflicts` },
  { re: /^匯入 (\d+) 個$/, out: (m) => `Import ${m[1]}` },
  { re: /^已匯入 (\d+) 筆，略過 (\d+) 筆$/, out: (m) => `Imported ${m[1]}, skipped ${m[2]}` },
  { re: /^放棄未儲存的變更？$/, out: () => "Discard unsaved changes?" },
  { re: /^(.+) · (.+) · 工具：模型與連線設定$/, out: (m) => `${m[1]} · ${m[2]} · Tool: model and connection settings` },
  { re: /^這裡列出 (.+) 工具的供應商。點擊供應商即可查看它的模型、Base URL 與金鑰設定。$/, out: (m) => `Providers configured for the ${m[1]} tool. Click one to view its model, base URL and key settings.` },
  { re: /^查看供應商 (.+) 的模型與設定$/, out: (m) => `View model and settings for provider ${m[1]}` },
  { re: /^供應商 (.+) 的操作$/, out: (m) => `Actions for provider ${m[1]}` },
  { re: /^(.+) 的操作$/, out: (m) => `Actions for ${m[1]}` },
  { re: /^已建立完整副本「(.+)」$/, out: (m) => `Created a complete copy of “${m[1]}”` },
  { re: /^已匯入舊明文格式 (\d+) 筆，略過 (\d+) 筆$/, out: (m) => `Imported ${m[1]} legacy plaintext entries; skipped ${m[2]}` },
  { re: /^已解密匯入 (\d+) 筆，略過 (\d+) 筆$/, out: (m) => `Decrypted and imported ${m[1]} entries; skipped ${m[2]}` },
  { re: /^已加密匯出 (\d+) 個供應商。請妥善保管密碼；沒有密碼無法還原。$/, out: (m) => `Encrypted export contains ${m[1]} providers. Keep the password safe; it cannot be recovered.` },
  { re: /^已匯出 (\d+) 個供應商摘要。診斷檔不含完整 API Key。$/, out: (m) => `Exported a summary of ${m[1]} providers. The diagnostics file contains no full API keys.` },
  { re: /^已建立「(.+)」$/, out: (m) => `Created “${m[1]}”` },
  { re: /^已更新「(.+)」$/, out: (m) => `Updated “${m[1]}”` },
  { re: /^已套用「(.+)」$/, out: (m) => `Applied “${m[1]}”` },
  { re: /^已切換到「(.+)」$/, out: (m) => `Switched to “${m[1]}”` },
  { re: /^已新增「(.+)」$/, out: (m) => `Added “${m[1]}”` },
  { re: /^已從相容資料庫匯入「(.+)」$/, out: (m) => `Imported “${m[1]}” from the compatibility database` },
  { re: /^相容資料庫另有 (\d+) 個供應商$/, out: (m) => `The compatibility database has ${m[1]} more providers` },
  { re: /^已鏡像路由堆疊：(.+)$/, out: (m) => `Mirrored route stack: ${m[1]}` },

  { re: /^快速新增 · (.+)$/, out: (m) => `Quick add · ${m[1]}` },

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
  { re: /^供應商詳情 · (.+)$/, out: (m) => `Provider details · ${m[1]}` },
  { re: /^(\d+) 個已知模型$/, out: (m) => `${m[1]} known models` },
  { re: /^(\d+) 個模型$/, out: (m) => `${m[1]} models` },
  { re: /^(\d+) 個可用等級$/, out: (m) => `${m[1]} reasoning levels` },
  { re: /^(\d+) 個思考等級$/, out: (m) => `${m[1]} reasoning levels` },
  { re: /^(\d+) 個版本$/, out: (m) => `${m[1]} versions` },
  { re: /^上次測試 (.+) · (.+)$/, out: (m) => `Last tested ${m[1]} · ${m[2]}` },
  { re: /^取消常用模型 (.+)$/, out: (m) => `Remove favourite ${m[1]}` },
  { re: /^測試模型 (.+)$/, out: (m) => `Test model ${m[1]}` },
  { re: /^實測模型 (.+)$/, out: (m) => `Live test model ${m[1]}` },
  { re: /^自動獲取模型資訊 (.+)$/, out: (m) => `Fetch model info for ${m[1]}` },
  { re: /^思考等級 (.+)$/, out: (m) => `Reasoning level ${m[1]}` },
  { re: /^模型 (.+)$/, out: (m) => `Model ${m[1]}` },
  { re: /^選取實測模型 (.+)$/, out: (m) => `Select ${m[1]} for live test` },
  { re: /^設為常用模型 (.+)$/, out: (m) => `Add favourite ${m[1]}` },
  { re: /^類型（(.+)）$/, out: (m) => `Type (${m[1]})` },
  { re: /^P50 有效吞吐 (.+)；總量 (.+)；慢請求 (.+) 筆$/, out: (m) => `P50 ${m[1]}; total ${m[2]}; slow ${m[3]}` },
  { re: /^有計時請求 (.+) 筆；思考 tokens 只有 Pi／DSH 會分開回報$/, out: (m) => `Timed requests ${m[1]}; reasoning tokens are reported separately only by Pi/DSH` },
  { re: /^(\d+) 天$/, out: (m) => `${m[1]} days` },
  { re: /^(\d+) 個檔案$/, out: (m) => `${m[1]} files` },
  { re: /^載入更多（尚餘 (\d+)）$/, out: (m) => `Load more (${m[1]} left)` },
  { re: /^調整 (.+) 的順序$/, out: (m) => `Reorder ${m[1]}` },
  { re: /^(.+) 快速切換模型$/, out: (m) => `Quick model switch for ${m[1]}` },
  { re: /^(\d+) 個$/, out: (m) => m[1] },
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
  { re: /^(.+) 的設定格式尚未在真實安裝上驗證，請仔細核對下方變更預覽再套用。$/,
    out: (m) => `${m[1]} has not been verified against a real install. Check the change preview below before applying.` },
  { re: /^其他切換工具正以代理模式接管此工具，套用後可能被它覆蓋。$/,
    out: () => "Another switching tool is proxying this tool; it may overwrite what you apply." },
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

/** Translate a single UI string. Components can opt in instead of relying on the DOM walker. */
export function t(key: string): string {
  if (currentLang === "zh") return key;
  if (currentLang === "zh-Hans") return simplify(key);
  return translate(key) ?? key;
}

/** Subscribe to language changes so translated components re-render. */
export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>(() => readLang());
  useEffect(() => {
    const onChange = (event: Event) => setLang((event as CustomEvent<Lang>).detail);
    window.addEventListener("kumoswitch.lang", onChange);
    return () => window.removeEventListener("kumoswitch.lang", onChange);
  }, []);
  return lang;
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
  if (direct !== undefined) return value.replace(trimmed, direct);
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
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    rememberAttr(el, attr);
    const source = originalAttrs.get(el)?.get(attr) ?? value;
    const next = translateFor(lang, source);
    if (next && next !== value) el.setAttribute(attr, next);
  }
  if (SKIP.has(el.tagName)) return;
  el.childNodes.forEach((child) => walk(child, lang));
}

let observer: MutationObserver | null = null;
let currentLang: Lang = "zh";

const WINDOW_TITLES: Record<Lang, string> = {
  en: "kumoSwitch — AI tool provider switcher",
  "zh-Hans": "kumoSwitch — AI 工具供应商切换器",
  zh: "kumoSwitch — AI 工具供應商切換器",
};

function paintWindowTitle(lang: Lang) {
  const title = WINDOW_TITLES[lang];
  document.title = title;
  if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
      .catch(() => {
        /* browser preview */
      });
  }
}

export function applyLang(lang: Lang) {
  currentLang = lang;
  window.dispatchEvent(new CustomEvent<Lang>("kumoswitch.lang", { detail: lang }));
  paintWindowTitle(lang);
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

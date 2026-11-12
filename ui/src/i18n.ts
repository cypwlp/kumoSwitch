/**
 * Runtime translation layer.
 *
 * The app is authored in Traditional Chinese; English is applied by walking the
 * rendered DOM and swapping known phrases. Doing it here (instead of threading a
 * `t()` through every component) also covers strings that come back from the
 * Rust side — restart hints, warnings, error messages — which would otherwise
 * stay Chinese in the English UI.
 */

export type Lang = "zh" | "en";

const KEY = "kumoswitch.lang";
const LEGACY_KEYS = ["switchtower.lang", "switchyard.lang"];

const DICT: Record<string, string> = {
  "AI CLI 供應商切換": "AI CLI provider switcher",
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
  "目前模型": "Current model",
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
  "編輯": "Edit",
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
  "還原": "Restore",
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
  "供應商": "providers",
  "個供應商": "providers",
  "有新版本": "Update available",
  "行內編輯": "inline edit",
  "統計": "Stats",
  "代理": "Proxy",
  "代理／故障轉移": "Proxy / failover",
  "本地反向代理，依序備援；Beta": "Local reverse proxy with ordered failover; beta",
  "啟用代理": "Enable proxy",
  "連接埠": "Port",
  "儲存並套用": "Save & apply",
  "備援順序（勾選加入，順序即故障轉移順序）": "Failover order (check to add; order = failover order)",
  "把工具掛載到代理": "Attach a tool to the proxy",
  "選擇工具…": "Choose a tool…",
  "寫入代理設定": "Write proxy config",
  "還沒有供應商，先到各工具新增或導入": "No providers yet; add or import them first",
  "統計儀表板": "Usage dashboard",
  "讀取 Claude Code／Codex 本機 session log，只在本機計算": "Reads local Claude Code / Codex session logs; computed on-device",
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
};

interface Rule {
  re: RegExp;
  out: (m: RegExpMatchArray) => string;
}

const RULES: Rule[] = [
  { re: /^已儲存「(.+)」$/, out: (m) => `Saved “${m[1]}”` },
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
  { re: /^此供應商未填模型，將沿用目前的「(.+)」。要一併切換請先補上模型名稱。$/,
    out: (m) => `No model set for this provider, so the current “${m[1]}” is kept. Add a model name to switch it too.` },
  { re: /^(.+) 的設定格式尚未在真實安裝上驗證，請仔細核對下方 diff 再套用。$/,
    out: (m) => `${m[1]} has not been verified against a real install. Check the diff below before applying.` },
  { re: /^cc-switch 正以代理模式接管此工具，套用後可能被它覆蓋。$/,
    out: () => "cc-switch is proxying this tool; it may overwrite what you apply." },
];

const ATTRS = ["placeholder", "title", "aria-label", "alt"];

export function readLang(): Lang {
  const hash = window.location.hash.toLowerCase();
  if (hash.includes("lang=en") || hash.split(",").includes("en")) return "en";
  if (hash.includes("lang=zh") || hash.split(",").includes("zh")) return "zh";
  try {
    let stored = window.localStorage.getItem(KEY);
    if (stored === null) {
      for (const legacyKey of LEGACY_KEYS) {
        const legacy = window.localStorage.getItem(legacyKey);
        if (legacy === "zh" || legacy === "en") {
          window.localStorage.setItem(KEY, legacy);
          stored = legacy;
          break;
        }
      }
    }
    if (stored === "zh" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
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
  // Text nodes split by <kbd> keep a separator; translate the core phrase.
  if (trimmed.endsWith(" ·")) {
    const core = translate(trimmed.slice(0, -2));
    if (core) return value.replace(trimmed, `${core} ·`);
  }
  if (trimmed.startsWith("· ")) {
    const core = translate(trimmed.slice(2));
    if (core) return value.replace(trimmed, `· ${core}`);
  }
  // "3 個供應商" style suffixes used inside badges.
  const badge = trimmed.match(/^(\d+) (個供應商|個工具)$/);
  if (badge) {
    const unit = badge[2] === "個工具" ? "tools" : "providers";
    return value.replace(trimmed, `${badge[1]} ${unit}`);
  }
  return null;
}

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);

function walk(root: Node, lang: Lang) {
  if (lang === "zh") return;
  if (root.nodeType === Node.TEXT_NODE) {
    const parent = root.parentElement;
    if (parent && SKIP.has(parent.tagName)) return;
    const text = root.nodeValue ?? "";
    const next = translate(text);
    if (next && next !== text) root.nodeValue = next;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as HTMLElement;
  if (SKIP.has(el.tagName)) return;
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    const next = translate(value);
    if (next && next !== value) el.setAttribute(attr, next);
  }
  el.childNodes.forEach((child) => walk(child, lang));
}

let observer: MutationObserver | null = null;

export function applyLang(lang: Lang) {
  document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (lang === "zh") return;
  walk(document.body, lang);
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") {
        const text = record.target.nodeValue ?? "";
        if (text) {
          const next = translate(text);
          if (next && next !== text) record.target.nodeValue = next;
        }
      } else {
        record.addedNodes.forEach((node) => walk(node, lang));
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

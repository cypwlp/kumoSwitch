# Changelog

## 0.13.0 — 2026-11-13
- 新增設定漂移中心：跨所有 Harness 比對真實設定檔與 kumoSwitch 清單，辨識一致、漂移、未納管與未設定狀態，並可查看 diff、重新套用或匯入未知供應商。
- 模型同步 v2：顯示欄位級差異，可逐欄位選擇是否更新名稱、context window、max output、能力與 metadata。
- 每個供應商記錄模型目錄最後同步時間；模型會保留 `last seen` 狀態，未回報模型會標記但永不自動刪除。
- 新增模型封存與常用模型；常用模型會優先出現在快速切換選單。
- 可從供應商卡片、Ctrl+K 命令面板與系統托盤直接切換模型，並支援切回上一個模型。
- 代理加入模型感知策略：每供應商模型允許清單與模型 ID 映射，可將相同請求映射到不同供應商的實際模型。
- 模型探索新增 Anthropic 分頁、Gemini 原生／OpenAI 相容端點、Ollama fallback 與 OpenRouter 格式支援。
- 新增需明確確認的實際模型實測；會送出極小推論請求並提示可能費用。
- CI 新增每週排程的長期跨平台相容性驗證。
- 視覺系統全面重構為石墨綠、翡翠綠、暖象牙與琥珀色，重新整理亮色／暗色主題、卡片、漂移中心、同步預覽與窄視窗。

## 0.10.0 — 2026-11-12
- 供應商改為多模型資料結構，支援 Model ID、顯示名稱、context window、max output、reasoning／vision／tools 能力、自訂 metadata，以及最近 20 次模型測試狀態與延遲。
- 供應商詳情拆成概覽、模型、連線、紀錄、原始設定五個分頁；可只切換模型直接預覽 diff，不必重寫整份供應商表單。
- 每個模型可獨立測試 `/models` 是否存在，測試結果會標示模型是否真的列在供應商清單中，且不送 prompt、不產生推論費用。
- API Key 只在明確操作時讀取，顯示 30 秒後自動隱藏；支援一鍵清除、複製後 30 秒嘗試清空剪貼簿，並強化暫存密碼／明文與主金鑰的 zeroize。
- 加密備份加入建立時間、供應商數量、明文 SHA-256 與完整性檢查；匯出可選儲存位置，匯入前顯示備份中繼資料。
- 全域設定匯入改為掃描所有 Harness、衝突預覽與逐項決策，支援保留本機、覆蓋、合併模型與建立副本。
- 代理加入固定順序、優先級、加權與健康優先路由，支援每供應商 timeout、429 退避、熔斷、最大併發、TTFB／成功率／換手統計及脫敏失敗原因紀錄。
- 供應商與模型長列表使用 content-visibility 降低大量項目的繪製成本；新增窄視窗版面、完整焦點鎖、ARIA 分頁與可鍵盤操作的拖曳排序。
- 新增真實 Tauri WebView E2E、視覺截圖回歸與模型測試／快速切換／窄視窗 Playwright 測試。

## 0.9.1 — 2026-11-12
- Harness 頁面改為供應商卡片：清楚列出該 Harness 已設定的供應商；點擊卡片即可查看並編輯預設模型、Base URL、API Key 與協議。
- 模型欄位新增建議清單，可直接輸入，也可從內建供應商預設快速選取。
- 「更多」選單改為受控元件：點擊外面、按 Esc、選取任何項目都會關閉，修正選單持續遮擋頁面的問題。
- Playwright 新增 Harness 詳情與選單關閉回歸測試。

## 0.9.0 — 2026-11-12
- 安全性：供應商清單不再經 IPC 回傳完整 API Key；編輯器只在按下「查看」時明確讀取，套用前 diff 中的已知金鑰也改為末四碼遮罩。
- 加密備份：以固定 Argon2id 參數（64 MiB、3 次、2 lanes）派生金鑰，再用 AES-256-GCM 封裝 `.kumoswitch` 備份；保留舊明文 JSON 匯入。
- 代理：共用 reqwest client 與連線池、32 MiB request body 上限（413）、chunked response 即時 flush，修正 SSE 可能被 tiny_http 緩衝到 upstream EOF 的問題。
- 測試：新增 client 重用、body 上限、413、真 SSE 先送達與並行 SSE 壓測，以及 Playwright Chromium UI E2E（金鑰遮罩／清除、加密匯出、diff）。

## 0.8.1 — 2026-11-12
- 可靠性：`providers.json`、`history.json`、備份 manifest 與匯出檔改為原子寫入，避免斷電或程序中斷造成半寫檔。
- 安全性：Unix 上資料目錄收緊為 `0700`、應用檔案為 `0600`；寫回工具設定時保留原有權限位。
- 併發：健康測試歷史的寫入改為序列化，避免自動檢查與手動測試同時寫入時遺失紀錄。
- 供應鏈：新增 Dependabot、RustSec / npm production dependency audit、`SECURITY.md` 漏洞回報政策。

## 0.8.0 — 2026-11-12
- 品牌更名：SwitchTower → kumoSwitch；GitHub repo、npm／Cargo 套件、安裝包、bundle identifier、資料目錄與 updater 全部遷移。
- 舊資料會優先從 `%APPDATA%\SwitchTower`／`~/.config/SwitchTower` 遷移，找不到時再回溯 `SwitchYard`；主題、語言與引導狀態也會繼承 `switchtower.*`／`switchyard.*` local storage。
- macOS Keychain／Linux Secret Service 的主金鑰會在改名後自動從舊 service 複製到 `io.github.cypwlp.kumoswitch`，不影響既有 API Key。
- 官網移除直接點名競品的比較表，改為描述自身的非破壞性寫入、diff、備份與還原設計。
## 0.7.0 — 2026-11-11
- 品牌更名：SwitchYard → SwitchTower；GitHub repo、安裝包、bundle identifier、資料目錄與 updater 全部遷移。
- 舊資料會自動從 `%APPDATA%\SwitchYard`／`~/.config/SwitchYard` 遷移到 `SwitchTower`；主題、語言與引導狀態也會從舊 localStorage key 繼承。
- 跨平台金鑰保護：macOS 使用 Keychain、Linux 使用 Secret Service 保存隨機主金鑰，供應商金鑰以 AES-256-GCM 加密；安全儲存不可用時拒絕寫入明文。
- 自動更新升級為跨平台：Windows 安裝版、macOS Apple Silicon／Intel 與 Linux AppImage 共用一份統一產生的簽章 `latest.json`。
- macOS 新增 Intel x64 DMG；Release 改為先建立草稿、三平台與更新清單全部成功後才正式發布。
- 代理相容性：轉發客戶端 headers（含 `anthropic-beta`）、保留任意 HTTP method、修改連接埠即時重載、長串流改為 30 分鐘 idle timeout。

## 0.6.2 — 2026-11-11
- 修跨平台打包：圖示轉為真 RGBA8（macOS/Linux 拒收調色板 PNG）

## 0.6.1 — 2026-11-11
- 修跨平台 CI：圖示轉 8-bit（macOS 打包不支援 16-bit PNG）、Linux/macOS 補簽章變數

## 0.6.0 — 2026-11-11
- 本地反向代理＋故障轉移（Beta）：依序備援、429/5xx/連線錯誤自動換next、串流穿透、金鑰由代理注入
- 代理設定頁：啟用／連接埠／備援順序／把工具掛載到代理
- CI 跨平台：Windows＋Linux（deb/AppImage）＋macOS（dmg）
- CI 可選 Authenticode 簽章 hook（提供 WINDOWS_CERT_PFX_BASE64 即啟用）
- deploy/：bare-IP nginx 設定＋一鍵部署腳本（同步到個人伺服器）

## 0.5.0 — 2026-11-11
- Hermes 改用真實 schema（providers.<id>.api/key/key_env、model.provider: custom:<id>）
- Command Code 頂層鍵修正為單數 provider
- 13/13 工具皆通過官方／社群範例夹具測試（53 個測試）

## 0.4.0 — 2026-11-11
- 統計儀表板：讀取 Claude Code／Codex 本機 session log，聚合輸入／輸出／快取 token、
  每日用量長條圖、依模型明細與公開單價成本估算；另有跨工具連線測試總覽
- 預設供應商目錄：16 個已知端點（官方＋聚合＋本機），新增供應商時一鍵帶入 base URL／模型／協議
- 統計範圍可選 7／30／90 天

## 0.3.0 — 2026-11-11
- ZCode 改用真實的 `providerRules[]` schema：依 providerId 更新既有規則、否則追加，不再誤寫舊版 config.json
- JSON 編輯器支援陣列索引與追加
- Kilo／Qwen／Crush／ZCode 以官方／社群範例設定檔加入夹具測試（共 46 個測試）
- 新增自動健康檢查：每 10 分鐘重測已有歷史的供應商（預設關閉，更多選單可開）

## 0.2.2 — 2026-11-11
- 修正 CI：可攜版 exe 改以 find 定位（--target 會改變輸出路徑）

## 0.2.1 — 2026-11-11
- 修正 CI：補上 root `tauri` script，tauri-action 才能呼叫 `npm run tauri build`

## 0.2.0 — 2026-11-11

**產品化**
- 系統托盤常駐：托盤右鍵可切換任一工具的任何供應商，左鍵開關視窗，關窗不退出
- 單一實例：重複啟動只會聚焦既有視窗，不再開出第二個托盤圖示
- 首次啟動引導：自動偵測既有設定並一鍵導入
- Ctrl+K 命令面板：跨工具搜尋供應商並直接看 diff
- 供應商複製、三種排序（原始／名稱／最近使用）、最近使用時間記錄
- 診斷摘要匯出（金鑰只保留末四碼）
- 版本號改為 0.2.0

**正確性**
- 供應商寫入改為逐鍵步驟，`models[]`／`compat`／`npm` 只在不存在時建立，
  重新套用不再覆蓋使用者自訂內容
- 修正 `toml_edit` 插入時吃掉鍵上方註解的問題
- YAML 編輯器改寫：縮排寬度從文件偵測，缺父層時在最深的既有祖先底下建立
- 「使用中」改由真實設定檔比對；未填模型時明確警告會沿用舊模型

**新增**
- 從設定檔導入供應商（10 個工具）
- 連線測試（curl 走 stdin，金鑰不進命令列）
- 清單匯入／匯出
- Windows DPAPI 金鑰加密，舊明文檔啟動時自動遷移
- 備份保留上限 20 份

**擴充**
- 新增 3 個工具：Crush、Qwen Code、Kilo Code（共 13 個）
- 自動更新：`tauri-plugin-updater`，minisign 簽章、CI 產出 `latest.json`，
  啟動後自動檢查並可一鍵下載安裝後重啟

**前端**
- 重寫為 React 18 + Vite + TypeScript
- 亮色／暗色／跟隨系統主題，diff 語法高亮，焦點鎖與鍵盤操作，表格行內編輯

## 0.1.0
- 首個版本：10 種工具的定點寫入、diff 預覽、備份還原

# Changelog

## 未發布
- **相容匯入改為 opt-in**：預設不再讀取 `cc-switch.db`；必須在設定 → 相容匯入明確開啟，才會顯示與匯入其他切換工具的供應商。關閉時會清除快取，也不再自動偵測資料庫變更或接管狀態。
- **降低第三方識別**：介面改稱「其他切換工具／相容資料庫」，移除「全選未匯入」一鍵操作與 CC Switch 品牌式文案；保留資料庫路徑與代理模式的技術說明。
- **匯入邊界**：未開啟相容匯入時，匯入與鏡像命令會直接拒絕；只保留唯讀取用，不修改第三方資料庫。

## 0.24.0 — 2026-11-16
- **快速切換與復原**：簡單模式按下套用會直接寫入並建立時間戳備份，通知提供「復原」按鈕；進階模式仍先顯示逐行 diff。可在設定關閉快速切換。
- **快速新增供應商**：簡單模式只要求 Base URL 與 API Key，可選填模型並自動抓取供應商模型目錄；可選擇只儲存或儲存並切換，完整欄位仍可進階編輯。
- **最近使用與釘選**：主畫面顯示最近 5 個切換，供應商可釘選到列表頂端；托盤新增「最近使用」子選單。
- **快速切換安全邊界**：未實測格式會標示「已備份」；CC Switch 接管中、本機以外的金鑰缺失或其他明確衝突仍會強制顯示變更預覽。

## 0.23.0 — 2026-11-16
- **統計儀表板擴大來源**：新增 Pi、Oh My Pi 與 DSH 的本機用量；Claude Code 同一則 assistant 訊息被寫成多個 content block 時只計一次，修正 token 與成本重複累加。
- **統計篩選與速度**：可依來源（Claude Code／Codex／Pi／Oh My Pi／DSH）與模型搜尋篩選，圖表與卡片同步更新；新增平均回應時間、平均輸出速度與 Claude Code 首字延遲估算（以 session log 時間戳推算），Codex 等沒有時間欄位的來源會顯示「—」而不是猜測。
- **簡單／進階模式**：預設簡單模式只保留切換供應商需要的資訊（名稱、目前模型、狀態、套用／詳情）；健康度、協議、模型 chips、排序與設定檔匯入收進進階模式。工具列與設定頁都可切換，偏好存在 localStorage。
- **側欄分組**：已偵測或已有供應商的工具優先顯示，其餘收進「其他工具」；搜尋時自動展開全部結果。
- **用語調整**：Harness → 工具、endpoint → 連線位址、diff → 變更預覽；「Harness」只保留在次要標籤與技術說明。
- **主畫面優先顯示可切換的供應商**：CC Switch 區塊移到供應商清單之後，並在頂端保留一行提示與跳轉；不再把主要操作推到首屏之外。
- **移除 1—2—3 資源麵包屑**：Harness／供應商／模型的階層說明改用單行副標，減少一列視覺噪音。
- **供應商卡片主動作放大**：套用／重新套用改為卡片右側第一顆、橫跨兩欄的主要按鈕，測試與刪除留在次要位置。

## 0.22.0 — 2026-11-16
- **自動獲取模型資訊**：模型編輯器的自動查詢現在會一次補齊 context window、最大輸出與思考等級，不再只處理 thinking levels。
- **更多模型目錄格式**：新增解析 OpenRouter 類 `top_provider.context_length`、`top_provider.max_completion_tokens`，以及 `max_completion_tokens`、`model_spec`、`output_tokens` 等常見欄位。
- **明確保留原值**：供應商 `/models` 沒公開 context 或 max output 時，不會猜測或覆蓋既有值；UI 會顯示實際取得與保留的欄位。
- **模型摘要**：模型列表直接顯示 `128K ctx`、`16K out` 等資訊，展開前即可比較模型容量。
- **回歸測試**：新增 context／max output 自動填入、供應商 metadata 解析與實際 Tauri WebView 回歸。
## 0.21.0 — 2026-11-16
- **模型管理重新整理**：模型改為可搜尋的清單，預設只展開目前模型；每個模型可單獨展開編輯，JSON metadata、能力矩陣與自動同步／實測設定收進進階區。
- **模型搜尋**：可依 Model ID、顯示名稱、context window、思考等級與 metadata 搜尋目前供應商的模型，並可切換是否顯示封存模型。
- **思考等級偵測**：從供應商 `/models` 的 `reasoningLevels`、`reasoning_efforts`、`thinkingLevels`、`thinkingLevelMap` 等欄位解析可用等級；供應商未公開時改用 Harness 支援的候選等級。
- **模型思考等級**：每個模型可保存思考等級與候選清單，並可自動偵測、手動調整候選值；模型同步會顯示並可合併思考等級差異。
- **實際寫入 Harness**：Codex 寫入 `model_reasoning_effort`、Claude 寫入 `CLAUDE_CODE_EFFORT_LEVEL`、OpenCode／Kilo 寫入模型 `reasoningEffort`、Pi 寫入 `modelThinkingLevels`、Oh My Pi 寫入 `modelRoles.default` 的 thinking suffix；其他 Harness 會明確標示尚未支援寫入。
- **安全與相容性**：思考等級只接受正規化字元與已知候選，未知能力仍保留原始 metadata；切換模型時會套用該模型自己的思考等級。
- **回歸測試**：新增模型搜尋、思考等級偵測／保存、實際 diff 寫入與跨 Harness adapter 測試。
## 0.20.1 — 2026-11-16
- 修正供應商選擇器的 modal 滾動結構：標題與底部安全提示固定在 modal 上／下緣，不再隨供應商清單滾到畫面中間。
- 供應商分類與卡片改為在 modal 中央區域獨立滾動，避免 footer 遮住 MiniMax、Groq 等項目。
- 補上 footer 幾何回歸測試，確認清單滾動後底部提示仍貼齊 modal 底緣。
## 0.20.0 — 2026-11-16
- **Harness 圖標**：左側清單、Harness 標題與快速切換都改用各自的原創 SVG／色系標記，未知 Harness 也有安全 fallback。
- **CC Switch 式供應商目錄**：新增供應商改成可搜尋名稱／網址／模型的分類選擇器，包含自訂配置、帳號登入、模型廠商、第三方、雲服務、本機與跨應用分類，以及雙欄供應商卡片。
- **28 個供應商預設**：補齊 OpenAI、Anthropic、Gemini、xAI、DeepSeek、Kimi、智譜 GLM、Qwen、MiniMax、OpenRouter、Groq、SiliconFlow、Ollama、LM Studio、OpenCode Zen、Command Code 等 endpoint 與模型起點。
- **Harness 安裝與管理**：設定頁新增管理中心，可查看 CLI／桌面版支援、設定路徑、CLI 偵測狀態、固定 npm 安裝命令與官方下載入口。
- **CLI 與桌面版分流**：以 `cli`／`desktop`／`both` 標示 adapter 真正涵蓋的介面；Codex、Claude、OpenCode、Qoder、DSH、ZCode、Hermes 與 Qwen 的共用設定可在兩邊生效，Command Code 桌面版另提供官方入口但不冒充已驗證 adapter。
- **安全安裝邊界**：只能從 Harness id 解析白名單內的 npm 套件命令；UI 會先顯示完整命令，不經 shell、不串接使用者輸入，也不任意執行網路下載的安裝腳本。
- **介面整合**：設定導覽加入 Harness 管理；切換頁面與 Harness 時會重設主內容捲動位置；窄視窗的分類列、篩選器與卡片改為單欄／橫向配置。
- **品牌與文件**：應用文案由「AI CLI」擴充為 AI Harness，README 補上各工具實際 CLI／桌面設定範圍、Pi／Oh My Pi 與安裝管理器說明。
## 0.19.0 — 2026-11-16
- 新增 **Pi** Harness：管理 `~/.pi/agent/models.json` 供應商與 `settings.json` 預設 provider／model，支援 OpenCode、OpenAI Responses、Anthropic Messages 與 Google Generative AI。
- 新增 **Oh My Pi (omp)** Harness：管理 `~/.omp/agent/models.yml`／`models.yaml` 與 `config.yml`／`config.yaml` 的 `modelRoles.default`，保留 Pi fork 的自訂 provider schema。
- Pi／Oh My Pi 都支援設定檔掃描匯入、模型探索、連線／模型實測、能力矩陣與共用 Profile。
- 左下角原本分散的語言、主題、統計、代理、守護、Profile、備份、匯入匯出與重新掃描，統一收斂到單一「設定」入口。
- 設定面板新增「工具與頁面」與「資料管理」區塊，窄視窗會自動改成單欄，減少側欄資訊密度。
- 修正啟動 effect 因依賴不穩定而反覆把選取 Harness 重設回 Codex 的問題；現在可正常切換 Pi、Oh My Pi 或其他 Harness。
- 更新為 15 個 Harness 的網站文案、fixture 測試與視覺基準。

## 0.18.0 — 2026-11-16
- **設定守護中心 2.0**：背景指紋監看所有 Harness、狀態分類、來源歸因（kumoSwitch／外部工具／來源不明）、持久化變更時間線，以及「連續兩次漂移後自動修復」的可選策略。
- **跨 Harness 共用 Profile**：可從現有供應商建立一份加密的 endpoint／金鑰／模型組合，指定 Codex、Claude、Gemini 等目標並保留各自的 protocol 與模型映射。
- **模型能力與相容性矩陣**：依 Harness 檢查 context window、tool calling、reasoning、vision 與 protocol；明確不相容會在套用前阻擋，並可用模型 metadata 的 `compatibility_override` 明確放行。
- **API Key 生命週期**：同一供應商可保存多把加密金鑰版本，支援標籤、到期日、測試、切換、刪除與稽核；只有使用中的版本會寫入 Harness。
- **CC Switch 升級**：資料庫快取與自動變更偵測、批次匯入、路由堆疊鏡像到 kumoSwitch 本地代理。
- **代理觀測 2.0**：成功率、TTFB、換手與告警摘要，成功率／連續失敗／429／慢請求／熔斷告警規則，請求決策篩選、常見失敗原因與可匯出的代理診斷。
- **備份／遷移中心**：所有 Harness 的版本時間線、checksum、容量、排程快照、保留策略、手動快照與更新前快照；還原前會先建立安全快照。
- **效能與無障礙**：供應商清單延遲渲染與 `content-visibility`、高對比模式、三級文字大小、舒適／緊湊密度、降低動態效果，以及更完整的鍵盤與 ARIA 標記。
- **國際化**：新增簡體中文介面，改善語言切換時的文字還原與動態 DOM 翻譯。
- **發布品質**：Stable／Beta 更新通道與對應 updater manifest、Build provenance attestation、release asset／簽章／checksum 驗證 job，以及更新前本機設定快照。

## 0.17.0 — 2026-11-14
- 新增常駐「設定與更新」面板：目前版本、手動檢查更新、下載並安裝更新，以及開啟安裝／更新向導的備援入口。
- 設定面板集中顯示主題、自動健康檢查、自動模型同步與本機資料位置，不必再從各頁尋找零散選項。
- 修正 Windows 安裝完成頁勾選文字在深色背景上仍不清楚的問題；改用固定控制項 ID 與高對比文字覆蓋，保留勾選與點擊行為。

## 0.16.2 — 2026-11-14
- 修正 Windows 安裝完成頁的「執行 kumoSwitch」與「建立桌面捷徑」勾選文字在深色背景上對比不足、難以閱讀的問題。
- 完成頁改用高對比文字標籤覆蓋原生勾選控制，同時保留勾選、鍵盤焦點與點擊切換行為。

## 0.16.1 — 2026-11-13
- 修正升級時預設選擇「安裝前解除安裝」，導致 kumoSwitch 在系統匣執行時出現「無法解除安裝」的問題。
- 升級預設改為「直接升級（保留設定）」；直接覆蓋安裝不需要先移除舊版。
- 若使用者仍選擇先解除安裝，安裝器現在會先偵測並嘗試關閉執行中的 kumoSwitch。
- 改善無法解除安裝時的錯誤訊息，明確提示從系統匣結束程式或改用直接升級。

## 0.16.0 — 2026-11-13
- Windows NSIS 安裝器改為 kumoSwitch 品牌介面：暗色主題、專屬側欄與頁首、安裝／解除安裝圖示、繁中／英文安裝文字。
- 安裝器現在會顯示正確的供應商中繼資料與首頁，不再使用 Tauri 預設的白底英文畫面。
- 安裝向導收斂成單一下載入口，明確標示「下載 → 執行安裝器 → 開啟」流程，移除重複的主要下載按鈕。
- 安裝頁改用暗色 kumoSwitch 預覽圖，讓網頁、安裝器與 App 維持一致主題。

## 0.15.1 — 2026-11-13
- 修正 v0.15.0 的 Rust 安全掃描失敗：將 `rusqlite` 升級至 0.42、`libsqlite3-sys` 升級至 0.40，修補 SQLite CVE-2026-119375（RUSTSEC-2026-0459）。
- 將最低 Rust 版本調整為 1.89，與新版 SQLite 依賴一致。
- CC Switch 供應商對照與一鍵匯入功能維持不變。

## 0.15.0 — 2026-11-13
- 新增 CC Switch 資料來源對照：以唯讀方式讀取 `cc-switch.db` 的 Codex／Claude／Gemini／Grok Build 供應商，不再把 CC Switch 自己的資料庫和真實 Harness config 混為一談。
- Codex 頁面明確標示：當 CC Switch 使用代理／路由模式時，`config.toml` 只會看到本地代理 `custom`；CC Switch 的底層供應商會顯示在獨立區塊。
- 新增 CC Switch 供應商資訊：名稱、Base URL、模型、目前路由／候選狀態、金鑰是否存在與資料庫來源。
- 支援一鍵把 CC Switch 供應商匯入 kumoSwitch，API Key 會走 kumoSwitch 原本的加密儲存流程；重複供應商會自動辨識。
- 新增真實 `cc-switch.db` schema 讀取測試與 UI E2E。

## 0.14.2 — 2026-11-13
- 修正統計儀表板長時間停在「掃描 session log 中」：改為逐行串流讀取，不再把每個 JSONL 整檔載入記憶體。
- session log 掃描移到 Tauri 背景執行，掃描期間 UI 不再被同步命令阻塞；並依檔案修改時間跳過時間範圍外的檔案。
- 統計頁新增掃描診斷：顯示 Claude Code／Codex 實際檢查路徑、找到與讀取的檔案數、跳過數、耗時及讀取錯誤。
- 找不到 log 或 log 不含 usage 時，改成可操作的空狀態與「重新掃描」按鈕，不再只有無限等待文字。

## 0.14.1 — 2026-11-13
- 供應商頁改為明確的 `Harness → 供應商 → 模型` 三層導覽；供應商卡片加入獨立識別、Base URL／協議／健康度，模型改為供應商底下的子區塊。
- 供應商頁的標題、說明與操作文案統一改成「供應商」，降低把模型誤認為供應商的情況。
- 重新設計高對比 kumoSwitch App 圖示，並同步更新 Windows ICO、macOS ICNS、Linux PNG、網站 favicon 與執行時視窗圖示。
- App 的「更多」選單新增「開啟安裝／更新向導」，直接開啟帶版本參數的官方安裝頁，避免瀏覽器快取舊頁面。

## 0.14.0 — 2026-11-13
- 漂移中心新增狀態篩選、待處理優先排序、可選取卡片與批次重新套用／批次匯入；批次套用前保留確認與逐 Harness 備份。
- 窄視窗把統計、代理、漂移、匯出與匯入收進「更多操作」，預設不再佔用頂部空間；新增手機版視覺基線。
- 代理新增每請求決策軌跡：記錄候選順序、跳過原因、模型映射、TTFB、HTTP 狀態、逾時與熔斷冷卻，並可在 UI 展開查看。
- 模型同步 v3：每個供應商獨立同步間隔與隨機延遲，失敗採指數式退避，成功後重新排程；既有模型清單作為離線快取並保留最後錯誤。
- 真實模型實測加入近 24 小時次數配額、硬性輸出 token 上限、多模型選取、費用 metadata 粗估與批次執行結果。
- 新增專屬安裝向導 `/install.html`：自動偵測平台、讀取最新 Release、切換 Windows／macOS／Linux 下載、顯示檔案大小、系統需求、安裝步驟、SmartScreen／Gatekeeper 說明與 SHA-256 入口。
- 補上上述功能的 Rust／Playwright 回歸測試、亮暗色與手機視覺快照，並更新官網主介面截圖。

## 0.13.1 — 2026-11-13
- 修正左側 Rail 底部操作區溢出：統計／代理／漂移改成三欄，匯出／匯入改成獨立兩欄，桌面與窄視窗都不再突出邊界。
- 漂移中心初次載入不再顯示容易誤解的「全部 0」，改為骨架畫面；完成檢查後才揭露統計數字。
- 新增沒有可檢查 Harness 時的空狀態與重新檢查提示。
- 新增 1222／760／480 三種寬度的 Rail 越界回歸測試，避免後續按鈕或字型變更再次造成溢出。

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

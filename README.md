# SwitchTower

[![Release](https://img.shields.io/github/v/release/cypwlp/SwitchTower)](https://github.com/cypwlp/SwitchTower/releases)
[![License](https://img.shields.io/github/license/cypwlp/SwitchTower)](LICENSE)

> 切換 AI CLI 供應商，不動其他一行設定。

> **2026-11-11 起更名：SwitchYard → SwitchTower。** 舊版資料會自動遷移；原本的 GitHub 網址由 GitHub 自動重新導向。

一個 Tauri 桌面工具，把 Codex、Claude Code、Gemini CLI、Grok Build、OpenCode、Qoder、DSH、ZCode、Hermes、Command Code、Crush、Qwen Code、Kilo Code 共 13 種工具的供應商設定集中管理。

![主介面](site/assets/screenshot-panel.png)

## 為什麼不用現有的

cc-switch 與 Codex++ 已經很好用，但它們切換供應商時常把整份設定檔重寫一遍：註解消失、外掛設定被清掉、自訂的 MCP 伺服器不見了（見 Codex++ issue #1563）。SwitchTower 的寫入方式從設計上就不允許這件事發生。

![diff 預覽](site/assets/screenshot-diff.png)

## 核心特性

- **非破壞性寫入** —— 不經過序列化器重寫整份檔案。JSON 用自寫的語法樹定位位元組區間、TOML 用 `toml_edit` 保留格式，只替換目標值那一段文字。沒列進 diff 的內容一個位元組都不會變。
- **套用前 diff** —— 按下套用不會立刻寫檔，先顯示「目前 → 套用後」的逐行差異與新增／刪除行數，確認後才寫。
- **自動備份與一鍵還原** —— 每次寫入前把要動的檔案複製到時間戳快照，列表可還原到任一版本。
- **接管狀態偵測** —— 偵測到 cc-switch 正以代理模式接管同一套設定時會提示，避免兩個工具互相覆蓋。
- **本機優先** —— 無帳號、無雲端、無遙測。設定與備份都在 `%APPDATA%\SwitchTower`。
- **跨平台金鑰加密** —— Windows 使用 DPAPI；macOS／Linux 用 Keychain／Secret Service 保存隨機主金鑰，再以 AES-256-GCM 加密 `providers.json` 裡的金鑰。舊的明文檔會自動遷移，安全儲存不可用時拒絕寫入明文。
- **一鍵導入既有供應商** —— 直接從各工具現有的設定檔讀出供應商清單，不必重新輸入。
- **連線測試** —— 套用前可先打一次 `/models` 確認端點與金鑰，回報 HTTP 狀態與延遲。
- **清單匯入／匯出** —— 換機或分享設定時用 JSON 檔搬移。
- **亮色／暗色／跟隨系統主題**、diff 語法高亮、鍵盤操作、表格行內編輯。
- **系統托盤常駐** —— 托盤右鍵可直接切換任一工具的任何供應商；關窗不退出，單一實例。
- **Ctrl+K 命令面板** —— 跨 10 個工具搜尋供應商，Enter 直接看 diff。
- **首次啟動引導** —— 自動偵測既有設定並一鍵導入，不必從零輸入。
- **診斷匯出** —— 一鍵產生環境與設定摘要（金鑰只留末四碼）。
- **自動健康檢查** —— 可開啟每 10 分鐘重測已有歷史的供應商，健康度欄不用手動按。
- **統計儀表板** —— 讀取 Claude Code／Codex 本機 session log，算 token 用量、每日趨勢與成本估算（只在本機計算）。
- **預設供應商目錄** —— 16 個已知端點一鍵帶入，不用手打 base URL。
- **代理／故障轉移（Beta）** —— 本地反向代理，依序備援、429/5xx 自動換下一個、串流穿透。
- **跨平台** —— Windows／Linux／macOS 皆由 CI 建置，main 每次推送跑三平台測試。
- **跨平台自動更新** —— Windows 安裝版、macOS Apple Silicon／Intel 與 Linux AppImage 共用一份簽章驗證的 `latest.json`；可攜版與 Linux deb 仍建議手動替換。

## 支援的工具

| 工具 | 設定檔 | 寫入的鍵 | 驗證狀態 |
| --- | --- | --- | --- |
| Codex | `~/.codex/config.toml` | `model_provider`、`model`、`[model_providers.*]` | 已對真實設定檔驗證 |
| Claude Code | `~/.claude/settings.json` | `env.ANTHROPIC_BASE_URL` / `_AUTH_TOKEN` / `_MODEL` | 已對真實設定檔驗證 |
| Gemini CLI | `~/.gemini/settings.json` + `.env` | `selectedAuthType`、`model.name`、`GOOGLE_GEMINI_BASE_URL`、`GEMINI_API_KEY` | 依官方文件 |
| Grok Build | `~/.grok/config.toml` | `[model.*]`、`[models].default` | 依官方文件 |
| OpenCode | `~/.config/opencode/opencode.json` | `provider.*.options`、頂層 `model` | 依官方文件 |
| Qoder | `~/.qoder/settings.json` | `providers.<qoder-custom-*>` | 已對真實設定檔驗證 |
| DSH | `~/.dsh/settings.yaml` | `llm-pi-ai.providers.*`、`agent-default-model` | 已對真實設定檔驗證 |
| ZCode | `~/.zcode/v2/provider_config.json` | `providerRules[]`、`defaultModelSelection` | 對社群範例驗證 |
| Hermes | `~/.hermes/config.yaml` | `providers.*.api/key`、`model.provider` | 對社群範例驗證 |
| Command Code | `~/.commandcode/providers.json` | `provider.*`（單數） | 對社群範例驗證 |
| Crush | `~/.config/crush/crush.json` | `providers.*` | 依官方文件 |
| Qwen Code | `~/.qwen/settings.json` + `.env` | `modelProviders.*`、`OPENAI_*` | 對官方文件驗證 |
| Kilo Code | `~/.config/kilo/kilo.jsonc` | `provider.*.options` | 對官方範例驗證 |

13 個工具的寫入邏輯都有夹具測試：直接拿官方／社群的範例設定檔跑一遍，驗證目標鍵寫對、且使用者自訂的模型 metadata 不被覆蓋。

## 下載

到 [Releases](https://github.com/cypwlp/SwitchTower/releases) 取得：

- Windows 10／11 x64：NSIS 安裝檔，或免安裝的 `SwitchTower-portable.exe`
- macOS Apple Silicon／Intel：`.dmg`
- Linux x64：`.AppImage` 或 `.deb`
- Release 流程會自動產生並附加 `SHA256SUMS.txt`

目前公開版本是**未簽章 Beta**。Windows 可能顯示 SmartScreen「未知發行者」，macOS 可能顯示 Gatekeeper 警告；請只從本專案 Releases 下載並核對 SHA-256。Windows 需要 WebView2（Win11 內建；Win10 多半已隨 Edge 安裝）。

## 從原始碼建置

```bash
npm install                  # @tauri-apps/cli
npm install --prefix ui      # React / Vite / TypeScript
npm run build                # 先建置前端，再產出 exe 與 NSIS 安裝檔
```

需要 Rust stable、Node 20+，以及 Windows 的 MSVC 建置工具（GNU toolchain 亦可編譯，本機已實測）。

只跑前端開發伺服器：`npm run ui:dev`。加上 `?mock=1` 可在一般瀏覽器預覽介面而不啟動 Tauri。

## 專案結構

```
src-tauri/src/
  adapters.rs    每個工具的宣告式步驟表（檔案 / 格式 / 鍵路徑 / 值）
  jsonc.rs       保留格式的 JSON / JSONC 定點編輯器
  yamlpatch.rs   行導向的 YAML 編輯器
  backup.rs      時間戳快照與還原
  proxy.rs       本機反向代理與有序故障轉移
  store.rs       供應商清單（本機）
  main.rs        Tauri 指令層
ui/              React 18 + Vite + TypeScript 介面
site/            GitHub Pages 落地頁
```

技術棧：**Rust + Tauri 2**（WebView2 原生視窗）、`toml_edit`、`serde_json`、`similar`（diff）、
`windows-sys`（DPAPI）、`keyring`（Keychain／Secret Service）、`aes-gcm`；前端 **React 18 + Vite + TypeScript**，樣式為手寫 CSS 變數，無 CSS 框架。

想加一個新工具，通常只要在 `adapters.rs` 的 `TOOLS` 加一筆宣告，不需要寫新的寫入邏輯。

## 測試

```bash
cd src-tauri
cargo test
```

60 個測試（各平台依可用加密後端略有差異），分五類：

1. **編輯器單元測試** —— 註解、縮排、跳脫字元、任意縮排寬度是否保留。
2. **真實設定檔唯讀檢查** —— 直接讀本機現有的 Codex／Claude／Qoder／DSH 設定，驗證 `[desktop]`、`[plugins.*]`、`[mcp_servers.*]`、既有 provider 全部零改動。
3. **沙箱端到端測試** —— 在暫存目錄真的寫檔再讀回，涵蓋「重複套用冪等」「從無到有建立設定」「Gemini 雙檔寫入」「重新套用不覆蓋自訂 `models[]`／`compat`」。
4. **代理端到端故障轉移** —— 本機啟動 500／200 上游與代理監聽器，驗證 5xx 與連線失敗都會自動切到下一家，並檢查 header／method 轉發與連接埠重載。
5. **金鑰加解密往返** —— Windows 驗證 DPAPI；macOS／Linux 的 AES-256-GCM 路徑由三平台 CI 編譯驗證。

## 授權

MIT。本專案與 OpenAI、Anthropic、Google、xAI、Z.ai、Nous Research 等公司無關。


## 簽章（目前未啟用）

目前公開版本不做 Windows Authenticode、macOS Developer ID 或公證，因此可能出現 SmartScreen／Gatekeeper 警告。這是未簽章 Beta 的預期行為。

CI 仍保留可選的 Windows Authenticode hook：提供 `WINDOWS_CERT_PFX_BASE64` 與 `WINDOWS_CERT_PASSWORD` 時，會在 Tauri 打包前先簽好執行檔與安裝檔，避免破壞 updater 簽章。macOS 也可用 `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID` 啟用 Developer ID 與公證。Tauri updater 的 minisign 驗證與 OS 簽章是兩件事。

## 同步到個人伺服器

`deploy/` 內含 bare-IP nginx 設定與一鍵腳本。在伺服器上執行 `sh deploy.sh` 即把
GitHub Pages 的同一份網站發佈到 `http://<IP>/`（域名若被 ICP 攔截，bare IP 仍可用）。

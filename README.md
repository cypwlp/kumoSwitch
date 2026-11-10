# SwitchYard

> 切換 AI CLI 供應商，不動其他一行設定。

一個 Tauri 桌面工具，把 Codex、Claude Code、Gemini CLI、Grok Build、OpenCode、Qoder、DSH、ZCode、Hermes、Command Code 的供應商設定集中管理。

![主介面](site/assets/screenshot-panel.png)

## 為什麼不用現有的

cc-switch 與 Codex++ 已經很好用，但它們切換供應商時常把整份設定檔重寫一遍：註解消失、外掛設定被清掉、自訂的 MCP 伺服器不見了（見 Codex++ issue #1563）。SwitchYard 的寫入方式從設計上就不允許這件事發生。

![diff 預覽](site/assets/screenshot-diff.png)

## 核心特性

- **非破壞性寫入** —— 不經過序列化器重寫整份檔案。JSON 用自寫的語法樹定位位元組區間、TOML 用 `toml_edit` 保留格式，只替換目標值那一段文字。沒列進 diff 的內容一個位元組都不會變。
- **套用前 diff** —— 按下套用不會立刻寫檔，先顯示「目前 → 套用後」的逐行差異與新增／刪除行數，確認後才寫。
- **自動備份與一鍵還原** —— 每次寫入前把要動的檔案複製到時間戳快照，列表可還原到任一版本。
- **接管狀態偵測** —— 偵測到 cc-switch 正以代理模式接管同一套設定時會提示，避免兩個工具互相覆蓋。
- **本機優先** —— 無帳號、無雲端、無遙測。設定與備份都在 `%APPDATA%\SwitchYard`。

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
| ZCode | `~/.zcode/v2/config.json` | `providers.*.options` | 待實測（UI 會提醒） |
| Hermes | `~/.hermes/config.yaml` | `model.*` | 待實測（UI 會提醒） |
| Command Code | `~/.commandcode/providers.json` | `providers.*` | 待實測（UI 會提醒） |

「待實測」表示該工具的設定格式來自公開文件或第三方整理，尚未在真實安裝上驗證。畫面會標記提醒，套用前請務必看過 diff。

## 下載

到 [Releases](../../releases) 取得 Windows 安裝檔（NSIS）或可攜版 `.exe`。可攜版解壓即用、不寫註冊表。

Windows 10／11 64 位元。需要系統的 WebView2（Win11 內建；Win10 多半已隨 Edge 安裝）。

## 從原始碼建置

```bash
npm install          # 只為了 @tauri-apps/cli
npm run build        # 產出 src-tauri/target/release/switchyard.exe 與安裝檔
```

需要 Rust stable 與 Windows 的 MSVC 建置工具。前端是純 HTML/CSS/JS，沒有打包步驟。

## 專案結構

```
src-tauri/src/
  adapters.rs    每個工具的宣告式步驟表（檔案 / 格式 / 鍵路徑 / 值）
  jsonc.rs       保留格式的 JSON / JSONC 定點編輯器
  yamlpatch.rs   行導向的 YAML 編輯器
  backup.rs      時間戳快照與還原
  store.rs       供應商清單（本機）
  main.rs        Tauri 指令層
ui/              介面（無建置）
site/            GitHub Pages 落地頁
```

想加一個新工具，通常只要在 `adapters.rs` 的 `TOOLS` 加一筆宣告，不需要寫新的寫入邏輯。

## 測試

```bash
cd src-tauri
cargo test
```

包含三類測試：編輯器的單元測試（註解／縮排／轉義是否保留）、YAML 導覽、以及**直接對本機真實設定檔執行的唯讀檢查**（例如確認 Codex 的 `[desktop]`、`[plugins.*]`、`[mcp_servers.*]` 區塊在套用計畫後仍然存在）。

## 授權

MIT。本專案與 OpenAI、Anthropic、Google、xAI、Z.ai、Nous Research 等公司無關。

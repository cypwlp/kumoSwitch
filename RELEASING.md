# 簽章與發佈

目前 Chris／Beta 版本仍為**未簽章 Beta**。Tauri updater 的 `.sig` 簽章一直都有；本文指的是 Windows Authenticode 與 macOS Developer ID／notarization。

## 必要 secrets

CI 已準備好選用 signing；在 GitHub repo → Settings → Secrets and variables → Actions 加入：

### Windows Authenticode

- `WINDOWS_CERT_PFX_BASE64`：OV／EV 程式碼簽章憑證 `.pfx` 的 Base64
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))
  ```
- `WINDOWS_CERT_PASSWORD`：pfx 密碼

設定後 release workflow 會自動簽章 NSIS 安裝檔與 `kumoSwitch-portable.exe`，並加上時間戳。EV 憑證可減少 SmartScreen 警告。

### macOS

- `APPLE_CERTIFICATE`：Developer ID Installer/Application `.p12` 的 Base64
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`：例如 `Developer ID Application: Name (TEAMID)`
- `APPLE_ID`
- `APPLE_PASSWORD`：Apple ID app-specific password
- `APPLE_TEAM_ID`

設定後 dmg／app 會簽章並公證；缺少任一項時 workflow 會明確警告並繼續產出未簽章 Beta。

### Tauri updater

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

這組 secrets 必須與 `src-tauri/tauri.conf.json` 的 `pubkey` 對應。若更換金鑰，舊用戶的自動更新會失效，需要引導手動安裝新版。

## 注意

- 不要把 pfx／p12 或私鑰放進 repo、issue、log。
- 上傳前可用 `node .github/scripts/verify-release.mjs` 檢查資產、checksum 與 manifests。
- 第三方授權清單由 `node .github/scripts/generate-third-party-notices.mjs` 產生。
- 簽章完成後要把 README 與官網的「未簽章 Beta」標示改掉。

## 自動化

`.github/workflows/release.yml` 在 push `v*` tag 時觸發：

1. 建立／更新 draft release
2. Windows／macOS／Linux 平行建置
3. 上傳簽章過的安裝檔、`.sig`、`latest.json`、`SHA256SUMS.txt`
4. 驗證 assets 與版本
5. 自動 publish release

const cfg = window.SITE_CONFIG || {};

function detectRepo() {
  if (cfg.repo && !cfg.repo.startsWith("OWNER/")) return cfg.repo;
  const host = location.hostname;
  const first = location.pathname.split("/").filter(Boolean)[0];
  if (host.endsWith(".github.io") && first) return `${host.split(".")[0]}/${first}`;
  return cfg.repo || "cypwlp/kumoSwitch";
}

const repo = detectRepo();
const repoUrl = `https://github.com/${repo}`;
const releasesUrl = `${repoUrl}/releases`;
const latestReleaseUrl = `${releasesUrl}/latest`;
const latestApi = `https://api.github.com/repos/${repo}/releases/latest`;

for (const [id, href] of [
  ["repoLink", repoUrl],
  ["repoLink2", repoUrl],
  ["releasesLink", releasesUrl],
  ["heroDownload", latestReleaseUrl],
  ["alternateDownload", latestReleaseUrl],
  ["checksumsLink", latestReleaseUrl],
  ["securityChecksums", latestReleaseUrl],
  ["stepsChecksums", latestReleaseUrl],
]) {
  const el = document.getElementById(id);
  if (el) el.href = href;
}

function pickAssets(release) {
  const assets = release.assets || [];
  const dmg = assets.filter((asset) => /\.dmg$/i.test(asset.name));
  const setup = assets.find((asset) => /setup|installer|\.msi$/i.test(asset.name) && !/portable/i.test(asset.name));
  const portable = assets.find((asset) => /portable/i.test(asset.name));
  const macArm = dmg.find((asset) => /aarch64|arm64/i.test(asset.name));
  const macIntel = dmg.find((asset) => /x86_64|x64|intel/i.test(asset.name));
  const appImage = assets.find((asset) => /\.AppImage$/i.test(asset.name));
  const deb = assets.find((asset) => /\.deb$/i.test(asset.name) && !/\.sig$/i.test(asset.name));
  const checksums = assets.find((asset) => /sha256sums|checksums/i.test(asset.name));
  return { setup, portable, macArm, macIntel, appImage, deb, checksums };
}

function detectPlatform() {
  const raw = `${navigator.userAgentData?.platform || ""} ${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
  if (raw.includes("win")) return "windows";
  if (raw.includes("mac") || raw.includes("darwin")) {
    const arm = /arm64|aarch64|apple silicon/i.test(raw);
    if (arm) return "mac-arm";
    return "mac-intel";
  }
  if (raw.includes("linux") || raw.includes("x11")) return "linux";
  return "windows";
}

async function detectPlatformAccurate() {
  let platform = detectPlatform();
  if (platform.startsWith("mac") && navigator.userAgentData?.getHighEntropyValues) {
    try {
      const values = await navigator.userAgentData.getHighEntropyValues(["architecture", "platform"]);
      if (String(values.platform || "").toLowerCase().includes("mac")) {
        platform = String(values.architecture || "").toLowerCase().includes("arm") ? "mac-arm" : "mac-intel";
      }
    } catch {
      /* keep the synchronous fallback */
    }
  }
  return platform;
}

const assets = {
  setup: null,
  portable: null,
  macArm: null,
  macIntel: null,
  appImage: null,
  deb: null,
  checksums: null,
};
let release = null;
let currentPlatform = detectPlatform();

const PLATFORMS = {
  windows: {
    icon: "⊞",
    title: "Windows x64",
    short: "Windows x64",
    description: "NSIS 安裝版，包含開始功能表項目與自動更新。",
    primaryAsset: () => assets.setup,
    primaryLabel: "下載 Windows 安裝檔",
    altLabel: "Windows 可攜版",
    altAsset: () => assets.portable,
    summary: "下載 NSIS 安裝檔，執行後依畫面完成安裝。",
    note: "Windows 目前為未簽章 Beta，SmartScreen 可能顯示「未知發行者」。請確認下載來源並核對 SHA-256。",
    steps: [
      ["執行安裝檔", "雙擊 <code>kumoSwitch_x64-setup.exe</code>。若 SmartScreen 出現警告，確認來源後選擇「更多資訊 → 仍要執行」。"],
      ["完成安裝", "依安裝程式指示選擇位置並完成。安裝版會建立開始功能表項目，之後可接收簽章驗證的更新。"],
      ["啟動並匯入", "打開 kumoSwitch，選擇一個 Harness，匯入既有供應商或建立新的供應商。"],
      ["先看 diff 再套用", "按套用前檢查逐行差異；確認後才寫入。第一次寫入會自動建立備份。"],
    ],
    requirements: ["Windows 10 或 Windows 11（64-bit）", "Microsoft Edge WebView2 Runtime（Windows 11 通常已內建）", "可攜版無需安裝，但仍需 WebView2", "建議保留至少 100 MB 可用空間"],
    warning: "Windows 可能顯示 SmartScreen「未知發行者」",
  },
  "mac-arm": {
    icon: "●",
    title: "macOS Apple Silicon",
    short: "macOS ARM",
    description: "給 M1、M2、M3、M4 與後續 Apple 晶片 Mac 的 DMG。",
    primaryAsset: () => assets.macArm,
    primaryLabel: "下載 macOS ARM DMG",
    altLabel: "Intel Mac 版本",
    altAsset: () => assets.macIntel,
    altPlatform: "mac-intel",
    summary: "下載 Apple Silicon 專用 DMG，拖進「應用程式」即可。",
    note: "macOS 版本目前未公證，首次開啟可能被 Gatekeeper 攔下。請確認下載來源後，用右鍵「打開」或系統設定允許。",
    steps: [
      ["開啟 DMG", "下載 <code>kumoSwitch_*_aarch64.dmg</code> 後雙擊掛載。"],
      ["拖進 Applications", "把 kumoSwitch 拖到「應用程式」資料夾。若 Gatekeeper 阻擋，對 App 按右鍵 →「打開」。"],
      ["啟動並匯入", "第一次啟動會掃描已安裝的 AI CLI，可先匯入既有供應商。"],
      ["檢查後套用", "先查看設定 diff，再按確認。變更前會自動建立時間戳備份。"],
    ],
    requirements: ["macOS 12 Monterey 或更新版本", "Apple Silicon（arm64）", "至少 100 MB 可用空間", "不需要另外安裝 Node.js 或 Rust"],
    warning: "macOS 可能顯示「無法驗證開發者」",
  },
  "mac-intel": {
    icon: "●",
    title: "macOS Intel",
    short: "macOS Intel",
    description: "給 x86_64 架構 Mac 的 DMG。",
    primaryAsset: () => assets.macIntel,
    primaryLabel: "下載 macOS Intel DMG",
    altLabel: "Apple Silicon 版本",
    altAsset: () => assets.macArm,
    altPlatform: "mac-arm",
    summary: "下載 Intel Mac 專用 DMG，拖進「應用程式」即可。",
    note: "macOS 版本目前未公證，首次開啟可能被 Gatekeeper 攔下。請確認下載來源後，用右鍵「打開」或系統設定允許。",
    steps: [
      ["開啟 DMG", "下載 <code>kumoSwitch_*_x64.dmg</code> 後雙擊掛載。"],
      ["拖進 Applications", "把 kumoSwitch 拖到「應用程式」資料夾。若 Gatekeeper 阻擋，對 App 按右鍵 →「打開」。"],
      ["啟動並匯入", "第一次啟動會掃描已安裝的 AI CLI，可先匯入既有供應商。"],
      ["檢查後套用", "先查看設定 diff，再按確認。變更前會自動建立時間戳備份。"],
    ],
    requirements: ["macOS 12 Monterey 或更新版本", "Intel x86_64 Mac", "至少 100 MB 可用空間", "不需要另外安裝 Node.js 或 Rust"],
    warning: "macOS 可能顯示「無法驗證開發者」",
  },
  linux: {
    icon: "◩",
    title: "Linux x64",
    short: "Linux x64",
    description: "AppImage 可直接執行；deb 適合 Debian／Ubuntu 系列。",
    primaryAsset: () => assets.appImage,
    primaryLabel: "下載 Linux AppImage",
    altLabel: "下載 deb 套件",
    altAsset: () => assets.deb,
    summary: "建議先試 AppImage；需要桌面整合時再改用 deb。",
    note: "AppImage 下載後必須先加上執行權限；deb 由系統套件管理器安裝。兩者都會使用本機設定目錄。",
    steps: [
      ["下載 AppImage", "取得 <code>kumoSwitch_*_amd64.AppImage</code>，放到你要保存的位置。"],
      ["加入執行權限", "在檔案所在目錄執行 <code>chmod +x kumoSwitch_*.AppImage</code>。"],
      ["啟動", "雙擊 AppImage，或從終端執行它。若使用 deb，改用系統套件管理器安裝。"],
      ["匯入並套用", "選擇 Harness、匯入供應商，確認 diff 後再寫入設定。"],
    ],
    requirements: ["Linux x86_64", "支援 AppImage 的桌面環境，或 Debian／Ubuntu 系套件管理器", "WebKitGTK 等 Tauri 執行相依套件（發行版可能已內建）", "至少 100 MB 可用空間"],
    warning: "AppImage 需要手動加入執行權限",
  },
};

function formatSize(bytes) {
  if (!bytes) return "—";
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fileLabel(asset, fallback) {
  if (!asset) return fallback;
  return `${asset.name} · ${formatSize(asset.size)}`;
}

function setLink(id, asset, fallbackLabel) {
  const el = document.getElementById(id);
  if (!el) return;
  if (asset?.browser_download_url) {
    el.href = asset.browser_download_url;
    el.textContent = fallbackLabel || "下載";
    el.removeAttribute("aria-disabled");
  } else {
    el.href = latestReleaseUrl;
    el.textContent = "前往 Releases";
    el.setAttribute("aria-disabled", "true");
  }
}

function renderPlatform(platformId, userSelected = false) {
  currentPlatform = platformId;
  const platform = PLATFORMS[platformId];
  if (!platform) return;
  document.querySelectorAll("[data-platform]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.platform === platformId));
  });
  document.getElementById("platformIcon").textContent = platform.icon;
  document.getElementById("platformTitle").textContent = platform.title;
  document.getElementById("platformDescription").textContent = platform.description;
  document.getElementById("platformNote").textContent = platform.note;
  document.getElementById("stepsPlatform").textContent = platform.short;
  document.getElementById("downloadTitle").textContent = platform.title;
  document.getElementById("downloadSummary").textContent = platform.summary;
  document.getElementById("detectedBadge").textContent = userSelected ? "手動選擇" : "已自動偵測";

  const primary = platform.primaryAsset();
  const alternate = platform.altAsset();
  document.getElementById("primaryFile").textContent = primary?.name || "請到 Releases 查看可用檔案";
  document.getElementById("primarySize").textContent = primary ? formatSize(primary.size) : "—";
  document.getElementById("panelFile").textContent = primary?.name || "—";
  document.getElementById("panelVersion").textContent = release?.tag_name || "—";
  setLink("heroDownload", primary, platform.primaryLabel);
  setLink("checksumsLink", assets.checksums, "核對下載檔");
  setLink("securityChecksums", assets.checksums, "取得 checksums");
  setLink("stepsChecksums", assets.checksums, "下載 SHA-256 checksums");

  const altLabel = document.getElementById("alternateLabel");
  const altLink = document.getElementById("alternateDownload");
  altLabel.textContent = platform.altLabel;
  if (alternate?.browser_download_url) {
    altLink.href = alternate.browser_download_url;
    altLink.textContent = alternate.name;
    altLink.removeAttribute("aria-disabled");
  } else if (platform.altPlatform) {
    altLink.href = "#top";
    altLink.textContent = "切換版本";
    altLink.onclick = (event) => {
      event.preventDefault();
      renderPlatform(platform.altPlatform, true);
      document.querySelector(".installer")?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  } else {
    altLink.href = releasesUrl;
    altLink.textContent = "前往 Releases";
    altLink.setAttribute("aria-disabled", "true");
    altLink.onclick = null;
  }

  const stepList = document.getElementById("installSteps");
  stepList.innerHTML = platform.steps.map(([title, body]) => `<li><b>${title}</b><span>${body}</span></li>`).join("");
  const requirements = document.getElementById("requirementsList");
  requirements.innerHTML = platform.requirements.map((item) => `<li>${item}</li>`).join("");

  if (!assets.setup && !assets.macArm && !assets.macIntel && !assets.appImage) {
    document.getElementById("platformNote").textContent = `${platform.warning}。尚無法讀取 Release 檔案清單，下載按鈕會先帶你到 GitHub Releases。`;
  }
}

function applyRelease(data) {
  release = data;
  const picked = pickAssets(data);
  Object.assign(assets, picked);
  const version = data.tag_name || "unknown";
  const date = data.published_at ? data.published_at.slice(0, 10) : "";
  document.getElementById("versionBadge").textContent = `最新版本 ${version}`;
  document.getElementById("trustVersion").textContent = version;
  document.getElementById("releaseMeta").textContent = `由 GitHub Releases 提供${date ? ` · 發布於 ${date}` : ""} · 下載後可用 SHA-256 核對`;
  renderPlatform(currentPlatform, false);
}

document.querySelectorAll("[data-platform]").forEach((button) => {
  button.addEventListener("click", () => renderPlatform(button.dataset.platform, true));
});

renderPlatform(currentPlatform, false);

detectPlatformAccurate().then((platform) => {
  if (platform !== currentPlatform) renderPlatform(platform, false);
});

(async function loadRelease() {
  try {
    const response = await fetch(latestApi, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    applyRelease(await response.json());
  } catch (error) {
    document.getElementById("versionBadge").textContent = "無法取得版本資訊";
    document.getElementById("releaseMeta").textContent = "GitHub API 暫時不可用；下載按鈕會帶你到 Releases，之後可再重新整理。";
    document.getElementById("detectedBadge").textContent = "已自動偵測";
    renderPlatform(currentPlatform, false);
  }
})();
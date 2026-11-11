const cfg = window.SITE_CONFIG || {};

function detectRepo() {
  if (cfg.repo && !cfg.repo.startsWith("OWNER/")) return cfg.repo;
  const host = location.hostname;
  const first = location.pathname.split("/").filter(Boolean)[0];
  if (host.endsWith(".github.io") && first) return `${host.split(".")[0]}/${first}`;
  return cfg.repo || "OWNER/REPO";
}

const repo = detectRepo();

const repoUrl = `https://github.com/${repo}`;
const releasesUrl = `${repoUrl}/releases`;
const latestApi = `https://api.github.com/repos/${repo}/releases/latest`;

["repoLink", "repoLink2", "allReleases"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.href = id === "allReleases" ? releasesUrl : repoUrl;
});

function pickAssets(release) {
  const assets = release.assets || [];
  const dmg = assets.filter((a) => /\.dmg$/i.test(a.name));
  const setup = assets.find((a) => /setup|installer|\.msi$/i.test(a.name) && !/portable/i.test(a.name));
  const portable = assets.find((a) => /portable/i.test(a.name));
  const mac = dmg.find((a) => /aarch64|arm64/i.test(a.name)) || dmg[0];
  const macIntel = dmg.find((a) => /x86_64|x64|intel/i.test(a.name)) || dmg.find((a) => a !== mac);
  const appImage = assets.find((a) => /\.AppImage$/i.test(a.name));
  const deb = assets.find((a) => /\.deb$/i.test(a.name));
  const checksums = assets.find((a) => /sha256sums|checksums/i.test(a.name));
  return { setup, portable, mac, macIntel, appImage, deb, checksums };
}

function wire(link, asset, fallback, hideIfMissing = false) {
  const el = document.getElementById(link);
  if (!el) return;
  if (!asset && hideIfMissing) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.href = asset ? asset.browser_download_url : fallback;
  if (asset) {
    const mb = (asset.size / 1048576).toFixed(1);
    el.title = `${asset.name} · ${mb} MB`;
  }
}

(async function loadRelease() {
  const note = document.getElementById("releaseNote");
  const note2 = document.getElementById("releaseNote2");
  try {
    const res = await fetch(latestApi, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(String(res.status));
    const release = await res.json();
    const { setup, portable, mac, macIntel, appImage, deb, checksums } = pickAssets(release);
    wire("dlSetup", setup, releasesUrl);
    wire("dlSetup2", setup, releasesUrl);
    wire("dlPortable", portable, releasesUrl);
    wire("dlPortable2", portable, releasesUrl);
    wire("dlMac", mac, releasesUrl, true);
    wire("dlMacIntel", macIntel, releasesUrl, true);
    wire("dlLinuxAppImage", appImage, releasesUrl, true);
    wire("dlLinuxDeb", deb, releasesUrl, true);
    wire("dlChecksums", checksums, releasesUrl, true);
    const date = release.published_at ? release.published_at.slice(0, 10) : "";
    const text = `未簽章 Beta · 最新版本 ${release.tag_name}${date ? " · " + date : ""}`;
    if (note) note.textContent = text;
    if (note2) note2.textContent = text;
    if (!portable) {
      ["dlPortable", "dlPortable2"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = "所有版本";
      });
    }
  } catch {
    ["dlSetup", "dlSetup2", "dlPortable", "dlPortable2", "dlMac", "dlMacIntel", "dlLinuxAppImage", "dlLinuxDeb", "dlChecksums"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = false;
        el.href = releasesUrl;
      }
    });
    const fallback = "尚未取得版本資訊，先到 GitHub Releases 查看";
    if (note) note.textContent = fallback;
    if (note2) note2.textContent = fallback;
  }
})();

const cfg = window.SITE_CONFIG || {};
const repo = cfg.repo || "OWNER/REPO";

const repoUrl = `https://github.com/${repo}`;
const releasesUrl = `${repoUrl}/releases`;
const latestApi = `https://api.github.com/repos/${repo}/releases/latest`;

["repoLink", "repoLink2", "allReleases"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.href = id === "allReleases" ? releasesUrl : repoUrl;
});

function pickAssets(release) {
  const assets = release.assets || [];
  const setup = assets.find((a) => /setup|installer|\.msi$/i.test(a.name) && !/portable/i.test(a.name));
  const portable = assets.find((a) => /portable/i.test(a.name));
  return { setup, portable };
}

function wire(link, asset, fallback) {
  const el = document.getElementById(link);
  if (!el) return;
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
    const { setup, portable } = pickAssets(release);
    wire("dlSetup", setup, releasesUrl);
    wire("dlSetup2", setup, releasesUrl);
    wire("dlPortable", portable, releasesUrl);
    wire("dlPortable2", portable, releasesUrl);
    const date = release.published_at ? release.published_at.slice(0, 10) : "";
    const text = `最新版本 ${release.tag_name}${date ? " · " + date : ""}`;
    if (note) note.textContent = text;
    if (note2) note2.textContent = text;
    if (!portable) {
      ["dlPortable", "dlPortable2"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = "所有版本";
      });
    }
  } catch {
    ["dlSetup", "dlSetup2", "dlPortable", "dlPortable2"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.href = releasesUrl;
    });
    const fallback = "尚未發佈版本，先到 GitHub 查看";
    if (note) note.textContent = fallback;
    if (note2) note2.textContent = fallback;
  }
})();

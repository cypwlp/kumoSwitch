/**
 * Generate THIRD-PARTY-NOTICES.md from the npm lockfiles and Cargo metadata.
 * Run from the repository root:
 *   node .github/scripts/generate-third-party-notices.mjs
 *
 * Cargo metadata needs the Rust toolchain on PATH. Licence strings are taken
 * verbatim from the crate / package manifests; missing values are marked.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

function npmPackages(lockPath) {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const out = new Map();
  for (const [path, pkg] of Object.entries(lock.packages ?? {})) {
    if (!path) continue;
    const name = pkg.name ?? path.split("node_modules/").pop() ?? "";
    if (!name || !pkg.version) continue;
    const key = `${name}@${pkg.version}`;
    out.set(key, {
      name,
      version: pkg.version,
      license: pkg.license ?? (pkg.licenses?.length ? pkg.licenses.join(" OR ") : "未標示"),
      source: lockPath,
      homepage: pkg.homepage ?? pkg.repository?.url ?? "",
    });
  }
  return [...out.values()];
}

function cargoPackages() {
  const json = execFileSync(
    process.platform === "win32" ? "cargo.exe" : "cargo",
    ["metadata", "--format-version", "1"],
    { cwd: "src-tauri", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const metadata = JSON.parse(json);
  return metadata.packages
    .filter((pkg) => pkg.source && pkg.name !== "kumoswitch")
    .map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? (pkg.license_file ? `見 ${pkg.license_file}` : "未標示"),
      source: "crates.io",
      homepage: pkg.homepage ?? pkg.repository ?? "",
    }));
}

function row(pkg) {
  const link = pkg.homepage && /^https?:\/\//.test(pkg.homepage)
    ? ` [來源](${pkg.homepage})`
    : "";
  return `| ${pkg.name} | ${pkg.version} | ${pkg.license}${link} |`;
}

function section(title, packages) {
  const sorted = [...packages].sort((a, b) =>
    a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }),
  );
  return [
    `## ${title}（${sorted.length}）`,
    "",
    "| 套件 | 版本 | 授權 |",
    "| --- | --- | --- |",
    ...sorted.map(row),
    "",
  ].join("\n");
}

const npm = [
  ...npmPackages("package-lock.json"),
  ...npmPackages("ui/package-lock.json"),
];
const rust = cargoPackages();

const body = `# 第三方授權宣告

kumoSwitch 使用以下開源套件。各套件的版權與授權條款以其原始專案為準。
本檔案由 \`.github/scripts/generate-third-party-notices.mjs\` 自動產生。

## 專案本身

- kumoSwitch — MIT — 見 [LICENSE](LICENSE)

${section("npm 套件", npm)}
${section("Rust crates", rust)}
`;

writeFileSync("THIRD-PARTY-NOTICES.md", body, "utf8");
console.log(` wrote THIRD-PARTY-NOTICES.md (npm=${npm.length}, rust=${rust.length})`);

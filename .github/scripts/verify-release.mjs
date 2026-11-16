import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [assetsDir = "release-assets", manifestName = "latest.json", tag = process.env.RELEASE_TAG || ""] = process.argv.slice(2);
if (!tag) throw new Error("release tag is required");

const version = tag.replace(/^v/, "");
const manifestPath = join(assetsDir, manifestName);
if (!existsSync(manifestPath)) throw new Error(`missing updater manifest: ${manifestName}`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.version !== version) throw new Error(`manifest version ${manifest.version} does not match ${version}`);

const required = ["windows-x86_64", "linux-x86_64", "darwin-aarch64", "darwin-x86_64"];
for (const key of required) {
  const target = manifest.platforms?.[key];
  if (!target) throw new Error(`manifest missing required platform: ${key}`);
  if (!target.signature || !target.url) throw new Error(`platform ${key} has incomplete updater metadata`);
  const asset = decodeURIComponent(target.url.split("/").at(-1));
  if (!existsSync(join(assetsDir, asset))) throw new Error(`${key} payload is missing: ${asset}`);
}

const sumsPath = join(assetsDir, "SHA256SUMS.txt");
if (!existsSync(sumsPath)) throw new Error("SHA256SUMS.txt is missing");
const sums = readFileSync(sumsPath, "utf8").trim().split("\n").filter(Boolean);
if (sums.length < 8) throw new Error(`SHA256SUMS.txt unexpectedly short: ${sums.length} entries`);
for (const line of sums) {
  const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
  if (!match) throw new Error(`malformed checksum row: ${line}`);
  const file = match[2].replace(/^\.\//, "");
  if (!existsSync(join(assetsDir, file))) throw new Error(`checksum references missing asset: ${file}`);
}

const assets = readdirSync(assetsDir);
if (!assets.some((name) => /setup\.exe$/i.test(name))) throw new Error("Windows installer is missing");
if (!assets.some((name) => /\.dmg$/i.test(name))) throw new Error("macOS DMG is missing");
if (!assets.some((name) => /\.AppImage$/i.test(name))) throw new Error("Linux AppImage is missing");
if (!assets.some((name) => /\.sig$/i.test(name))) throw new Error("signed updater artifacts are missing");

console.log(`verified ${version}: ${manifestName}, ${sums.length} checksums, ${assets.length} assets`);

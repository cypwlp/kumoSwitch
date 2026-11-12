import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [assetsDir = "release-assets", output = "latest.json", argTag] = process.argv.slice(2);
const tag = argTag || process.env.RELEASE_TAG || "";
const repo = process.env.RELEASE_REPO || "cypwlp/kumoSwitch";
const version = process.env.RELEASE_VERSION || tag.replace(/^v/, "");

if (!tag) throw new Error("release tag is required");
if (!version) throw new Error("release version is required");

const files = readdirSync(assetsDir);
const fileSet = new Set(files);
const platforms = {};

function arch(name) {
  if (/universal/i.test(name)) return "universal";
  if (/aarch64|arm64/i.test(name)) return "aarch64";
  if (/x86_64|x64|amd64/i.test(name)) return "x86_64";
  if (/i686|i386|x86/i.test(name)) return "i686";
  throw new Error(`cannot infer architecture from ${name}`);
}

function updaterAsset(signatureName) {
  const payloadName = signatureName.slice(0, -".sig".length);
  if (!fileSet.has(payloadName)) {
    throw new Error(`signature has no matching payload: ${signatureName}`);
  }
  return {
    payloadName,
    signature: readFileSync(join(assetsDir, signatureName), "utf8").trim(),
    url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(payloadName)}`,
  };
}

function add(key, asset) {
  platforms[key] = { signature: asset.signature, url: asset.url };
}

const windowsSig = files.find((name) => /-setup\.exe\.sig$/i.test(name));
if (!windowsSig) throw new Error("Windows NSIS updater signature not found");
const windows = updaterAsset(windowsSig);
const windowsArch = arch(windows.payloadName);
add(`windows-${windowsArch}`, windows);
add(`windows-${windowsArch}-nsis`, windows);

const linuxSig =
  files.find((name) => /\.AppImage\.tar\.gz\.sig$/i.test(name)) ||
  files.find((name) => /\.AppImage\.sig$/i.test(name));
if (!linuxSig) throw new Error("Linux AppImage updater signature not found");
const linux = updaterAsset(linuxSig);
const linuxArch = arch(linux.payloadName);
add(`linux-${linuxArch}`, linux);
add(`linux-${linuxArch}-appimage`, linux);

const macSignatures = files.filter((name) => /\.app\.tar\.gz\.sig$/i.test(name));
if (macSignatures.length === 0) throw new Error("macOS app updater signatures not found");
for (const signatureName of macSignatures) {
  const mac = updaterAsset(signatureName);
  const macArch = arch(mac.payloadName);
  add(`darwin-${macArch}`, mac);
  add(`darwin-${macArch}-app`, mac);
  if (macArch === "universal") {
    add("darwin-aarch64", mac);
    add("darwin-aarch64-app", mac);
    add("darwin-x86_64", mac);
    add("darwin-x86_64-app", mac);
  }
}

const required = (process.env.REQUIRED_PLATFORMS || "windows-x86_64,linux-x86_64,darwin-aarch64,darwin-x86_64")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
for (const key of required) {
  if (!platforms[key]) throw new Error(`required updater platform missing: ${key}`);
}

const manifest = {
  version,
  notes: process.env.RELEASE_NOTES || "",
  pub_date: new Date().toISOString(),
  platforms,
};
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${output} with ${Object.keys(platforms).length} updater targets for ${tag}`);

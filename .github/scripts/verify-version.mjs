import { readFileSync } from "node:fs";

const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const uiVersion = JSON.parse(readFileSync("ui/package.json", "utf8")).version;
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const changelog = readFileSync("CHANGELOG.md", "utf8");
const versions = { package: packageVersion, ui: uiVersion, cargo: cargoVersion, tauri };
const unique = new Set(Object.values(versions));
if (unique.size !== 1) throw new Error(`version mismatch: ${JSON.stringify(versions)}`);
if (!changelog.includes(`## ${packageVersion} `)) throw new Error(`CHANGELOG is missing ${packageVersion}`);
console.log(`version ${packageVersion} is consistent across manifests and changelog`);

/**
 * Report Chinese literals in UI source that are not present in i18n.ts DICT.
 * Usage: node .github/scripts/check-i18n.mjs
 * This is advisory (exit 0) so dynamic strings and tool metadata do not block CI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const UI_SRC = join(ROOT, "ui", "src");
const I18N = join(UI_SRC, "i18n.ts");

const i18n = readFileSync(I18N, "utf8");
const dictKeys = new Set(
  [...i18n.matchAll(/^\s{2}"((?:[^"\\]|\\.)+)":\s/gm)].map((match) => match[1]),
);
const rules = [
  ...i18n.matchAll(/re:\s*\/(.+?)\/[gimsuy]*,/g),
].map((match) => {
  try {
    return new RegExp(match[1]);
  } catch {
    return null;
  }
}).filter(Boolean);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.(tsx|ts)$/.test(name) && name !== "i18n.ts") files.push(path);
  }
  return files;
}

const han = /[\u4e00-\u9fff]/;
const findings = new Map();
for (const file of walk(UI_SRC)) {
  const source = readFileSync(file, "utf8");
  const pattern = /"((?:[^"\\\n]|\\.)+)"|'((?:[^'\\\n]|\\.)+)'/g;
  for (const match of source.matchAll(pattern)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!han.test(value) || value.length < 2) continue;
    if (dictKeys.has(value) || rules.some((rule) => rule.test(value))) continue;
    const line = source.slice(0, match.index).split("\n").length;
    const key = `${relative(ROOT, file)}:${line}`;
    if (!findings.has(key)) findings.set(key, new Set());
    findings.get(key).add(value.slice(0, 120));
  }
}

if (findings.size === 0) {
  console.log("i18n: no unlisted Chinese literals");
} else {
  console.log(`i18n: ${findings.size} locations with unlisted Chinese literals`);
  for (const [where, values] of findings) {
    console.log(`  ${where}`);
    for (const value of values) console.log(`    ${value}`);
  }
}

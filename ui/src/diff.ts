import type { Fmt } from "./types";

/**
 * Tiny hand-rolled tokenizer for the +/- lines of a config diff.
 * It is deliberately forgiving: a diff line may be a fragment of a document,
 * so we never try to parse a whole file — we just colour what looks like a key,
 * a string, a number, a boolean, a comment or a TOML section header.
 */

export type TokenClass =
  | "plain"
  | "key"
  | "str"
  | "num"
  | "bool"
  | "comment"
  | "section"
  | "punct";

export interface Token {
  text: string;
  cls: TokenClass;
}

export type DiffKind = "meta" | "hunk" | "add" | "del" | "ctx";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  tokens: Token[];
}

const WORD = /[A-Za-z0-9_$.\-]/;
const NUMBER = /^[+-]?\d[\d_]*(\.\d+)?([eE][+-]?\d+)?/;
const BOOLS = new Set(["true", "false", "null", "nil", "yes", "no", "on", "off", "~"]);

function separatorFor(fmt: Fmt): string {
  return fmt === "TOML" || fmt === "ENV" ? "=" : ":";
}

function commentStart(fmt: Fmt, line: string, i: number): boolean {
  if (line[i] === "#") return fmt !== "JSON";
  if (fmt === "JSON" && line[i] === "/" && line[i + 1] === "/") return true;
  return false;
}

function readString(line: string, start: number): number {
  const quote = line[start];
  let i = start + 1;
  while (i < line.length) {
    if (line[i] === "\\") {
      i += 2;
      continue;
    }
    if (line[i] === quote) return i + 1;
    i += 1;
  }
  return line.length;
}

function nextNonSpace(line: string, from: number): string {
  let i = from;
  while (i < line.length && /\s/.test(line[i])) i += 1;
  return line[i] ?? "";
}

export function tokenizeLine(line: string, fmt: Fmt): Token[] {
  const out: Token[] = [];
  const push = (text: string, cls: TokenClass) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.cls === cls) last.text += text;
    else out.push({ text, cls });
  };

  const sep = separatorFor(fmt);
  let i = 0;
  let seenContent = false;

  while (i < line.length) {
    const ch = line[i];

    if (/\s/.test(ch)) {
      let j = i;
      while (j < line.length && /\s/.test(line[j])) j += 1;
      push(line.slice(i, j), "plain");
      i = j;
      continue;
    }

    if (commentStart(fmt, line, i)) {
      push(line.slice(i), "comment");
      break;
    }

    // TOML table header: [section] / [[array of tables]]
    if (fmt === "TOML" && ch === "[" && !seenContent) {
      const m = /^\[{1,2}[^\]]*\]{1,2}/.exec(line.slice(i));
      if (m) {
        push(m[0], "section");
        i += m[0].length;
        seenContent = true;
        continue;
      }
    }

    // YAML sequence marker
    if (fmt === "YAML" && ch === "-" && (line[i + 1] === " " || line[i + 1] === undefined)) {
      push("-", "punct");
      i += 1;
      seenContent = true;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const end = readString(line, i);
      const text = line.slice(i, end);
      push(text, nextNonSpace(line, end) === sep ? "key" : "str");
      i = end;
      seenContent = true;
      continue;
    }

    const numMatch = NUMBER.exec(line.slice(i));
    if (numMatch && /[\d]/.test(ch)) {
      push(numMatch[0], "num");
      i += numMatch[0].length;
      seenContent = true;
      continue;
    }

    if (WORD.test(ch)) {
      let j = i;
      while (j < line.length && WORD.test(line[j])) j += 1;
      const word = line.slice(i, j);
      const after = nextNonSpace(line, j);
      if (BOOLS.has(word.toLowerCase()) && after !== sep) push(word, "bool");
      else if (after === sep) push(word, "key");
      else push(word, "plain");
      i = j;
      seenContent = true;
      continue;
    }

    if ("{}[],:=".includes(ch)) {
      push(ch, "punct");
      i += 1;
      if (ch !== ",") seenContent = true;
      continue;
    }

    push(ch, "plain");
    i += 1;
    seenContent = true;
  }

  return out;
}

export function parseDiff(diff: string, fmt: Fmt): DiffLine[] {
  return diff.split("\n").map((raw) => {
    let kind: DiffKind = "ctx";
    if (raw.startsWith("+++") || raw.startsWith("---")) kind = "meta";
    else if (raw.startsWith("@@")) kind = "hunk";
    else if (raw.startsWith("+")) kind = "add";
    else if (raw.startsWith("-")) kind = "del";

    if (kind === "meta" || kind === "hunk") {
      return { kind, text: raw, tokens: [{ text: raw, cls: "plain" }] };
    }
    const body = kind === "add" || kind === "del" ? raw.slice(1) : raw;
    const tokens: Token[] = [{ text: raw.slice(0, raw.length - body.length), cls: "plain" }];
    return { kind, text: raw, tokens: tokens.concat(tokenizeLine(body, fmt)) };
  });
}
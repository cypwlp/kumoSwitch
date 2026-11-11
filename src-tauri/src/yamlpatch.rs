//! Minimal, conservative YAML patcher.
//!
//! YAML has no format-preserving editor in the Rust ecosystem worth the
//! dependency weight here, so we navigate by indentation and splice whole lines.
//! Only the targeted mapping keys are touched; comments and every other line are
//! copied through verbatim. Indentation width is detected, never assumed.

use serde_json::Value;

#[derive(Clone, Debug)]
struct Line {
    indent: usize,
    key: Option<String>,
    text: String,
}

fn is_blank(line: &Line) -> bool {
    let t = line.text.trim();
    t.is_empty() || t.starts_with('#')
}

fn scan(text: &str) -> Vec<Line> {
    text.lines()
        .map(|raw| {
            let trimmed = raw.trim_start_matches(' ');
            let indent = raw.len() - trimmed.len();
            let body = trimmed.trim_end();
            let key = if body.is_empty() || body.starts_with('#') || body.starts_with('-') {
                None
            } else {
                body.find(':').and_then(|c| {
                    let k = body[..c].trim();
                    if k.is_empty() || k.starts_with('"') || k.starts_with('\'') {
                        None
                    } else {
                        Some(k.to_string())
                    }
                })
            };
            Line { indent, key, text: raw.to_string() }
        })
        .collect()
}

/// Width of one indentation level, taken from the document itself.
fn indent_unit(lines: &[Line]) -> usize {
    for (i, line) in lines.iter().enumerate() {
        if is_blank(line) || line.indent == 0 {
            continue;
        }
        if i > 0 && lines[i - 1].key.is_some() && lines[i - 1].indent < line.indent {
            return line.indent - lines[i - 1].indent;
        }
    }
    2
}

fn child_indent(lines: &[Line], hit: usize, unit: usize) -> usize {
    lines
        .iter()
        .skip(hit + 1)
        .find(|l| !is_blank(l))
        .filter(|l| l.indent > lines[hit].indent)
        .map(|l| l.indent)
        .unwrap_or(lines[hit].indent + unit)
}

/// Find `key` among the siblings at `indent`, starting the search at `start`.
fn find_at(lines: &[Line], start: usize, indent: usize, key: &str) -> Option<usize> {
    for (i, line) in lines.iter().enumerate().skip(start) {
        if is_blank(line) {
            continue;
        }
        if line.indent < indent {
            return None;
        }
        if line.indent == indent && line.key.as_deref() == Some(key) {
            return Some(i);
        }
    }
    None
}

/// Walk as deep as the document goes.
/// Returns (deepest existing ancestor, matched depth, indent for the next level).
fn walk(lines: &[Line], path: &[String], unit: usize) -> (Option<usize>, usize, usize) {
    let mut start = 0usize;
    let mut indent = 0usize;
    let mut last = None;
    let mut depth = 0usize;
    for seg in path {
        match find_at(lines, start, indent, seg) {
            Some(hit) => {
                last = Some(hit);
                depth += 1;
                indent = child_indent(lines, hit, unit);
                start = hit + 1;
            }
            None => break,
        }
    }
    (last, depth, indent)
}

/// Last line index belonging to the block opened at `start`.
fn block_end(lines: &[Line], start: usize) -> usize {
    let base = lines[start].indent;
    let mut end = start;
    for (i, line) in lines.iter().enumerate().skip(start + 1) {
        if is_blank(line) {
            continue;
        }
        if line.indent <= base {
            break;
        }
        end = i;
    }
    end
}

fn read_scalar_at(lines: &[Line], idx: usize) -> Option<String> {
    let body = lines[idx].text.trim_start();
    let colon = body.find(':')?;
    let mut rest = body[colon + 1..].trim();
    if let Some(h) = rest.find(" #") {
        rest = &rest[..h];
    }
    let rest = rest.trim();
    if rest.is_empty() {
        return None;
    }
    Some(rest.trim_matches('"').trim_matches('\'').to_string())
}

pub fn get_scalar(text: &str, path: &[String]) -> Option<String> {
    let lines = scan(text);
    let unit = indent_unit(&lines);
    let (last, depth, _) = walk(&lines, path, unit);
    if depth != path.len() {
        return None;
    }
    read_scalar_at(&lines, last?)
}

/// Whether the mapping key at `path` exists at all (even without a scalar value).
pub fn exists(text: &str, path: &[String]) -> bool {
    let lines = scan(text);
    let unit = indent_unit(&lines);
    let (_, depth, _) = walk(&lines, path, unit);
    depth == path.len() && !path.is_empty()
}

/// Direct child keys of the mapping at `path` (empty when it is not a mapping).
pub fn list_keys(text: &str, path: &[String]) -> Vec<String> {
    let lines = scan(text);
    let unit = indent_unit(&lines);
    let (last, depth, indent) = walk(&lines, path, unit);
    if depth != path.len() {
        return Vec::new();
    }
    let Some(hit) = last else { return Vec::new() };
    let mut out = Vec::new();
    for line in lines.iter().skip(hit + 1) {
        if is_blank(line) {
            continue;
        }
        if line.indent < indent {
            break;
        }
        if line.indent == indent {
            if let Some(k) = &line.key {
                out.push(k.clone());
            }
        }
    }
    out
}

fn quote(value: &str) -> String {
    let needs = value.is_empty()
        || value.starts_with('{')
        || value.starts_with('[')
        || value.starts_with('&')
        || value.starts_with('*')
        || value.starts_with('%')
        || value.starts_with('@')
        || value.eq_ignore_ascii_case("true")
        || value.eq_ignore_ascii_case("false")
        || value.eq_ignore_ascii_case("null")
        || value.parse::<f64>().is_ok()
        || value.contains(": ")
        || value.contains(" #");
    if needs {
        format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
    } else {
        value.to_string()
    }
}

fn scalar_yaml(value: &Value) -> String {
    match value {
        Value::String(s) => quote(s),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

/// Render a JSON value as YAML lines, one indentation level per `depth`.
fn render_yaml(value: &Value, depth: usize, unit: usize, out: &mut Vec<String>) {
    let pad = " ".repeat(depth * unit);
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                match v {
                    Value::Object(inner) if !inner.is_empty() => {
                        out.push(format!("{pad}{k}:"));
                        render_yaml(v, depth + 1, unit, out);
                    }
                    Value::Array(items) if !items.is_empty() => {
                        out.push(format!("{pad}{k}:"));
                        render_yaml(v, depth + 1, unit, out);
                    }
                    _ => out.push(format!("{pad}{k}: {}", scalar_yaml(v))),
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                match item {
                    Value::Object(inner) if !inner.is_empty() => {
                        let mut nested = Vec::new();
                        render_yaml(item, depth + 1, unit, &mut nested);
                        if let Some(first) = nested.first() {
                            out.push(format!("{pad}- {}", first.trim_start()));
                            out.extend(nested.into_iter().skip(1));
                        }
                    }
                    _ => out.push(format!("{pad}- {}", scalar_yaml(item))),
                }
            }
        }
        other => out.push(format!("{pad}{}", scalar_yaml(other))),
    }
}

fn join(lines: Vec<String>, original: &str) -> String {
    let mut out = lines.join("\n");
    if original.ends_with('\n') {
        out.push('\n');
    }
    out
}

/// Insert `block` after the ancestor's existing children (or at document end).
fn insert_block(lines: &[Line], ancestor: Option<usize>, block: Vec<String>, original: &str) -> String {
    let mut out: Vec<String> = lines.iter().map(|l| l.text.clone()).collect();
    let at = match ancestor {
        Some(hit) => block_end(lines, hit) + 1,
        None => {
            if !out.is_empty() && !out.last().map(|l| l.trim().is_empty()).unwrap_or(true) {
                out.push(String::new());
            }
            out.len()
        }
    };
    for (offset, line) in block.into_iter().enumerate() {
        out.insert(at + offset, line);
    }
    join(out, original)
}

pub fn set_scalar(text: &str, path: &[String], value: &str) -> Result<String, String> {
    if path.is_empty() {
        return Err("empty path".into());
    }
    let lines = scan(text);
    let unit = indent_unit(&lines);
    let rendered = quote(value);
    let (ancestor, depth, indent) = walk(&lines, path, unit);

    if depth == path.len() {
        let hit = ancestor.ok_or("找不到目標鍵")?;
        let mut out: Vec<String> = lines.iter().map(|l| l.text.clone()).collect();
        out[hit] = format!("{}{}: {}", " ".repeat(lines[hit].indent), path[depth - 1], rendered);
        return Ok(join(out, text));
    }

    let mut block = Vec::new();
    for (offset, seg) in path[depth..].iter().enumerate() {
        let pad = " ".repeat(indent + offset * unit);
        if offset + 1 == path[depth..].len() {
            block.push(format!("{pad}{seg}: {rendered}"));
        } else {
            block.push(format!("{pad}{seg}:"));
        }
    }
    Ok(insert_block(&lines, ancestor, block, text))
}

pub fn set_block(text: &str, path: &[String], value: &Value) -> Result<String, String> {
    if path.is_empty() {
        return Err("empty path".into());
    }
    let lines = scan(text);
    let unit = indent_unit(&lines);
    let (ancestor, depth, indent) = walk(&lines, path, unit);

    let mut body = Vec::new();
    render_yaml(value, 0, unit, &mut body);

    if depth == path.len() {
        let hit = ancestor.ok_or("找不到目標鍵")?;
        let end = block_end(&lines, hit);
        let pad = " ".repeat(indent);
        let mut block = vec![format!("{}{}:", " ".repeat(lines[hit].indent), path[depth - 1])];
        block.extend(body.into_iter().map(|l| format!("{pad}{l}")));
        let mut out: Vec<String> = lines[..hit].iter().map(|l| l.text.clone()).collect();
        out.extend(block);
        out.extend(lines[end + 1..].iter().map(|l| l.text.clone()));
        return Ok(join(out, text));
    }

    let mut block = Vec::new();
    for (offset, seg) in path[depth..].iter().enumerate() {
        block.push(format!("{}{}:", " ".repeat(indent + offset * unit), seg));
    }
    let pad = " ".repeat(indent + (path.len() - depth) * unit);
    block.extend(body.into_iter().map(|l| format!("{pad}{l}")));
    Ok(insert_block(&lines, ancestor, block, text))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn p(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|s| s.to_string()).collect()
    }

    const SAMPLE: &str = "llm-pi-ai:\n  providers:\n    old:\n      apiKey: sk-old\n\nagent:\n  provider: old\n  model: m1\n";

    #[test]
    fn reads_scalars() {
        assert_eq!(get_scalar(SAMPLE, &p(&["agent", "provider"])), Some("old".into()));
        assert_eq!(get_scalar(SAMPLE, &p(&["agent", "missing"])), None);
    }

    #[test]
    fn replaces_scalar_in_place() {
        let out = set_scalar(SAMPLE, &p(&["agent", "provider"]), "new").unwrap();
        assert!(out.contains("  provider: new"));
        assert!(out.contains("  model: m1"));
        assert!(out.contains("    old:\n      apiKey: sk-old"));
    }

    #[test]
    fn inserts_missing_scalar_into_block() {
        let out = set_scalar(SAMPLE, &p(&["agent", "length"]), "high").unwrap();
        assert!(out.contains("  model: m1\n  length: high"), "got: {out}");
    }

    #[test]
    fn inserts_new_provider_block() {
        let v = json!({ "apiKey": "sk-new", "api": "openai-completions", "baseURL": "https://x/v1" });
        let out = set_block(SAMPLE, &p(&["llm-pi-ai", "providers", "fresh"]), &v).unwrap();
        assert!(out.contains("    fresh:\n      apiKey: sk-new"), "got: {out}");
        assert!(out.contains("      baseURL: https://x/v1"));
        assert!(out.contains("agent:\n  provider: old"));
    }

    #[test]
    fn creates_deep_path_without_duplicating_root() {
        let out = set_scalar(SAMPLE, &p(&["llm-pi-ai", "providers", "brand-new", "baseURL"]), "https://y/v1").unwrap();
        assert_eq!(out.matches("llm-pi-ai:").count(), 1, "根區塊被重複建立：{out}");
        assert_eq!(out.matches("  providers:").count(), 1);
        assert!(out.contains("    brand-new:\n      baseURL: https://y/v1"), "got: {out}");
        assert!(out.contains("    old:\n      apiKey: sk-old"));
    }

    #[test]
    fn respects_four_space_indentation() {
        let text = "root:\n    providers:\n        keep:\n            apiKey: sk-keep\n";
        let out = set_scalar(text, &p(&["root", "providers", "added", "baseURL"]), "https://z/v1").unwrap();
        assert!(out.contains("        added:\n            baseURL: https://z/v1"), "got: {out}");
        assert!(out.contains("        keep:\n            apiKey: sk-keep"));
        assert_eq!(out.matches("root:").count(), 1);
    }

    #[test]
    fn respects_tab_free_six_space_indentation() {
        let text = "a:\n      b:\n            c: 1\n";
        let out = set_scalar(text, &p(&["a", "b", "d"]), "2").unwrap();
        assert!(out.contains("            c: 1\n            d: \"2\""), "got: {out}");
    }

    #[test]
    fn lists_child_keys() {
        let keys = list_keys(SAMPLE, &p(&["llm-pi-ai", "providers"]));
        assert_eq!(keys, vec!["old".to_string()]);
        assert!(list_keys(SAMPLE, &p(&["missing"])).is_empty());
    }

    #[test]
    fn creates_deep_path_on_empty_document() {
        let out = set_scalar("", &p(&["a", "b"]), "v").unwrap();
        assert_eq!(out.trim(), "a:\n  b: v");
    }

    #[test]
    fn keeps_comments_and_quoting() {
        let text = "# 註解\nmodel:\n  name: old # 尾註\n";
        let out = set_scalar(text, &p(&["model", "name"]), "true").unwrap();
        assert!(out.contains("# 註解"));
        assert!(out.contains("name: \"true\""), "布林字串要加引號：{out}");
    }
}

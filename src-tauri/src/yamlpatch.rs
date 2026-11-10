//! Minimal, conservative YAML patcher.
//!
//! YAML has no format-preserving editor in the Rust ecosystem that is worth the
//! dependency weight for our use case, so we navigate by indentation and splice
//! whole lines. Only mapping keys are touched; comments and every other line are
//! copied through verbatim.

use serde_json::Value;

#[derive(Clone, Debug)]
struct Line {
    indent: usize,
    key: Option<String>,
    text: String,
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

/// Index of the line holding `path`, plus the indent used by its children.
fn locate(lines: &[Line], path: &[String]) -> Option<(usize, usize)> {
    let mut idx = 0usize;
    let mut indent = 0usize;
    for (depth, seg) in path.iter().enumerate() {
        let mut found = None;
        let mut i = idx;
        while i < lines.len() {
            let line = &lines[i];
            if line.key.is_none() && line.text.trim().is_empty() {
                i += 1;
                continue;
            }
            if line.indent < indent {
                return None;
            }
            if line.indent == indent && line.key.as_deref() == Some(seg.as_str()) {
                found = Some(i);
                break;
            }
            i += 1;
        }
        let hit = found?;
        if depth + 1 == path.len() {
            let child_indent = lines
                .iter()
                .skip(hit + 1)
                .find(|l| !l.text.trim().is_empty())
                .filter(|l| l.indent > lines[hit].indent)
                .map(|l| l.indent)
                .unwrap_or(lines[hit].indent + 2);
            return Some((hit, child_indent));
        }
        idx = hit + 1;
        indent = lines[hit].indent + 2;
    }
    None
}

/// Last line index that belongs to the block opened at `start`.
fn block_end(lines: &[Line], start: usize) -> usize {
    let base = lines[start].indent;
    let mut end = start;
    for (i, line) in lines.iter().enumerate().skip(start + 1) {
        if line.text.trim().is_empty() || line.text.trim_start().starts_with('#') {
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
    let (idx, _) = locate(&lines, path)?;
    read_scalar_at(&lines, idx)
}

fn quote(value: &str) -> String {
    let needs = value.is_empty()
        || value.starts_with('{')
        || value.starts_with('[')
        || value.starts_with('&')
        || value.starts_with('*')
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

/// Render a JSON value as YAML lines indented by `depth` levels.
fn render_yaml(value: &Value, depth: usize, out: &mut Vec<String>) {
    let pad = "  ".repeat(depth);
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                match v {
                    Value::Object(inner) if !inner.is_empty() => {
                        out.push(format!("{pad}{k}:"));
                        render_yaml(v, depth + 1, out);
                    }
                    Value::Array(items) if !items.is_empty() => {
                        out.push(format!("{pad}{k}:"));
                        render_yaml(v, depth + 1, out);
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
                        render_yaml(item, depth + 1, &mut nested);
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

fn scalar_yaml(value: &Value) -> String {
    match value {
        Value::String(s) => quote(s),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

pub fn set_scalar(text: &str, path: &[String], value: &str) -> Result<String, String> {
    let lines = scan(text);
    let rendered = quote(value);
    if let Some((idx, _)) = locate(&lines, path) {
        let indent = " ".repeat(lines[idx].indent);
        let key = path.last().cloned().unwrap_or_default();
        let mut out: Vec<String> = lines.iter().map(|l| l.text.clone()).collect();
        out[idx] = format!("{indent}{key}: {rendered}");
        return Ok(join(out, text));
    }
    if path.is_empty() {
        return Err("empty path".into());
    }
    let (parent, child_indent) = if path.len() == 1 {
        (None, 0usize)
    } else {
        match locate(&lines, &path[..path.len() - 1]) {
            Some(hit) => (Some(hit), hit_child_indent(&lines, hit.0)),
            None => (None, 0usize),
        }
    };
    let mut out: Vec<String> = lines.iter().map(|l| l.text.clone()).collect();
    let key = path.last().cloned().unwrap_or_default();
    match parent {
        Some(hit) => {
            let line = format!("{}{}: {}", " ".repeat(child_indent), key, rendered);
            let end = block_end(&lines, hit.0);
            out.insert(end + 1, line);
        }
        None if path.len() > 1 => {
            // Build the missing parent chain from scratch.
            let mut nested = format!("{key}: {rendered}");
            for seg in path[..path.len() - 1].iter().rev() {
                let indented = nested
                    .lines()
                    .map(|l| format!("  {l}"))
                    .collect::<Vec<_>>()
                    .join("\n");
                nested = format!("{seg}:\n{indented}");
            }
            if !out.is_empty() && !out.last().map(|l| l.trim().is_empty()).unwrap_or(true) {
                out.push(String::new());
            }
            out.extend(nested.lines().map(|l| l.to_string()));
        }
        None => {
            if !out.is_empty() && !out.last().map(|l| l.trim().is_empty()).unwrap_or(true) {
                out.push(String::new());
            }
            out.push(format!("{key}: {rendered}"));
        }
    }
    Ok(join(out, text))
}

fn hit_child_indent(lines: &[Line], hit: usize) -> usize {
    lines
        .iter()
        .skip(hit + 1)
        .find(|l| !l.text.trim().is_empty())
        .filter(|l| l.indent > lines[hit].indent)
        .map(|l| l.indent)
        .unwrap_or(lines[hit].indent + 2)
}

pub fn set_block(text: &str, path: &[String], value: &Value) -> Result<String, String> {
    let lines = scan(text);
    let mut body = Vec::new();
    render_yaml(value, 0, &mut body);

    if path.is_empty() {
        let joined = body.join("\n");
        return Ok(if text.trim().is_empty() {
            format!("{joined}\n")
        } else {
            format!("{text}{joined}\n")
        });
    }

    if let Some((hit, child_indent)) = locate(&lines, path) {
        let indent = " ".repeat(lines[hit].indent);
        let key = path.last().cloned().unwrap_or_default();
        let end = block_end(&lines, hit);
        let mut block = vec![format!("{indent}{key}:")];
        let pad = " ".repeat(child_indent);
        for line in body {
            block.push(format!("{pad}{line}"));
        }
        let mut out: Vec<String> = lines[..hit].iter().map(|l| l.text.clone()).collect();
        out.extend(block);
        out.extend(lines[end + 1..].iter().map(|l| l.text.clone()));
        return Ok(join(out, text));
    }

    let (parent, child_indent) = if path.len() == 1 {
        (None, 0usize)
    } else {
        match locate(&lines, &path[..path.len() - 1]) {
            Some(hit) => (Some(hit.0), hit_child_indent(&lines, hit.0)),
            None => return Err(format!("parent `{}` not found", path[..path.len() - 1].join("."))),
        }
    };
    let indent = " ".repeat(child_indent);
    let key = path.last().cloned().unwrap_or_default();
    let mut block = vec![format!("{indent}{key}:")];
    for line in body {
        block.push(format!("{indent}  {line}"));
    }
    let mut out: Vec<String> = lines.iter().map(|l| l.text.clone()).collect();
    match parent {
        Some(hit) => {
            let end = block_end(&lines, hit);
            for (offset, line) in block.into_iter().enumerate() {
                out.insert(end + 1 + offset, line);
            }
        }
        None => {
            if !out.is_empty() && !out.last().map(|l| l.trim().is_empty()).unwrap_or(true) {
                out.push(String::new());
            }
            out.extend(block);
        }
    }
    Ok(join(out, text))
}

fn join(lines: Vec<String>, original: &str) -> String {
    let mut out = lines.join("\n");
    if original.ends_with('\n') {
        out.push('\n');
    }
    out
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
    fn creates_deep_path_on_empty_document() {
        let out = set_scalar("", &p(&["a", "b"]), "v").unwrap();
        assert_eq!(out.trim(), "a:\n  b: v");
    }
}

//! Format-preserving JSON / JSONC patching.
//!
//! The whole point of this module is that we never re-serialize a user's config
//! file. We locate the byte span of the value we need to change and splice the
//! text in place, so comments, key order, separators and indentation all survive.

use serde_json::Value;
use std::ops::Range;

#[derive(Debug, Clone)]
struct Node {
    span: Range<usize>,
    kind: Kind,
}

#[derive(Debug, Clone)]
enum Kind {
    Object(Vec<Member>),
    Array(#[allow(dead_code)] Vec<Node>),
    Scalar,
}

#[derive(Debug, Clone)]
struct Member {
    key: String,
    value: Node,
}

struct Parser<'a> {
    s: &'a [u8],
}

impl<'a> Parser<'a> {
    fn new(s: &'a str) -> Self {
        Parser { s: s.as_bytes() }
    }

    fn skip_trivia(&self, mut i: usize) -> usize {
        loop {
            while i < self.s.len() && (self.s[i] as char).is_whitespace() {
                i += 1;
            }
            if i + 1 < self.s.len() && self.s[i] == b'/' && self.s[i + 1] == b'/' {
                while i < self.s.len() && self.s[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
            if i + 1 < self.s.len() && self.s[i] == b'/' && self.s[i + 1] == b'*' {
                i += 2;
                while i + 1 < self.s.len() && !(self.s[i] == b'*' && self.s[i + 1] == b'/') {
                    i += 1;
                }
                i = (i + 2).min(self.s.len());
                continue;
            }
            return i;
        }
    }

    fn parse_string(&self, start: usize) -> Result<(usize, String), String> {
        let mut i = start + 1;
        let mut out = String::new();
        while i < self.s.len() {
            match self.s[i] {
                b'\\' => {
                    if i + 1 >= self.s.len() {
                        return Err("unterminated escape".into());
                    }
                    let esc = self.s[i + 1];
                    match esc {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'n' => out.push('\n'),
                        b't' => out.push('\t'),
                        b'r' => out.push('\r'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'u' => {
                            if i + 6 > self.s.len() {
                                return Err("bad \\u escape".into());
                            }
                            let hex = std::str::from_utf8(&self.s[i + 2..i + 6])
                                .map_err(|_| "bad \\u escape")?;
                            let cp = u32::from_str_radix(hex, 16).map_err(|_| "bad \\u escape")?;
                            out.push(char::from_u32(cp).unwrap_or('\u{fffd}'));
                            i += 6;
                            continue;
                        }
                        other => out.push(other as char),
                    }
                    i += 2;
                }
                b'"' => return Ok((i + 1, out)),
                b => {
                    // Copy one UTF-8 scalar (may be multi-byte).
                    let ch_len = utf8_len(b);
                    let end = (i + ch_len).min(self.s.len());
                    out.push_str(std::str::from_utf8(&self.s[i..end]).unwrap_or(""));
                    i = end;
                }
            }
        }
        Err("unterminated string".into())
    }

    fn parse_value(&self, start: usize) -> Result<(Node, usize), String> {
        let i = self.skip_trivia(start);
        if i >= self.s.len() {
            return Err("unexpected end of input".into());
        }
        match self.s[i] {
            b'{' => self.parse_object(i),
            b'[' => self.parse_array(i),
            b'"' => {
                let (end, _) = self.parse_string(i)?;
                Ok((Node { span: i..end, kind: Kind::Scalar }, end))
            }
            _ => {
                let mut j = i;
                while j < self.s.len() {
                    let c = self.s[j];
                    if c == b',' || c == b'}' || c == b']' || (c as char).is_whitespace() {
                        break;
                    }
                    j += 1;
                }
                if j == i {
                    return Err(format!("unexpected byte at {i}"));
                }
                Ok((Node { span: i..j, kind: Kind::Scalar }, j))
            }
        }
    }

    fn parse_object(&self, start: usize) -> Result<(Node, usize), String> {
        let mut i = self.skip_trivia(start + 1);
        let mut members = Vec::new();
        loop {
            i = self.skip_trivia(i);
            if i >= self.s.len() {
                return Err("unterminated object".into());
            }
            if self.s[i] == b'}' {
                return Ok((
                    Node { span: start..i + 1, kind: Kind::Object(members) },
                    i + 1,
                ));
            }
            if self.s[i] == b',' {
                i += 1;
                continue;
            }
            if self.s[i] != b'"' {
                return Err(format!("expected key at byte {i}"));
            }
            let (after_key, key) = self.parse_string(i)?;
            let colon = self.skip_trivia(after_key);
            if colon >= self.s.len() || self.s[colon] != b':' {
                return Err("expected ':' after key".into());
            }
            let (value, next) = self.parse_value(colon + 1)?;
            members.push(Member { key, value });
            i = next;
        }
    }

    fn parse_array(&self, start: usize) -> Result<(Node, usize), String> {
        let mut i = start + 1;
        let mut items = Vec::new();
        loop {
            i = self.skip_trivia(i);
            if i >= self.s.len() {
                return Err("unterminated array".into());
            }
            if self.s[i] == b']' {
                return Ok((Node { span: start..i + 1, kind: Kind::Array(items) }, i + 1));
            }
            if self.s[i] == b',' {
                i += 1;
                continue;
            }
            let (node, next) = self.parse_value(i)?;
            items.push(node);
            i = next;
        }
    }
}

fn utf8_len(b: u8) -> usize {
    if b < 0x80 {
        1
    } else if b >> 5 == 0b110 {
        2
    } else if b >> 4 == 0b1110 {
        3
    } else if b >> 3 == 0b11110 {
        4
    } else {
        1
    }
}

fn line_indent(text: &str, pos: usize) -> String {
    let start = text[..pos].rfind('\n').map(|p| p + 1).unwrap_or(0);
    text[start..pos]
        .chars()
        .take_while(|c| *c == ' ' || *c == '\t')
        .collect()
}

fn indent_unit(text: &str) -> String {
    for line in text.lines() {
        let trimmed = line.trim_start();
        let indent = &line[..line.len() - trimmed.len()];
        if !trimmed.is_empty() && !indent.is_empty() {
            return indent.to_string();
        }
    }
    "  ".to_string()
}

fn render(value: &Value, indent: &str, unit: &str) -> String {
    match value {
        Value::Object(map) if !map.is_empty() => {
            let inner = format!("{indent}{unit}");
            let body: Vec<String> = map
                .iter()
                .map(|(k, v)| {
                    format!(
                        "{inner}{}: {}",
                        serde_json::to_string(k).unwrap_or_else(|_| "\"\"".into()),
                        render(v, &inner, unit)
                    )
                })
                .collect();
            format!("{{\n{}\n{indent}}}", body.join(",\n"))
        }
        Value::Object(_) => "{}".to_string(),
        Value::Array(items) if !items.is_empty() => {
            let inner = format!("{indent}{unit}");
            let body: Vec<String> = items
                .iter()
                .map(|v| format!("{inner}{}", render(v, &inner, unit)))
                .collect();
            format!("[\n{}\n{indent}]", body.join(",\n"))
        }
        Value::Array(_) => "[]".to_string(),
        other => serde_json::to_string(other).unwrap_or_else(|_| "null".into()),
    }
}

fn find<'n>(node: &'n Node, key: &str) -> Option<&'n Node> {
    match &node.kind {
        Kind::Object(members) => members.iter().find(|m| m.key == key).map(|m| &m.value),
        Kind::Array(items) => key.parse::<usize>().ok().and_then(|i| items.get(i)),
        _ => None,
    }
}

fn root(text: &str) -> Result<Node, String> {
    let p = Parser::new(text);
    let (node, _) = p.parse_value(0)?;
    Ok(node)
}

/// Read a value by dotted path. Returns `None` when the file or path is absent.
pub fn get(text: &str, path: &[String]) -> Option<Value> {
    if path.is_empty() {
        return None;
    }
    let node = root(text).ok()?;
    let mut cur = &node;
    for seg in path {
        cur = find(cur, seg)?;
    }
    let raw = &text[cur.span.clone()];
    serde_json::from_str(raw).ok()
}

/// Set one value by dotted path, splicing text so that everything around the
/// target is left byte-identical.
pub fn set(text: &str, path: &[String], value: &Value) -> Result<String, String> {
    if path.is_empty() {
        return Err("empty path".into());
    }
    let unit = indent_unit(text);

    if text.trim().is_empty() {
        let body = render(value, "", &unit);
        let mut nested = body;
        for seg in path.iter().rev() {
            nested = format!(
                "{{\n  {}: {}\n}}",
                serde_json::to_string(seg).unwrap_or_default(),
                nested
            );
        }
        return Ok(format!("{nested}\n"));
    }

    let node = root(text)?;
    if !matches!(node.kind, Kind::Object(_) | Kind::Array(_)) {
        return Err("config root is not a JSON container".into());
    }

    // Walk as deep as the document already goes.
    let mut container = &node;
    let mut depth = 0usize;
    for (idx, seg) in path.iter().enumerate() {
        match find(container, seg) {
            Some(child) => {
                if idx == path.len() - 1 {
                    let indent = line_indent(text, child.span.start);
                    let rendered = render(value, &indent, &unit);
                    let mut out = String::with_capacity(text.len() + rendered.len());
                    out.push_str(&text[..child.span.start]);
                    out.push_str(&rendered);
                    out.push_str(&text[child.span.end..]);
                    return Ok(out);
                }
                if !matches!(child.kind, Kind::Object(_) | Kind::Array(_)) {
                    return Err(format!("`{}` exists but is not a container", seg));
                }
                container = child;
                depth = idx + 1;
            }
            None => break,
        }
    }

    // Build the missing tail, then insert it into the deepest existing object.
    let mut missing = value.clone();
    for seg in path[depth + 1..].iter().rev() {
        let mut map = serde_json::Map::new();
        map.insert(seg.clone(), missing);
        missing = Value::Object(map);
    }

    let (obj_start, last_end, first_start) = match &container.kind {
        Kind::Object(m) => (
            container.span.start,
            m.last().map(|x| x.value.span.end),
            m.first().map(|x| x.value.span.start),
        ),
        Kind::Array(items) => (
            container.span.start,
            items.last().map(|x| x.span.end),
            items.first().map(|x| x.span.start),
        ),
        _ => return Err("target is not a container".into()),
    };
    let is_array = matches!(container.kind, Kind::Array(_));
    let close = container.span.end - 1;
    let base_indent = line_indent(text, obj_start);
    let child_indent = if let Some(first) = first_start {
        line_indent(text, first)
    } else {
        format!("{base_indent}{unit}")
    };

    let rendered = render(&missing, &child_indent, &unit);
    let entry = if is_array {
        rendered.clone()
    } else {
        let key = serde_json::to_string(&path[depth]).unwrap_or_default();
        format!("{key}: {rendered}")
    };

    let (insert_at, snippet) = if let Some(last) = last_end {
        let tail = &text[last..close];
        match tail.find(',') {
            // Keep an existing trailing comma in front of the new member.
            Some(comma) => (last + comma + 1, format!("
{child_indent}{entry}")),
            None => (last, format!(",
{child_indent}{entry}")),
        }
    } else {
        (
            obj_start + 1,
            format!("
{child_indent}{entry}
{base_indent}"),
        )
    };

    let mut out = String::with_capacity(text.len() + snippet.len());
    out.push_str(&text[..insert_at]);
    out.push_str(&snippet);
    out.push_str(&text[insert_at..]);
    Ok(out)
}

/// Remove block/line comments so plain `serde_json` can read JSONC files.
#[cfg_attr(not(test), allow(dead_code))]
pub fn strip_comments(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    let mut in_string = false;
    while i < bytes.len() {
        let c = bytes[i];
        if in_string {
            out.push(c as char);
            if c == b'\\' && i + 1 < bytes.len() {
                out.push(bytes[i + 1] as char);
                i += 2;
                continue;
            }
            if c == b'"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if c == b'"' {
            in_string = true;
            out.push('"');
            i += 1;
            continue;
        }
        if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i = (i + 2).min(bytes.len());
            continue;
        }
        out.push(c as char);
        i += 1;
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

    const SAMPLE: &str = r#"{
  // 這是註解，絕對不能被吃掉
  "theme": "dark",
  "env": {
    "ANTHROPIC_BASE_URL": "https://old.example.com",
    "KEEP_ME": "yes"
  },
  "plugins": { "a@b": { "enabled": true } }
}
"#;

    #[test]
    fn replaces_leaf_and_keeps_everything_else() {
        let out = set(SAMPLE, &p(&["env", "ANTHROPIC_BASE_URL"]), &json!("https://new")).unwrap();
        assert!(out.contains("// 這是註解，絕對不能被吃掉"));
        assert!(out.contains("\"theme\": \"dark\""));
        assert!(out.contains("\"KEEP_ME\": \"yes\""));
        assert!(out.contains("\"ANTHROPIC_BASE_URL\": \"https://new\""));
        assert!(!out.contains("old.example.com"));
    }

    #[test]
    fn inserts_missing_sibling_with_indent() {
        let out = set(SAMPLE, &p(&["env", "ANTHROPIC_AUTH_TOKEN"]), &json!("sk-1")).unwrap();
        assert!(out.contains("\"ANTHROPIC_AUTH_TOKEN\": \"sk-1\""));
        assert!(out.contains("\"KEEP_ME\": \"yes\""));
        let parsed: Value = serde_json::from_str(&strip_comments(&out)).unwrap();
        assert_eq!(parsed["env"]["ANTHROPIC_AUTH_TOKEN"], json!("sk-1"));
        assert_eq!(parsed["env"]["KEEP_ME"], json!("yes"));
    }

    #[test]
    fn creates_nested_objects_from_scratch() {
        let out = set(SAMPLE, &p(&["providers", "x", "baseUrl"]), &json!("https://a")).unwrap();
        let parsed: Value = serde_json::from_str(&strip_comments(&out)).unwrap();
        assert_eq!(parsed["providers"]["x"]["baseUrl"], json!("https://a"));
        assert_eq!(parsed["theme"], json!("dark"));
    }

    #[test]
    fn writes_whole_object_value() {
        let v = json!({ "baseURL": "https://x", "models": [{ "id": "m" }] });
        let out = set(SAMPLE, &p(&["providers", "deep"]), &v).unwrap();
        let parsed: Value = serde_json::from_str(&strip_comments(&out)).unwrap();
        assert_eq!(parsed["providers"]["deep"]["models"][0]["id"], json!("m"));
        assert_eq!(parsed["plugins"]["a@b"]["enabled"], json!(true));
    }

    #[test]
    fn handles_empty_document() {
        let out = set("", &p(&["env", "K"]), &json!("v")).unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["env"]["K"], json!("v"));
    }

    #[test]
    fn survives_strings_with_braces_and_commas() {
        let text = "{\n  \"a\": \"}{,\",\n  \"b\": 1\n}\n";
        let out = set(text, &p(&["c"]), &json!(2)).unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["a"], json!("}{,"));
        assert_eq!(parsed["c"], json!(2));
    }

    #[test]
    fn reads_nested_values() {
        assert_eq!(
            get(SAMPLE, &p(&["env", "KEEP_ME"])),
            Some(json!("yes"))
        );
        assert_eq!(get(SAMPLE, &p(&["missing"])), None);
    }
}

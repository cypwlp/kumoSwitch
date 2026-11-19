//! Small Responses API bridge for OpenAI Chat Completions providers.
//!
//! Codex speaks Responses. Some Harnesses in the KumoSwitch store point at
//! OpenAI-compatible Chat Completions endpoints, so requests and completed
//! responses are translated at the local gateway boundary.

use serde_json::{json, Value};

fn text_value(value: &Value) -> String {
    value.as_str().map(str::to_string).unwrap_or_else(|| value.to_string())
}

fn chat_content(value: &Value) -> Value {
    let Some(items) = value.as_array() else {
        return Value::String(text_value(value));
    };
    let mut parts = Vec::new();
    for item in items {
        match item.get("type").and_then(Value::as_str).unwrap_or("") {
            "input_text" | "output_text" | "text" => {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    parts.push(json!({"type":"text", "text":text}));
                }
            }
            "input_image" | "image_url" => {
                let url = item.get("image_url").and_then(Value::as_str)
                    .or_else(|| item.pointer("/image_url/url").and_then(Value::as_str));
                if let Some(url) = url {
                    parts.push(json!({"type":"image_url", "image_url":{"url":url}}));
                }
            }
            _ => {}
        }
    }
    if parts.iter().all(|part| part.get("type").and_then(Value::as_str) == Some("text")) {
        Value::String(parts.iter().filter_map(|part| part.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join("\n"))
    } else {
        Value::Array(parts)
    }
}

fn append_response_input(messages: &mut Vec<Value>, input: &Value) {
    let Some(items) = input.as_array() else {
        if !input.is_null() {
            messages.push(json!({"role":"user", "content":chat_content(input)}));
        }
        return;
    };
    for item in items {
        match item.get("type").and_then(Value::as_str).unwrap_or("message") {
            "message" => {
                let role = item.get("role").and_then(Value::as_str).unwrap_or("user");
                let role = if role == "developer" { "system" } else { role };
                let content = item.get("content").map(chat_content).unwrap_or(Value::String(String::new()));
                if !content.as_str().is_some_and(str::is_empty) {
                    messages.push(json!({"role":role, "content":content}));
                }
            }
            "function_call" => {
                let call_id = item.get("call_id").and_then(Value::as_str).unwrap_or("call_kumoswitch");
                let name = item.get("name").and_then(Value::as_str).unwrap_or("");
                let arguments = item.get("arguments").and_then(Value::as_str).unwrap_or("{}");
                messages.push(json!({
                    "role":"assistant",
                    "tool_calls":[{"id":call_id,"type":"function","function":{"name":name,"arguments":arguments}}]
                }));
            }
            "function_call_output" => {
                let call_id = item.get("call_id").and_then(Value::as_str).unwrap_or("");
                let output = item.get("output").map(text_value).unwrap_or_default();
                messages.push(json!({"role":"tool", "tool_call_id":call_id, "content":output}));
            }
            _ => {}
        }
    }
}

fn chat_tool(tool: &Value) -> Option<Value> {
    if tool.get("type").and_then(Value::as_str) != Some("function") {
        return None;
    }
    let function = if let Some(function) = tool.get("function") {
        function.clone()
    } else {
        json!({
            "name":tool.get("name")?,
            "description":tool.get("description"),
            "parameters":tool.get("parameters").cloned().unwrap_or_else(|| json!({"type":"object","properties":{}})),
            "strict":tool.get("strict")
        })
    };
    Some(json!({"type":"function", "function":function}))
}

fn chat_tool_choice(choice: &Value) -> Value {
    if let Some(kind) = choice.as_str() {
        return Value::String(kind.to_string());
    }
    if choice.get("type").and_then(Value::as_str) == Some("function") {
        let name = choice.get("name").and_then(Value::as_str)
            .or_else(|| choice.pointer("/function/name").and_then(Value::as_str));
        if let Some(name) = name {
            return json!({"type":"function", "function":{"name":name}});
        }
    }
    json!("auto")
}

pub fn responses_request_to_chat(body: &[u8]) -> Result<Vec<u8>, String> {
    let source: Value = serde_json::from_slice(body).map_err(|error| format!("Codex request JSON 無效：{error}"))?;
    let mut messages = Vec::new();
    if let Some(instructions) = source.get("instructions").and_then(Value::as_str).filter(|text| !text.is_empty()) {
        messages.push(json!({"role":"system", "content":instructions}));
    }
    if let Some(input) = source.get("input") {
        append_response_input(&mut messages, input);
    }
    let mut target = json!({
        "model":source.get("model").and_then(Value::as_str).unwrap_or(""),
        "messages":messages,
        "stream":false
    });
    for key in ["temperature", "top_p", "parallel_tool_calls", "stop", "seed", "service_tier"] {
        if let Some(value) = source.get(key) {
            target[key] = value.clone();
        }
    }
    if let Some(max_tokens) = source.get("max_output_tokens") {
        target["max_tokens"] = max_tokens.clone();
    }
    if let Some(tools) = source.get("tools").and_then(Value::as_array) {
        let mapped = tools.iter().filter_map(chat_tool).collect::<Vec<_>>();
        if !mapped.is_empty() {
            target["tools"] = Value::Array(mapped);
        }
    }
    if let Some(choice) = source.get("tool_choice") {
        target["tool_choice"] = chat_tool_choice(choice);
    }
    if let Some(format) = source.pointer("/text/format") {
        match format.get("type").and_then(Value::as_str) {
            Some("json_object") => target["response_format"] = json!({"type":"json_object"}),
            Some("json_schema") => {
                let schema = format.get("schema").cloned().unwrap_or_else(|| json!({"type":"object"}));
                target["response_format"] = json!({
                    "type":"json_schema",
                    "json_schema":{
                        "name":format.get("name").and_then(Value::as_str).unwrap_or("response"),
                        "strict":format.get("strict").and_then(Value::as_bool).unwrap_or(false),
                        "schema":schema
                    }
                });
            }
            _ => {}
        }
    }
    serde_json::to_vec(&target).map_err(|error| format!("無法建立 Chat Completions 請求：{error}"))
}

fn anthropic_content(value: &Value) -> Vec<Value> {
    let Some(items) = value.as_array() else {
        return vec![json!({"type":"text","text":text_value(value)})];
    };
    let mut parts = Vec::new();
    for item in items {
        match item.get("type").and_then(Value::as_str).unwrap_or("") {
            "input_text" | "output_text" | "text" => {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    parts.push(json!({"type":"text","text":text}));
                }
            }
            "input_image" | "image_url" => {
                let image = item.get("image_url").and_then(Value::as_str)
                    .or_else(|| item.pointer("/image_url/url").and_then(Value::as_str));
                if let Some(image) = image {
                    if let Some(data) = image.strip_prefix("data:") {
                        if let Some((mime, payload)) = data.split_once(";base64,") {
                            parts.push(json!({"type":"image","source":{"type":"base64","media_type":mime,"data":payload}}));
                        }
                    } else {
                        parts.push(json!({"type":"image","source":{"type":"url","url":image}}));
                    }
                }
            }
            _ => {}
        }
    }
    parts
}

fn anthropic_tool(tool: &Value) -> Option<Value> {
    if tool.get("type").and_then(Value::as_str) != Some("function") { return None; }
    Some(json!({
        "name":tool.get("name")?,
        "description":tool.get("description"),
        "input_schema":tool.get("parameters").cloned().unwrap_or_else(|| json!({"type":"object","properties":{}}))
    }))
}

pub fn responses_request_to_anthropic(body: &[u8]) -> Result<Vec<u8>, String> {
    let source: Value = serde_json::from_slice(body).map_err(|error| format!("Codex request JSON 無效：{error}"))?;
    let mut system_parts = Vec::new();
    if let Some(instructions) = source.get("instructions").and_then(Value::as_str).filter(|text| !text.is_empty()) {
        system_parts.push(instructions.to_string());
    }
    let mut messages = Vec::new();
    if let Some(input) = source.get("input") {
        if let Some(items) = input.as_array() {
            for item in items {
                match item.get("type").and_then(Value::as_str).unwrap_or("message") {
                    "message" => {
                        let role = item.get("role").and_then(Value::as_str).unwrap_or("user");
                        let content = item.get("content").map(anthropic_content).unwrap_or_default();
                        if role == "system" || role == "developer" {
                            system_parts.extend(content.iter().filter_map(|part| part.get("text").and_then(Value::as_str).map(str::to_string)));
                        } else if !content.is_empty() {
                            messages.push(json!({"role":if role == "assistant" {"assistant"} else {"user"}, "content":content}));
                        }
                    }
                    "function_call" => {
                        let arguments = item.get("arguments").and_then(Value::as_str).unwrap_or("{}");
                        let input = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
                        messages.push(json!({"role":"assistant","content":[{"type":"tool_use","id":item.get("call_id").and_then(Value::as_str).unwrap_or("call_kumoswitch"),"name":item.get("name").and_then(Value::as_str).unwrap_or(""),"input":input}]}));
                    }
                    "function_call_output" => {
                        messages.push(json!({"role":"user","content":[{"type":"tool_result","tool_use_id":item.get("call_id").and_then(Value::as_str).unwrap_or(""),"content":item.get("output").map(text_value).unwrap_or_default()}]}));
                    }
                    _ => {}
                }
            }
        } else if !input.is_null() {
            messages.push(json!({"role":"user","content":anthropic_content(input)}));
        }
    }
    let max_tokens = source.get("max_output_tokens").and_then(Value::as_u64).unwrap_or(4096).clamp(1, 200_000);
    let mut target = json!({
        "model":source.get("model").and_then(Value::as_str).unwrap_or(""),
        "max_tokens":max_tokens,
        "messages":messages,
        "stream":false
    });
    if !system_parts.is_empty() { target["system"] = json!(system_parts.join("\n\n")); }
    for key in ["temperature", "top_p"] {
        if let Some(value) = source.get(key) { target[key] = value.clone(); }
    }
    if let Some(tools) = source.get("tools").and_then(Value::as_array) {
        let mapped = tools.iter().filter_map(anthropic_tool).collect::<Vec<_>>();
        if !mapped.is_empty() { target["tools"] = Value::Array(mapped); }
    }
    if let Some(choice) = source.get("tool_choice") {
        match choice.as_str() {
            Some("auto") => target["tool_choice"] = json!({"type":"auto"}),
            Some("required") => target["tool_choice"] = json!({"type":"any"}),
            Some("none") => { target.as_object_mut().unwrap().remove("tools"); }
            _ => {
                let name = choice.get("name").and_then(Value::as_str)
                    .or_else(|| choice.pointer("/function/name").and_then(Value::as_str));
                if let Some(name) = name { target["tool_choice"] = json!({"type":"tool","name":name}); }
            }
        }
    }
    serde_json::to_vec(&target).map_err(|error| format!("無法建立 Anthropic Messages 請求：{error}"))
}

fn response_text_content(content: &Value) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(parts) => parts.iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>().join("\n"),
        _ => String::new(),
    }
}

pub fn chat_response_to_responses(body: &[u8]) -> Result<Value, String> {
    let source: Value = serde_json::from_slice(body).map_err(|error| format!("Chat Completions 回應 JSON 無效：{error}"))?;
    let choice = source.pointer("/choices/0").ok_or_else(|| "Chat Completions 回應缺少 choices".to_string())?;
    let message = choice.get("message").ok_or_else(|| "Chat Completions 回應缺少 assistant message".to_string())?;
    let chat_id = source.get("id").and_then(Value::as_str).unwrap_or("kumoswitch");
    let mut output = Vec::new();
    let text = response_text_content(message.get("content").unwrap_or(&Value::Null));
    if !text.is_empty() {
        output.push(json!({
            "id":format!("msg_{chat_id}"),
            "type":"message",
            "status":"completed",
            "role":"assistant",
            "content":[{"type":"output_text","text":text,"annotations":[]}]
        }));
    }
    if let Some(refusal) = message.get("refusal").and_then(Value::as_str).filter(|text| !text.is_empty()) {
        output.push(json!({
            "id":format!("msg_{chat_id}_refusal"),
            "type":"message",
            "status":"completed",
            "role":"assistant",
            "content":[{"type":"refusal","refusal":refusal}]
        }));
    }
    if let Some(calls) = message.get("tool_calls").and_then(Value::as_array) {
        for (index, call) in calls.iter().enumerate() {
            let function = call.get("function").unwrap_or(&Value::Null);
            let call_id = call.get("id").and_then(Value::as_str).map(str::to_string)
                .unwrap_or_else(|| format!("call_{chat_id}_{index}"));
            output.push(json!({
                "id":format!("fc_{call_id}"),
                "type":"function_call",
                "status":"completed",
                "call_id":call_id,
                "name":function.get("name").and_then(Value::as_str).unwrap_or(""),
                "arguments":function.get("arguments").and_then(Value::as_str).unwrap_or("{}")
            }));
        }
    }
    let usage = source.get("usage").unwrap_or(&Value::Null);
    let input_tokens = usage.get("prompt_tokens").and_then(Value::as_u64).unwrap_or(0);
    let output_tokens = usage.get("completion_tokens").and_then(Value::as_u64).unwrap_or(0);
    let total_tokens = usage.get("total_tokens").and_then(Value::as_u64).unwrap_or(input_tokens + output_tokens);
    let finish_reason = choice.get("finish_reason").and_then(Value::as_str).unwrap_or("stop");
    let incomplete = finish_reason == "length";
    let created_at = source.get("created").and_then(Value::as_i64)
        .unwrap_or_else(|| std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|value| value.as_secs() as i64).unwrap_or(0));
    Ok(json!({
        "id":format!("resp_{chat_id}"),
        "object":"response",
        "created_at":created_at,
        "status":if incomplete {"incomplete"} else {"completed"},
        "error":null,
        "incomplete_details":if incomplete {json!({"reason":"max_output_tokens"})} else {Value::Null},
        "model":source.get("model").and_then(Value::as_str).unwrap_or(""),
        "output":output,
        "instructions":null,
        "max_output_tokens":null,
        "metadata":{},
        "parallel_tool_calls":true,
        "previous_response_id":null,
        "reasoning":{"effort":null,"summary":null},
        "store":false,
        "temperature":null,
        "text":{"format":{"type":"text"},"verbosity":"medium"},
        "tool_choice":"auto",
        "tools":[],
        "top_p":1.0,
        "truncation":"auto",
        "usage":{
            "input_tokens":input_tokens,
            "input_tokens_details":{"cached_tokens":usage.pointer("/prompt_tokens_details/cached_tokens").and_then(Value::as_u64).unwrap_or(0)},
            "output_tokens":output_tokens,
            "output_tokens_details":{"reasoning_tokens":usage.pointer("/completion_tokens_details/reasoning_tokens").and_then(Value::as_u64).unwrap_or(0)},
            "total_tokens":total_tokens
        }
    }))
}

pub fn anthropic_response_to_responses(body: &[u8]) -> Result<Value, String> {
    let source: Value = serde_json::from_slice(body).map_err(|error| format!("Anthropic 回應 JSON 無效：{error}"))?;
    let blocks = source.get("content").and_then(Value::as_array).ok_or_else(|| "Anthropic 回應缺少 content".to_string())?;
    let response_id = source.get("id").and_then(Value::as_str).unwrap_or("kumoswitch");
    let mut output = Vec::new();
    let mut text_parts = Vec::new();
    for (index, block) in blocks.iter().enumerate() {
        match block.get("type").and_then(Value::as_str).unwrap_or("") {
            "text" => {
                if let Some(text) = block.get("text").and_then(Value::as_str) { text_parts.push(text.to_string()); }
            }
            "tool_use" => {
                if !text_parts.is_empty() {
                    output.push(json!({"id":format!("msg_{response_id}_{}", output.len()),"type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":text_parts.join(""),"annotations":[]}]}));
                    text_parts.clear();
                }
                let call_id = block.get("id").and_then(Value::as_str).unwrap_or("call_kumoswitch");
                output.push(json!({
                    "id":format!("fc_{call_id}"),"type":"function_call","status":"completed",
                    "call_id":call_id,
                    "name":block.get("name").and_then(Value::as_str).unwrap_or(""),
                    "arguments":serde_json::to_string(block.get("input").unwrap_or(&Value::Null)).unwrap_or_else(|_| "{}".into())
                }));
            }
            _ => { let _ = index; }
        }
    }
    if !text_parts.is_empty() {
        output.push(json!({"id":format!("msg_{response_id}_{}", output.len()),"type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":text_parts.join(""),"annotations":[]}]}));
    }
    let usage = source.get("usage").unwrap_or(&Value::Null);
    let input_tokens = usage.get("input_tokens").and_then(Value::as_u64).unwrap_or(0);
    let output_tokens = usage.get("output_tokens").and_then(Value::as_u64).unwrap_or(0);
    let incomplete = source.get("stop_reason").and_then(Value::as_str) == Some("max_tokens");
    let created_at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|value| value.as_secs() as i64).unwrap_or(0);
    Ok(json!({
        "id":format!("resp_{response_id}"),"object":"response","created_at":created_at,
        "status":if incomplete {"incomplete"} else {"completed"},"error":null,
        "incomplete_details":if incomplete {json!({"reason":"max_output_tokens"})} else {Value::Null},
        "model":source.get("model").and_then(Value::as_str).unwrap_or(""),"output":output,
        "instructions":null,"max_output_tokens":null,"metadata":{},"parallel_tool_calls":true,
        "previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":false,
        "temperature":null,"text":{"format":{"type":"text"},"verbosity":"medium"},"tool_choice":"auto",
        "tools":[],"top_p":1.0,"truncation":"auto",
        "usage":{"input_tokens":input_tokens,"input_tokens_details":{"cached_tokens":usage.get("cache_read_input_tokens").and_then(Value::as_u64).unwrap_or(0)},"output_tokens":output_tokens,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":input_tokens+output_tokens}
    }))
}

fn sse_event(event: &str, value: &Value, out: &mut String) {
    out.push_str("event: ");
    out.push_str(event);
    out.push_str("\ndata: ");
    out.push_str(&serde_json::to_string(value).unwrap_or_else(|_| "{}".into()));
    out.push_str("\n\n");
}

pub fn responses_sse(response: &Value) -> String {
    let mut out = String::new();
    let mut in_progress = response.clone();
    in_progress["status"] = json!("in_progress");
    in_progress["output"] = json!([]);
    sse_event("response.created", &json!({"type":"response.created","response":in_progress}), &mut out);
    sse_event("response.in_progress", &json!({"type":"response.in_progress","response":in_progress}), &mut out);
    if let Some(items) = response.get("output").and_then(Value::as_array) {
        for (output_index, item) in items.iter().enumerate() {
            let item_id = item.get("id").and_then(Value::as_str).unwrap_or("");
            let mut pending_item = item.clone();
            pending_item["status"] = json!("in_progress");
            if item.get("type").and_then(Value::as_str) == Some("message") {
                pending_item["content"] = json!([]);
            } else if item.get("type").and_then(Value::as_str) == Some("function_call") {
                pending_item["arguments"] = json!("");
            }
            sse_event("response.output_item.added", &json!({"type":"response.output_item.added","output_index":output_index,"item":pending_item}), &mut out);
            if item.get("type").and_then(Value::as_str) == Some("message") {
                if let Some(content) = item.get("content").and_then(Value::as_array) {
                    for (content_index, part) in content.iter().enumerate() {
                        if part.get("type").and_then(Value::as_str) != Some("output_text") { continue; }
                        let text = part.get("text").and_then(Value::as_str).unwrap_or("");
                        let added = json!({"type":"output_text","text":"","annotations":[]});
                        sse_event("response.content_part.added", &json!({"type":"response.content_part.added","item_id":item_id,"output_index":output_index,"content_index":content_index,"part":added}), &mut out);
                        sse_event("response.output_text.delta", &json!({"type":"response.output_text.delta","item_id":item_id,"output_index":output_index,"content_index":content_index,"delta":text}), &mut out);
                        sse_event("response.output_text.done", &json!({"type":"response.output_text.done","item_id":item_id,"output_index":output_index,"content_index":content_index,"text":text}), &mut out);
                        sse_event("response.content_part.done", &json!({"type":"response.content_part.done","item_id":item_id,"output_index":output_index,"content_index":content_index,"part":part}), &mut out);
                    }
                }
            } else if item.get("type").and_then(Value::as_str) == Some("function_call") {
                let arguments = item.get("arguments").and_then(Value::as_str).unwrap_or("");
                sse_event("response.function_call_arguments.delta", &json!({"type":"response.function_call_arguments.delta","item_id":item_id,"output_index":output_index,"delta":arguments}), &mut out);
                sse_event("response.function_call_arguments.done", &json!({"type":"response.function_call_arguments.done","item_id":item_id,"output_index":output_index,"arguments":arguments}), &mut out);
            }
            sse_event("response.output_item.done", &json!({"type":"response.output_item.done","output_index":output_index,"item":item}), &mut out);
        }
    }
    sse_event("response.completed", &json!({"type":"response.completed","response":response}), &mut out);
    out.push_str("data: [DONE]\n\n");
    out
}

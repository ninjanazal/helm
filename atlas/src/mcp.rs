//! Minimal MCP server over stdio (newline-delimited JSON-RPC 2.0).
//! Re-indexes incrementally before a call when the last index is older than a few seconds.

use crate::{db, index, query};
use anyhow::Result;
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::Path;
use std::time::{Duration, Instant};

const FRESH: Duration = Duration::from_secs(5);

fn tools() -> Value {
    let s = |props: Value, req: &[&str]| json!({ "type": "object", "properties": props, "required": req });
    json!([
        { "name": "find", "description": "Search code and docs in this repo. Returns ranked path:start-end hits with a short snippet. Use before Grep/Read; then Read only the returned ranges.",
          "inputSchema": s(json!({ "query": {"type":"string"}, "k": {"type":"integer","description":"max hits, default 8"} }), &["query"]) },
        { "name": "symbol", "description": "Where a function/class/signal/section is defined, with reference counts.",
          "inputSchema": s(json!({ "name": {"type":"string"} }), &["name"]) },
        { "name": "neighbors", "description": "Callers of a symbol and what it calls, as path:line. Edges are marked parsed (unique) or guessed (name clash).",
          "inputSchema": s(json!({ "name": {"type":"string"} }), &["name"]) },
        { "name": "outline", "description": "Symbols of one file with line ranges, instead of reading the whole file.",
          "inputSchema": s(json!({ "path": {"type":"string","description":"repo-relative path"} }), &["path"]) },
        { "name": "stats", "description": "Index size and tokens saved so far.", "inputSchema": s(json!({}), &[]) }
    ])
}

pub fn serve(root: &Path) -> Result<()> {
    let mut c = db::open(root)?;
    index::index(&mut c, root)?;
    let mut last = Instant::now();
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line?;
        let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
        let Some(id) = msg.get("id").cloned() else { continue }; // notification
        let method = msg["method"].as_str().unwrap_or("");
        let result = match method {
            "initialize" => Ok(json!({
                "protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"),
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "atlas", "version": env!("CARGO_PKG_VERSION") },
                "instructions": "atlas indexes this repo (code in 12 languages incl. GDScript, plus docs). Prefer find/symbol/outline/neighbors over Grep and whole-file Read: they return path:lines, then Read just that range."
            })),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": tools() })),
            "tools/call" => {
                if last.elapsed() > FRESH {
                    let _ = index::index(&mut c, root);
                    last = Instant::now();
                }
                let a = &msg["params"]["arguments"];
                let str_arg = |k: &str| a[k].as_str().unwrap_or("").to_string();
                let r = match msg["params"]["name"].as_str().unwrap_or("") {
                    "find" => query::find(&c, &str_arg("query"), a["k"].as_u64().unwrap_or(8) as usize),
                    "symbol" => query::symbol(&c, &str_arg("name")),
                    "neighbors" => query::neighbors(&c, &str_arg("name")),
                    "outline" => query::outline(&c, &str_arg("path")),
                    "stats" => query::stats(&c),
                    n => Err(anyhow::anyhow!("unknown tool {n}")),
                };
                Ok(match r {
                    Ok(t) => json!({ "content": [{ "type": "text", "text": t }] }),
                    Err(e) => json!({ "content": [{ "type": "text", "text": e.to_string() }], "isError": true }),
                })
            }
            _ => Err(json!({ "code": -32601, "message": format!("method not found: {method}") })),
        };
        let resp = match result {
            Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
            Err(e) => json!({ "jsonrpc": "2.0", "id": id, "error": e }),
        };
        writeln!(out, "{resp}")?;
        out.flush()?;
    }
    Ok(())
}

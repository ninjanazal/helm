//! atlas: a local code + docs graph for agents. One binary, no services, no models required.
//!
//!   atlas index [--root DIR]          build or refresh .atlas/graph.db (incremental)
//!   atlas find <query> [-k N]         ranked path:lines hits
//!   atlas symbol <name>               where a symbol is defined, with ref counts
//!   atlas neighbors <name>            callers and callees
//!   atlas outline <path>              symbols in one file
//!   atlas stats [--json]              index size and tokens saved (no re-index)
//!   atlas status [--json]             is the index stale? files changed since the last index
//!   atlas mcp                         MCP server on stdio (for Claude Code)

mod db;
mod index;
mod lang;
mod mcp;
mod query;

use anyhow::{bail, Result};
use std::path::{Path, PathBuf};

fn find_root(start: &Path) -> PathBuf {
    let mut p = start.to_path_buf();
    loop {
        if p.join(".atlas").is_dir() || p.join(".git").exists() {
            return p;
        }
        if !p.pop() {
            return start.to_path_buf();
        }
    }
}

fn main() -> Result<()> {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let mut root = None;
    let mut k = 8usize;
    let mut json = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--root" if i + 1 < args.len() => { root = Some(PathBuf::from(args.remove(i + 1))); args.remove(i); }
            "-k" if i + 1 < args.len() => { k = args.remove(i + 1).parse().unwrap_or(8); args.remove(i); }
            "--json" => { json = true; args.remove(i); }
            _ => i += 1,
        }
    }
    let cwd = std::env::current_dir()?;
    let root = std::fs::canonicalize(root.unwrap_or_else(|| find_root(&cwd)))?;
    let cmd = args.first().map(String::as_str).unwrap_or("help");
    let rest = args.get(1..).map(|a| a.join(" ")).unwrap_or_default();

    if cmd == "mcp" {
        return mcp::serve(&root);
    }
    if cmd == "help" || cmd == "-h" || cmd == "--help" {
        println!("{}", include_str!("main.rs").lines().skip(2).take(9).map(|l| l.trim_start_matches("//!")).collect::<Vec<_>>().join("\n"));
        return Ok(());
    }
    let fresh = !root.join(".atlas/graph.db").exists();
    let mut c = db::open(&root)?;
    // stats/status only read: they must not hide staleness by re-indexing.
    if matches!(cmd, "stats" | "status") {
        let indexed_at: Option<i64> = c.query_row("SELECT v FROM meta WHERE k='indexed_at'", [], |r| r.get::<_, String>(0)).ok().and_then(|v| v.parse().ok());
        if cmd == "status" {
            let (changed, added, removed) = if fresh || indexed_at.is_none() { (0, 0, 0) } else { index::pending(&c, &root)? };
            let stale = changed + added + removed;
            let state = if indexed_at.is_none() { "missing" } else if stale > 0 { "stale" } else { "fresh" };
            let out = if json {
                serde_json::json!({ "state": state, "changed": changed, "added": added, "removed": removed, "indexed_at": indexed_at }).to_string()
            } else {
                format!("{state}: {changed} changed, {added} new, {removed} deleted since the last index")
            };
            println!("{out}");
            return Ok(());
        }
        let mut j = query::stats_json(&c);
        j["indexed_at"] = serde_json::json!(indexed_at);
        j["db_bytes"] = serde_json::json!(std::fs::metadata(root.join(".atlas/graph.db")).map(|m| m.len()).unwrap_or(0));
        println!("{}", if json { j.to_string() } else { query::stats(&c)? });
        return Ok(());
    }
    let t = std::time::Instant::now();
    let st = index::index(&mut c, &root)?;
    let out = match cmd {
        "index" => format!("indexed {} files ({} changed, {} removed) in {:.2?}\n{}", st.seen, st.changed, st.removed, t.elapsed(), query::stats(&c)?),
        "find" => query::find(&c, &rest, k)?,
        "symbol" => query::symbol(&c, &rest)?,
        "neighbors" => query::neighbors(&c, &rest)?,
        "outline" => query::outline(&c, &rest)?,
        other => bail!("unknown command {other}; run `atlas help`"),
    };
    print!("{}", if out.ends_with('\n') { out } else { out + "\n" });
    Ok(())
}

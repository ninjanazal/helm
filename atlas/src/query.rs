//! Queries. Every answer is compact text (path:lines + one line), never whole files.
//! Each call logs tokens returned vs. tokens the caller would have read without atlas.

use anyhow::Result;
use rusqlite::{params, Connection};
use std::collections::HashSet;

fn est_tokens(chars: i64) -> i64 {
    (chars + 3) / 4
}

/// Log the call: `returned` = this answer, `avoided` = whole files it points at (what Read would cost).
fn log(c: &Connection, tool: &str, answer: &str, paths: &HashSet<String>) {
    let mut whole = 0i64;
    for p in paths {
        whole += c.query_row("SELECT size FROM files WHERE path=?", [p], |r| r.get::<_, i64>(0)).unwrap_or(0);
    }
    let ret = est_tokens(answer.len() as i64);
    let _ = c.execute(
        "INSERT INTO usage VALUES(strftime('%s','now'), ?, ?, ?)",
        params![tool, ret, (est_tokens(whole) - ret).max(0)],
    );
}

const STOP: &[&str] = &["the","a","an","is","are","was","be","do","does","did","where","what","which","who","how","why","when","to","of","in","on","for","and","or","it","its","this","that","with","from","by","at","as","get","gets","got","i","we","you","can","should","there","any","all"];

fn fts_query(q: &str) -> String {
    let mut seen = HashSet::new();
    let toks: Vec<String> = q
        .split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .filter(|t| t.len() > 1 && !STOP.contains(&t.to_lowercase().as_str()))
        .flat_map(|t| {
            let mut v = vec![t.to_lowercase()];
            v.extend(crate::lang::split_terms(t).split_whitespace().map(String::from));
            v
        })
        .filter(|t| seen.insert(t.clone()))
        .map(|t| format!("\"{}\"", t.replace('"', "")))
        .collect();
    toks.join(" OR ")
}

pub fn find(c: &Connection, q: &str, k: usize) -> Result<String> {
    let fq = fts_query(q);
    if fq.is_empty() {
        return Ok("empty query".into());
    }
    // name matches weigh most, then split identifiers, then raw body.
    let mut st = c.prepare(
        "SELECT path, start, end, kind, name, snippet(chunks, 6, '', '', '…', 12), bm25(chunks, 10.0, 4.0, 1.0) AS r
         FROM chunks WHERE chunks MATCH ? ORDER BY r LIMIT ?",
    )?;
    let rows = st.query_map(params![fq, (k * 4) as i64], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, f64>(6)?))
    })?;
    // Drop hits nested inside a better hit of the same file.
    let mut kept: Vec<(String, i64, i64, String, String, String)> = vec![];
    for r in rows.flatten() {
        let (p, a, b, kind, name, snip, _) = r;
        if kept.iter().any(|x| x.0 == p && x.1 <= a && b <= x.2 || x.0 == p && a <= x.1 && x.2 <= b) {
            continue;
        }
        kept.push((p, a, b, kind, name, snip));
        if kept.len() >= k { break; }
    }
    let mut out = String::new();
    let mut paths = HashSet::new();
    for (p, a, b, kind, name, snip) in &kept {
        let label = if kind == "window" { String::new() } else { format!(" {kind} {name}") };
        out.push_str(&format!("{p}:{a}-{b}{label}  {}\n", snip.split_whitespace().collect::<Vec<_>>().join(" ")));
        paths.insert(p.clone());
    }
    if out.is_empty() { out = "no hits".into(); }
    log(c, "find", &out, &paths);
    Ok(out)
}

pub fn symbol(c: &Connection, name: &str) -> Result<String> {
    let mut st = c.prepare(
        "SELECT f.path, s.start, s.end, s.kind, s.id,
           (SELECT COUNT(*) FROM edges e WHERE e.to_sym = s.id)
         FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.name = ? ORDER BY f.path LIMIT 20",
    )?;
    let mut out = String::new();
    let mut paths = HashSet::new();
    for r in st.query_map([name], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(5)?)))?.flatten() {
        out.push_str(&format!("{}:{}-{} {} {}  ({} refs)\n", r.0, r.1, r.2, r.3, name, r.4));
        paths.insert(r.0);
    }
    if out.is_empty() {
        out = format!("no symbol named {name}; try find");
    }
    log(c, "symbol", &out, &paths);
    Ok(out)
}

pub fn neighbors(c: &Connection, name: &str) -> Result<String> {
    let mut out = String::new();
    let mut paths = HashSet::new();
    out.push_str("callers:\n");
    let mut st = c.prepare(
        "SELECT f.path, e.line, COALESCE(s.name, '(top level)'), COALESCE(e.confidence, '?')
         FROM edges e JOIN files f ON f.id = e.file_id LEFT JOIN symbols s ON s.id = e.from_sym
         WHERE e.target = ? AND e.kind != 'imports' ORDER BY f.path, e.line LIMIT 30",
    )?;
    for r in st.query_map([name], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)))?.flatten() {
        out.push_str(&format!("  {}:{} in {} [{}]\n", r.0, r.1, r.2, r.3));
        paths.insert(r.0);
    }
    out.push_str("calls:\n");
    let mut st = c.prepare(
        "SELECT DISTINCT e.target, e.kind, f2.path, s2.start
         FROM symbols s JOIN edges e ON e.from_sym = s.id
         LEFT JOIN symbols s2 ON s2.id = e.to_sym LEFT JOIN files f2 ON f2.id = s2.file_id
         WHERE s.name = ? AND e.kind != 'imports' LIMIT 40",
    )?;
    for r in st.query_map([name], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<i64>>(3)?)))?.flatten() {
        match (r.2, r.3) {
            (Some(p), Some(l)) => out.push_str(&format!("  {} → {}:{}{}\n", r.0, p, l, if r.1 == "extends" { " (extends)" } else { "" })),
            _ => out.push_str(&format!("  {} (external)\n", r.0)),
        }
    }
    log(c, "neighbors", &out, &paths);
    Ok(out)
}

pub fn outline(c: &Connection, path: &str) -> Result<String> {
    let path = path.trim_start_matches("./");
    let mut st = c.prepare(
        "SELECT s.start, s.end, s.kind, s.name, s.parent IS NOT NULL FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE f.path = ? ORDER BY s.start",
    )?;
    let mut out = String::new();
    for r in st.query_map([path], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, bool>(4)?)))?.flatten() {
        out.push_str(&format!("{}{}-{} {} {}\n", if r.4 { "  " } else { "" }, r.0, r.1, r.2, r.3));
    }
    if out.is_empty() {
        out = format!("no symbols for {path} (not indexed, or plain text)");
    }
    log(c, "outline", &out, &HashSet::from([path.to_string()]));
    Ok(out)
}

pub fn stats(c: &Connection) -> Result<String> {
    let n = |q: &str| c.query_row(q, [], |r| r.get::<_, i64>(0)).unwrap_or(0);
    let mut out = format!(
        "files {}  symbols {}  edges {} (resolved {})\n",
        n("SELECT COUNT(*) FROM files"), n("SELECT COUNT(*) FROM symbols"),
        n("SELECT COUNT(*) FROM edges"), n("SELECT COUNT(*) FROM edges WHERE to_sym IS NOT NULL"),
    );
    let mut st = c.prepare("SELECT lang, COUNT(*) FROM files GROUP BY lang ORDER BY 2 DESC")?;
    let langs: Vec<String> = st.query_map([], |r| Ok(format!("{} {}", r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?.flatten().collect();
    out.push_str(&format!("langs {}\n", langs.join(" · ")));
    out.push_str(&format!(
        "queries {}  tokens returned {}  tokens avoided {}\n",
        n("SELECT COUNT(*) FROM usage"), n("SELECT COALESCE(SUM(returned),0) FROM usage"), n("SELECT COALESCE(SUM(avoided),0) FROM usage"),
    ));
    Ok(out)
}

/// Machine-readable stats for the pane.
pub fn stats_json(c: &Connection) -> serde_json::Value {
    let n = |q: &str| c.query_row(q, [], |r| r.get::<_, i64>(0)).unwrap_or(0);
    serde_json::json!({
        "files": n("SELECT COUNT(*) FROM files"),
        "symbols": n("SELECT COUNT(*) FROM symbols"),
        "edges": n("SELECT COUNT(*) FROM edges"),
        "queries": n("SELECT COUNT(*) FROM usage"),
        "returned": n("SELECT COALESCE(SUM(returned),0) FROM usage"),
        "avoided": n("SELECT COALESCE(SUM(avoided),0) FROM usage"),
        "indexed_at": c.query_row("SELECT v FROM meta WHERE k='indexed_at'", [], |r| r.get::<_, String>(0)).ok(),
        // coverage: code files parsed by a grammar, how many have symbols, how many calls point at a known symbol
        "code_files": n("SELECT COUNT(*) FROM files WHERE kind='code'"),
        "code_with_symbols": n("SELECT COUNT(DISTINCT f.id) FROM files f JOIN symbols s ON s.file_id=f.id WHERE f.kind='code'"),
        "text_files": n("SELECT COUNT(*) FROM files WHERE kind!='code'"),
        "calls": n("SELECT COUNT(*) FROM edges WHERE kind!='imports'"),
        "resolved": n("SELECT COUNT(*) FROM edges WHERE kind!='imports' AND to_sym IS NOT NULL"),
        "source_bytes": n("SELECT COALESCE(SUM(size),0) FROM files"),
        "lines": n("SELECT COALESCE(SUM(lines),0) FROM files"),
        "langs": c.prepare("SELECT lang, COUNT(*) FROM files GROUP BY lang ORDER BY 2 DESC LIMIT 6")
            .and_then(|mut st| st.query_map([], |r| Ok(serde_json::json!([r.get::<_, String>(0)?, r.get::<_, i64>(1)?])))?.collect::<Result<Vec<_>, _>>())
            .unwrap_or_default(),
    })
}

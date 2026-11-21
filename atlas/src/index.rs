//! Incremental indexer: walk (respecting .gitignore), skip unchanged files by mtime+size then hash,
//! extract symbols/edges, chunk into FTS, then resolve call edges to symbols.

use crate::lang::{self, Extract};
use anyhow::Result;
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::Path;
use std::time::UNIX_EPOCH;

const MAX_BYTES: u64 = 1_000_000;
const WINDOW: usize = 40;

#[derive(Default, Debug)]
pub struct Stats {
    pub seen: usize,
    pub changed: usize,
    pub removed: usize,
}

fn walker(root: &Path) -> ignore::Walk {
    ignore::WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .filter_entry(|e| !matches!(e.file_name().to_str(), Some(".git" | ".atlas" | "node_modules" | "target" | ".godot")))
        .build()
}

/// What an index run would change, without changing anything: (changed, added, removed).
/// Changed is by mtime+size, so a touched-but-identical file counts; that only means a cheap re-hash.
pub fn pending(c: &Connection, root: &Path) -> Result<(usize, usize, usize)> {
    let mut known: std::collections::HashMap<String, (i64, i64)> = c
        .prepare("SELECT path, mtime, size FROM files")?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))))?
        .flatten()
        .collect();
    let (mut changed, mut added) = (0, 0);
    for ent in walker(root).flatten() {
        if !ent.file_type().map_or(false, |t| t.is_file()) { continue; }
        let Ok(meta) = ent.metadata() else { continue };
        if meta.len() > MAX_BYTES || meta.len() == 0 { continue; }
        let rel = ent.path().strip_prefix(root).unwrap_or(ent.path()).to_string_lossy().replace('\\', "/");
        let mtime = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs() as i64);
        match known.remove(&rel) {
            Some((m, s)) => if m != mtime || s != meta.len() as i64 { changed += 1 },
            None => {
                // binary files are never indexed; don't report them as new
                let head = std::fs::read(ent.path()).map(|b| b.iter().take(8000).any(|x| *x == 0)).unwrap_or(true);
                if !head { added += 1 }
            }
        }
    }
    Ok((changed, added, known.len()))
}

pub fn index(c: &mut Connection, root: &Path) -> Result<Stats> {
    let mut st = Stats::default();
    let mut present = HashSet::new();
    let tx = c.transaction()?;
    for ent in walker(root).flatten() {
        if !ent.file_type().map_or(false, |t| t.is_file()) {
            continue;
        }
        let meta = match ent.metadata() { Ok(m) => m, Err(_) => continue };
        if meta.len() > MAX_BYTES || meta.len() == 0 {
            continue;
        }
        let rel = ent.path().strip_prefix(root).unwrap_or(ent.path()).to_string_lossy().replace('\\', "/");
        let mtime = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs() as i64);
        let size = meta.len() as i64;
        st.seen += 1;
        present.insert(rel.clone());

        let old: Option<(i64, i64, i64, String)> = tx
            .query_row("SELECT id, mtime, size, hash FROM files WHERE path=?", [&rel], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .ok();
        if let Some((_, m, s, _)) = &old {
            if *m == mtime && *s == size { continue; }
        }
        let bytes = match std::fs::read(ent.path()) { Ok(b) => b, Err(_) => continue };
        if bytes.iter().take(8000).any(|b| *b == 0) {
            continue; // binary
        }
        let hash = blake3::hash(&bytes).to_hex().to_string();
        if let Some((id, _, _, h)) = &old {
            if *h == hash {
                tx.execute("UPDATE files SET mtime=?, size=? WHERE id=?", params![mtime, size, id])?;
                continue;
            }
            delete_file(&tx, *id, &rel)?;
        }
        let src = String::from_utf8_lossy(&bytes).into_owned();
        add_file(&tx, &rel, &src, &hash, mtime, size)?;
        st.changed += 1;
    }

    let known: Vec<(i64, String)> = tx.prepare("SELECT id, path FROM files")?.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.flatten().collect();
    for (id, p) in known {
        if !present.contains(&p) {
            delete_file(&tx, id, &p)?;
            st.removed += 1;
        }
    }
    if st.changed + st.removed > 0 {
        resolve(&tx)?;
    }
    tx.execute("INSERT OR REPLACE INTO meta VALUES('indexed_at', strftime('%s','now'))", [])?;
    tx.commit()?;
    Ok(st)
}

fn delete_file(tx: &rusqlite::Transaction, id: i64, path: &str) -> Result<()> {
    tx.execute("DELETE FROM chunks WHERE path=?", [path])?;
    tx.execute("DELETE FROM files WHERE id=?", [id])?;
    Ok(())
}

fn add_file(tx: &rusqlite::Transaction, rel: &str, src: &str, hash: &str, mtime: i64, size: i64) -> Result<()> {
    let lines: Vec<&str> = src.lines().collect();
    let (lang_name, kind, ex): (&str, &str, Extract) = match lang::language_for(rel) {
        Some((n, l)) => (n, "code", lang::extract_code(&l, src)),
        None => {
            let k = lang::text_kind(rel);
            (k, k, if k == "doc" { lang::extract_doc(src) } else { Extract::default() })
        }
    };
    tx.execute(
        "INSERT INTO files(path, lang, kind, hash, mtime, size, lines) VALUES(?,?,?,?,?,?,?)",
        params![rel, lang_name, kind, hash, mtime, size, lines.len() as i64],
    )?;
    let fid = tx.last_insert_rowid();

    let mut ids = Vec::with_capacity(ex.symbols.len());
    for s in &ex.symbols {
        let parent = s.parent.and_then(|p| ids.get(p).copied());
        tx.execute(
            "INSERT INTO symbols(file_id, name, kind, start, end, parent) VALUES(?,?,?,?,?,?)",
            params![fid, s.name, s.kind, s.start as i64, s.end as i64, parent],
        )?;
        ids.push(tx.last_insert_rowid());
    }
    for e in &ex.edges {
        tx.execute(
            "INSERT INTO edges(file_id, from_sym, kind, target, line) VALUES(?,?,?,?,?)",
            params![fid, e.from.and_then(|i| ids.get(i).copied()), e.kind, e.target, e.line as i64],
        )?;
    }

    let mut ins = tx.prepare_cached("INSERT INTO chunks(path, start, end, kind, name, terms, body) VALUES(?,?,?,?,?,?,?)")?;
    let slice = |a: usize, b: usize| lines[a.saturating_sub(1).min(lines.len())..b.min(lines.len())].join("\n");
    // One chunk per symbol that is small enough to be a useful answer.
    for s in &ex.symbols {
        if s.end - s.start <= 200 {
            let body = slice(s.start, s.end);
            ins.execute(params![rel, s.start as i64, s.end as i64, s.kind, s.name, lang::split_terms(&format!("{} {}", s.name, body)), body])?;
        }
    }
    // Plus fixed windows over the whole file, so text between symbols (and non-code files) is searchable.
    let mut a = 1;
    while a <= lines.len() {
        let b = (a + WINDOW - 1).min(lines.len());
        let body = slice(a, b);
        ins.execute(params![rel, a as i64, b as i64, "window", rel, lang::split_terms(&format!("{rel} {body}")), body])?;
        a += WINDOW;
    }
    Ok(())
}

/// Point call/extends edges at symbols by name. One match = parsed, several = guessed (same file preferred).
fn resolve(tx: &rusqlite::Transaction) -> Result<()> {
    tx.execute_batch(
        "UPDATE edges SET to_sym = NULL, confidence = NULL WHERE kind != 'imports';
         UPDATE edges SET
           to_sym = COALESCE(
             (SELECT s.id FROM symbols s WHERE s.name = edges.target AND s.file_id = edges.file_id LIMIT 1),
             (SELECT s.id FROM symbols s WHERE s.name = edges.target LIMIT 1)),
           confidence = CASE (SELECT COUNT(*) FROM symbols s WHERE s.name = edges.target)
             WHEN 0 THEN NULL WHEN 1 THEN 'parsed' ELSE 'guessed' END
         WHERE kind != 'imports';",
    )?;
    Ok(())
}

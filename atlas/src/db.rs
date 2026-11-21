//! SQLite store: files, symbols, edges and an FTS5 chunk index, at <root>/.atlas/graph.db.

use anyhow::Result;
use rusqlite::Connection;
use std::path::Path;

pub fn open(root: &Path) -> Result<Connection> {
    let dir = root.join(".atlas");
    std::fs::create_dir_all(&dir)?;
    let _ = std::fs::write(dir.join(".gitignore"), "*\n");
    let c = Connection::open(dir.join("graph.db"))?;
    c.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;
         CREATE TABLE IF NOT EXISTS files(
           id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, lang TEXT, kind TEXT,
           hash TEXT, mtime INTEGER, size INTEGER, lines INTEGER);
         CREATE TABLE IF NOT EXISTS symbols(
           id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
           name TEXT NOT NULL, kind TEXT, start INTEGER, end INTEGER, parent INTEGER);
         CREATE INDEX IF NOT EXISTS sym_name ON symbols(name);
         CREATE INDEX IF NOT EXISTS sym_file ON symbols(file_id);
         CREATE TABLE IF NOT EXISTS edges(
           id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
           from_sym INTEGER, kind TEXT, target TEXT, line INTEGER,
           to_sym INTEGER, confidence TEXT);
         CREATE INDEX IF NOT EXISTS edge_target ON edges(target);
         CREATE INDEX IF NOT EXISTS edge_from ON edges(from_sym);
         CREATE INDEX IF NOT EXISTS edge_file ON edges(file_id);
         CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
           path UNINDEXED, start UNINDEXED, end UNINDEXED, kind UNINDEXED,
           name, terms, body, tokenize='unicode61');
         CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
         CREATE TABLE IF NOT EXISTS usage(
           at INTEGER, tool TEXT, returned INTEGER, avoided INTEGER);",
    )?;
    Ok(c)
}

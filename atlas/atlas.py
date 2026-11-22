#!/usr/bin/env python3
"""atlas: a local code + docs graph for agents. One file, no services, no models required.

  atlas index [--root DIR]          build or refresh .atlas/graph.db (incremental)
  atlas find <query> [-k N]         ranked path:lines hits
  atlas symbol <name>               where a symbol is defined, with ref counts
  atlas neighbors <name>            callers and callees
  atlas outline <path>              symbols in one file
  atlas stats [--json]              index size and tokens saved (no re-index)
  atlas status [--json]             is the index stale? files changed since the last index
  atlas mcp                         MCP server on stdio (for Claude Code)

Needs Python 3.9+ with sqlite3 (FTS5) and `pip install -r requirements.txt` (tree-sitter + grammars) in a venv.
"""
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

VERSION = "0.2.0"
MAX_BYTES = 1_000_000
WINDOW = 40
FRESH_SECS = 5
SKIP_DIRS = {".git", ".atlas", "node_modules", "target", ".godot", "__pycache__", ".venv", "venv"}

# ───────────────────────── db ─────────────────────────

SCHEMA = """
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;
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
  from_sym INTEGER, kind TEXT, target TEXT, line INTEGER, to_sym INTEGER, confidence TEXT);
CREATE INDEX IF NOT EXISTS edge_target ON edges(target);
CREATE INDEX IF NOT EXISTS edge_from ON edges(from_sym);
CREATE INDEX IF NOT EXISTS edge_file ON edges(file_id);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
  path UNINDEXED, start UNINDEXED, end UNINDEXED, kind UNINDEXED,
  name, terms, body, tokenize='unicode61');
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS usage(at INTEGER, tool TEXT, returned INTEGER, avoided INTEGER);
"""


def db_open(root: Path) -> sqlite3.Connection:
    d = root / ".atlas"
    d.mkdir(exist_ok=True)
    try:
        (d / ".gitignore").write_text("*\n")
    except OSError:
        pass
    c = sqlite3.connect(d / "graph.db", isolation_level=None)  # we manage transactions
    c.executescript(SCHEMA)
    return c


# ───────────────────────── languages ─────────────────────────

LANGS = {
    "rs": "rust", "py": "python", "pyi": "python",
    "js": "javascript", "mjs": "javascript", "cjs": "javascript", "jsx": "javascript",
    "ts": "typescript", "mts": "typescript", "cts": "typescript", "tsx": "tsx",
    "go": "go", "c": "c", "h": "c",
    "cc": "cpp", "cpp": "cpp", "cxx": "cpp", "hpp": "cpp", "hh": "cpp", "hxx": "cpp",
    "java": "java", "cs": "csharp", "sh": "bash", "bash": "bash", "zsh": "bash", "gd": "gdscript",
}
# tree-sitter-language-pack grammar name per language
GRAMMAR = {"csharp": "csharp"}
_parsers = {}


def ext_of(path):
    return path.rsplit(".", 1)[-1].lower() if "." in path else ""


def language_for(path):
    return LANGS.get(ext_of(path))


def get_parser(lang):
    if lang not in _parsers:
        from tree_sitter_language_pack import get_parser as gp
        _parsers[lang] = gp(GRAMMAR.get(lang, lang))
    return _parsers[lang]


def text_kind(path):
    e = ext_of(path)
    if e in ("md", "markdown", "mdx", "rst", "txt"):
        return "doc"
    if e in ("json", "yaml", "yml", "toml", "ini", "cfg", "tscn", "tres", "godot"):
        return "config"
    if e == "sql":
        return "sql"
    return "text"


DEF_WORDS = ["function", "method", "class", "struct", "enum", "trait", "interface", "impl", "module", "mod_item",
             "namespace", "type_alias", "type_item", "signal", "constructor", "union", "record"]
WORD_KIND = {"mod_item": "module", "namespace": "module", "type_alias": "type", "type_item": "type",
             "constructor": "method", "union": "struct", "record": "struct"}


def def_kind(kind):
    is_def = (kind.endswith("_definition") or kind.endswith("_declaration") or kind.endswith("_item")
              or (kind.endswith("_statement") and (kind.startswith("signal") or kind.startswith("class_name")))
              or kind == "function_signature")
    if not is_def or "call" in kind or kind.startswith("use_") or "import" in kind:
        return None
    for w in DEF_WORDS:
        if w in kind:
            return WORD_KIND.get(w, w)
    return None


def _txt(n):
    return n.text.decode("utf-8", "replace") if n is not None and n.text else ""


def def_name(n):
    x = n.child_by_field_name("name")
    if x is not None:
        return _txt(x)
    d = n.child_by_field_name("declarator")
    while d is not None:
        if "identifier" in d.type:
            return _txt(d)
        d = d.child_by_field_name("declarator") or (d.named_children[0] if d.named_children else None)
    for c in n.named_children:
        if "identifier" in c.type or c.type == "name":
            return _txt(c)
    return None


def last_ident(s):
    head = s.split("(", 1)[0]
    toks = [t for t in re.split(r"[^\w]+", head) if t]
    if not toks:
        return None
    t = toks[-1]
    return None if t[0].isdigit() else t


def clip(s):
    return " ".join(s.split())[:200]


def walk(n, parent, out):
    kind = n.type
    line = n.start_point[0] + 1
    here = parent
    syms, edges = out["symbols"], out["edges"]
    dk = def_kind(kind)
    if dk:
        name = def_name(n)
        if name:
            if dk == "function" and parent is not None and syms[parent]["kind"] in ("class", "struct", "impl", "trait", "interface"):
                dk = "method"
            syms.append({"name": name, "kind": dk, "start": line, "end": n.end_point[0] + 1, "parent": parent})
            here = len(syms) - 1
    elif kind == "variable_declarator":
        nm, v = n.child_by_field_name("name"), n.child_by_field_name("value")
        if nm is not None and v is not None and "function" in v.type:
            syms.append({"name": _txt(nm), "kind": "function", "start": line, "end": n.end_point[0] + 1, "parent": parent})
            here = len(syms) - 1
    elif ("call" in kind or "invocation" in kind) and "definition" not in kind:
        callee = (n.child_by_field_name("function") or n.child_by_field_name("name")
                  or n.child_by_field_name("method") or (n.named_children[0] if n.named_children else None))
        t = last_ident(_txt(callee)) if callee is not None else None
        if t:
            if t in ("preload", "load", "require"):
                edges.append({"kind": "imports", "target": clip(_txt(n)), "line": line, "from": here})
            else:
                edges.append({"kind": "calls", "target": t, "line": line, "from": here})
    elif "import" in kind or kind in ("use_declaration", "preproc_include"):
        edges.append({"kind": "imports", "target": clip(_txt(n)), "line": line, "from": here})
        return
    elif kind in ("extends_statement", "superclass", "base_class_clause", "class_heritage"):
        t = last_ident(_txt(n).removeprefix("extends").strip()) if hasattr(str, "removeprefix") else last_ident(_txt(n))
        if t:
            edges.append({"kind": "extends", "target": t, "line": line, "from": here})
    for ch in n.named_children:
        walk(ch, here, out)


def extract_code(lang, src):
    out = {"symbols": [], "edges": []}
    try:
        tree = get_parser(lang).parse(src.encode("utf-8"))
    except Exception:
        return out
    sys.setrecursionlimit(max(sys.getrecursionlimit(), 10000))
    walk(tree.root_node, None, out)
    return out


def extract_doc(src):
    out = {"symbols": [], "edges": []}
    lines = src.splitlines()
    open_, fence = [], False
    for i, l in enumerate(lines):
        if l.lstrip().startswith("```"):
            fence = not fence
        if fence or not l.startswith("#"):
            continue
        level = len(l) - len(l.lstrip("#"))
        title = l[level:].strip()
        if not title or level > 6:
            continue
        while open_ and open_[-1][0] >= level:
            out["symbols"][open_[-1][1]]["end"] = i
            open_.pop()
        out["symbols"].append({"name": title, "kind": "section", "start": i + 1, "end": len(lines),
                               "parent": open_[-1][1] if open_ else None})
        open_.append((level, len(out["symbols"]) - 1))
    return out


def split_terms(s):
    """Split identifiers so BM25 matches `crewSummary` with "crew summary" and `sync_herdr` with "herdr"."""
    out = []
    for w in re.split(r"[^0-9A-Za-zÀ-￿]+", s):
        if not w:
            continue
        cur, prev_lower = "", False
        for ch in w:
            if ch.isupper() and prev_lower and cur:
                out.append(cur.lower())
                cur = ""
            prev_lower = ch.islower() or ch.isdigit()
            cur += ch
        if cur and len(cur) < len(w):
            out.append(cur.lower())
    return "".join(t + " " for t in out)


# ───────────────────────── indexer ─────────────────────────


def walker(root: Path):
    """Files under root, skipping hidden entries, SKIP_DIRS and anything git ignores."""
    try:
        r = subprocess.run(["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                           capture_output=True, timeout=30)
        if r.returncode == 0:
            for rel in r.stdout.decode("utf-8", "replace").split("\0"):
                if rel and not _skipped(rel) and (root / rel).is_file():
                    yield rel
            return
    except (OSError, subprocess.SubprocessError):
        pass
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP_DIRS and not d.startswith(".")]
        for f in fns:
            if not f.startswith("."):
                yield os.path.relpath(os.path.join(dp, f), root).replace(os.sep, "/")


def _skipped(rel):
    parts = rel.split("/")
    return any(p in SKIP_DIRS or (p.startswith(".") and p not in (".claude-plugin",)) for p in parts[:-1]) or parts[-1].startswith(".")


def _stat(root, rel):
    try:
        st = os.stat(root / rel)
    except OSError:
        return None
    if st.st_size > MAX_BYTES or st.st_size == 0:
        return None
    return int(st.st_mtime), st.st_size


def pending(c, root):
    """What an index run would change without changing anything: (changed, added, removed)."""
    known = {p: (m, s) for p, m, s in c.execute("SELECT path, mtime, size FROM files")}
    changed = added = 0
    for rel in walker(root):
        st = _stat(root, rel)
        if st is None:
            continue
        old = known.pop(rel, None)
        if old is not None:
            changed += old != st
        else:
            try:
                with open(root / rel, "rb") as f:
                    if b"\0" not in f.read(8000):
                        added += 1
            except OSError:
                pass
    return changed, added, len(known)


def index(c, root):
    seen = changed = removed = 0
    present = set()
    c.execute("BEGIN")
    try:
        for rel in walker(root):
            st = _stat(root, rel)
            if st is None:
                continue
            mtime, size = st
            seen += 1
            present.add(rel)
            old = c.execute("SELECT id, mtime, size, hash FROM files WHERE path=?", (rel,)).fetchone()
            if old and old[1] == mtime and old[2] == size:
                continue
            try:
                data = (root / rel).read_bytes()
            except OSError:
                continue
            if b"\0" in data[:8000]:
                continue
            h = hashlib.sha256(data).hexdigest()
            if old:
                if old[3] == h:
                    c.execute("UPDATE files SET mtime=?, size=? WHERE id=?", (mtime, size, old[0]))
                    continue
                delete_file(c, old[0], rel)
            add_file(c, rel, data.decode("utf-8", "replace"), h, mtime, size)
            changed += 1
        for fid, p in c.execute("SELECT id, path FROM files").fetchall():
            if p not in present:
                delete_file(c, fid, p)
                removed += 1
        if changed + removed:
            resolve(c)
        c.execute("INSERT OR REPLACE INTO meta VALUES('indexed_at', strftime('%s','now'))")
        c.execute("COMMIT")
    except BaseException:
        c.execute("ROLLBACK")
        raise
    return seen, changed, removed


def delete_file(c, fid, path):
    c.execute("DELETE FROM chunks WHERE path=?", (path,))
    c.execute("DELETE FROM files WHERE id=?", (fid,))


def add_file(c, rel, src, h, mtime, size):
    lines = src.splitlines()
    lang = language_for(rel)
    if lang:
        kind, ex = "code", extract_code(lang, src)
    else:
        kind = text_kind(rel)
        lang = kind
        ex = extract_doc(src) if kind == "doc" else {"symbols": [], "edges": []}
    fid = c.execute("INSERT INTO files(path, lang, kind, hash, mtime, size, lines) VALUES(?,?,?,?,?,?,?)",
                    (rel, lang, kind, h, mtime, size, len(lines))).lastrowid
    ids = []
    for s in ex["symbols"]:
        parent = ids[s["parent"]] if s["parent"] is not None and s["parent"] < len(ids) else None
        ids.append(c.execute("INSERT INTO symbols(file_id, name, kind, start, end, parent) VALUES(?,?,?,?,?,?)",
                             (fid, s["name"], s["kind"], s["start"], s["end"], parent)).lastrowid)
    for e in ex["edges"]:
        frm = ids[e["from"]] if e["from"] is not None and e["from"] < len(ids) else None
        c.execute("INSERT INTO edges(file_id, from_sym, kind, target, line) VALUES(?,?,?,?,?)",
                  (fid, frm, e["kind"], e["target"], e["line"]))

    def sl(a, b):
        return "\n".join(lines[max(a - 1, 0):min(b, len(lines))])

    ins = "INSERT INTO chunks(path, start, end, kind, name, terms, body) VALUES(?,?,?,?,?,?,?)"
    for s in ex["symbols"]:  # one chunk per symbol small enough to be a useful answer
        if s["end"] - s["start"] <= 200:
            body = sl(s["start"], s["end"])
            c.execute(ins, (rel, s["start"], s["end"], s["kind"], s["name"], split_terms(s["name"] + " " + body), body))
    a = 1  # plus fixed windows, so text between symbols (and non-code files) is searchable
    while a <= len(lines):
        b = min(a + WINDOW - 1, len(lines))
        body = sl(a, b)
        c.execute(ins, (rel, a, b, "window", rel, split_terms(rel + " " + body), body))
        a += WINDOW


def resolve(c):
    """Point call/extends edges at symbols by name. One match = parsed, several = guessed (same file preferred)."""
    c.execute("UPDATE edges SET to_sym = NULL, confidence = NULL WHERE kind != 'imports'")
    c.execute("""UPDATE edges SET
        to_sym = COALESCE(
          (SELECT s.id FROM symbols s WHERE s.name = edges.target AND s.file_id = edges.file_id LIMIT 1),
          (SELECT s.id FROM symbols s WHERE s.name = edges.target LIMIT 1)),
        confidence = CASE (SELECT COUNT(*) FROM symbols s WHERE s.name = edges.target)
          WHEN 0 THEN NULL WHEN 1 THEN 'parsed' ELSE 'guessed' END
      WHERE kind != 'imports'""")


# ───────────────────────── queries ─────────────────────────

STOP = set("the a an is are was be do does did where what which who how why when to of in on for and or it its this "
           "that with from by at as get gets got i we you can should there any all".split())


def est_tokens(n):
    return (n + 3) // 4


def log(c, tool, answer, paths):
    whole = 0
    for p in paths:
        r = c.execute("SELECT size FROM files WHERE path=?", (p,)).fetchone()
        whole += r[0] if r else 0
    ret = est_tokens(len(answer))
    c.execute("INSERT INTO usage VALUES(strftime('%s','now'), ?, ?, ?)", (tool, ret, max(est_tokens(whole) - ret, 0)))


def fts_query(q):
    seen, toks = set(), []
    for t in re.split(r"[^\w]+", q):
        if len(t) <= 1 or t.lower() in STOP:
            continue
        for x in [t.lower()] + split_terms(t).split():
            if x not in seen:
                seen.add(x)
                toks.append('"%s"' % x.replace('"', ""))
    return " OR ".join(toks)


def find(c, q, k=8):
    fq = fts_query(q)
    if not fq:
        return "empty query"
    rows = c.execute(
        "SELECT path, start, end, kind, name, snippet(chunks, 6, '', '', '…', 12), bm25(chunks, 10.0, 4.0, 1.0) AS r "
        "FROM chunks WHERE chunks MATCH ? ORDER BY r LIMIT ?", (fq, k * 4)).fetchall()
    kept = []
    for p, a, b, kind, name, snip, _ in rows:  # drop hits nested inside a better hit of the same file
        if any(x[0] == p and ((x[1] <= a and b <= x[2]) or (a <= x[1] and x[2] <= b)) for x in kept):
            continue
        kept.append((p, a, b, kind, name, snip))
        if len(kept) >= k:
            break
    out, paths = "", set()
    for p, a, b, kind, name, snip in kept:
        label = "" if kind == "window" else f" {kind} {name}"
        out += f"{p}:{a}-{b}{label}  {' '.join(snip.split())}\n"
        paths.add(p)
    out = out or "no hits"
    log(c, "find", out, paths)
    return out


def symbol(c, name):
    out, paths = "", set()
    for p, a, b, kind, refs in c.execute(
            "SELECT f.path, s.start, s.end, s.kind, (SELECT COUNT(*) FROM edges e WHERE e.to_sym = s.id) "
            "FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.name = ? ORDER BY f.path LIMIT 20", (name,)):
        out += f"{p}:{a}-{b} {kind} {name}  ({refs} refs)\n"
        paths.add(p)
    out = out or f"no symbol named {name}; try find"
    log(c, "symbol", out, paths)
    return out


def neighbors(c, name):
    out, paths = "callers:\n", set()
    for p, line, frm, conf in c.execute(
            "SELECT f.path, e.line, COALESCE(s.name, '(top level)'), COALESCE(e.confidence, '?') "
            "FROM edges e JOIN files f ON f.id = e.file_id LEFT JOIN symbols s ON s.id = e.from_sym "
            "WHERE e.target = ? AND e.kind != 'imports' ORDER BY f.path, e.line LIMIT 30", (name,)):
        out += f"  {p}:{line} in {frm} [{conf}]\n"
        paths.add(p)
    out += "calls:\n"
    for target, kind, p, line in c.execute(
            "SELECT DISTINCT e.target, e.kind, f2.path, s2.start FROM symbols s JOIN edges e ON e.from_sym = s.id "
            "LEFT JOIN symbols s2 ON s2.id = e.to_sym LEFT JOIN files f2 ON f2.id = s2.file_id "
            "WHERE s.name = ? AND e.kind != 'imports' LIMIT 40", (name,)):
        if p is not None and line is not None:
            out += f"  {target} → {p}:{line}{' (extends)' if kind == 'extends' else ''}\n"
        else:
            out += f"  {target} (external)\n"
    log(c, "neighbors", out, paths)
    return out


def outline(c, path):
    path = path[2:] if path.startswith("./") else path
    out = ""
    for start, end, kind, name, nested in c.execute(
            "SELECT s.start, s.end, s.kind, s.name, s.parent IS NOT NULL FROM symbols s JOIN files f ON f.id = s.file_id "
            "WHERE f.path = ? ORDER BY s.start", (path,)):
        out += f"{'  ' if nested else ''}{start}-{end} {kind} {name}\n"
    out = out or f"no symbols for {path} (not indexed, or plain text)"
    log(c, "outline", out, {path})
    return out


def _n(c, q):
    r = c.execute(q).fetchone()
    return r[0] if r and r[0] is not None else 0


def stats(c):
    out = (f"files {_n(c, 'SELECT COUNT(*) FROM files')}  symbols {_n(c, 'SELECT COUNT(*) FROM symbols')}  "
           f"edges {_n(c, 'SELECT COUNT(*) FROM edges')} (resolved {_n(c, 'SELECT COUNT(*) FROM edges WHERE to_sym IS NOT NULL')})\n")
    langs = [f"{l} {n}" for l, n in c.execute("SELECT lang, COUNT(*) FROM files GROUP BY lang ORDER BY 2 DESC")]
    out += f"langs {' · '.join(langs)}\n"
    out += (f"queries {_n(c, 'SELECT COUNT(*) FROM usage')}  tokens returned {_n(c, 'SELECT SUM(returned) FROM usage')}  "
            f"tokens avoided {_n(c, 'SELECT SUM(avoided) FROM usage')}\n")
    return out


def stats_json(c, root):
    r = c.execute("SELECT v FROM meta WHERE k='indexed_at'").fetchone()
    db = root / ".atlas/graph.db"
    return {
        "files": _n(c, "SELECT COUNT(*) FROM files"), "symbols": _n(c, "SELECT COUNT(*) FROM symbols"),
        "edges": _n(c, "SELECT COUNT(*) FROM edges"), "queries": _n(c, "SELECT COUNT(*) FROM usage"),
        "returned": _n(c, "SELECT SUM(returned) FROM usage"), "avoided": _n(c, "SELECT SUM(avoided) FROM usage"),
        "indexed_at": int(r[0]) if r else None,
        "code_files": _n(c, "SELECT COUNT(*) FROM files WHERE kind='code'"),
        "code_with_symbols": _n(c, "SELECT COUNT(DISTINCT f.id) FROM files f JOIN symbols s ON s.file_id=f.id WHERE f.kind='code'"),
        "text_files": _n(c, "SELECT COUNT(*) FROM files WHERE kind!='code'"),
        "calls": _n(c, "SELECT COUNT(*) FROM edges WHERE kind!='imports'"),
        "resolved": _n(c, "SELECT COUNT(*) FROM edges WHERE kind!='imports' AND to_sym IS NOT NULL"),
        "source_bytes": _n(c, "SELECT SUM(size) FROM files"), "lines": _n(c, "SELECT SUM(lines) FROM files"),
        "langs": [[l, n] for l, n in c.execute("SELECT lang, COUNT(*) FROM files GROUP BY lang ORDER BY 2 DESC LIMIT 6")],
        "db_bytes": db.stat().st_size if db.exists() else 0,
    }


# ───────────────────────── MCP server ─────────────────────────


def _schema(props, req):
    return {"type": "object", "properties": props, "required": req}


TOOLS = [
    {"name": "find", "description": "Search code and docs in this repo. Returns ranked path:start-end hits with a short snippet. Use before Grep/Read; then Read only the returned ranges.",
     "inputSchema": _schema({"query": {"type": "string"}, "k": {"type": "integer", "description": "max hits, default 8"}}, ["query"])},
    {"name": "symbol", "description": "Where a function/class/signal/section is defined, with reference counts.",
     "inputSchema": _schema({"name": {"type": "string"}}, ["name"])},
    {"name": "neighbors", "description": "Callers of a symbol and what it calls, as path:line. Edges are marked parsed (unique) or guessed (name clash).",
     "inputSchema": _schema({"name": {"type": "string"}}, ["name"])},
    {"name": "outline", "description": "Symbols of one file with line ranges, instead of reading the whole file.",
     "inputSchema": _schema({"path": {"type": "string", "description": "repo-relative path"}}, ["path"])},
    {"name": "stats", "description": "Index size and tokens saved so far.", "inputSchema": _schema({}, [])},
]


def serve(root):
    c = db_open(root)
    index(c, root)
    last = time.monotonic()
    for line in sys.stdin:
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        if "id" not in msg:
            continue  # notification
        method, err, result = msg.get("method", ""), None, None
        if method == "initialize":
            result = {"protocolVersion": (msg.get("params") or {}).get("protocolVersion", "2025-06-18"),
                      "capabilities": {"tools": {}}, "serverInfo": {"name": "atlas", "version": VERSION},
                      "instructions": "atlas indexes this repo (code in 12 languages incl. GDScript, plus docs). Prefer find/symbol/outline/neighbors over Grep and whole-file Read: they return path:lines, then Read just that range."}
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            if time.monotonic() - last > FRESH_SECS:
                try:
                    index(c, root)
                except Exception:
                    pass
                last = time.monotonic()
            p = msg.get("params") or {}
            a = p.get("arguments") or {}
            try:
                name = p.get("name", "")
                text = {"find": lambda: find(c, a.get("query", ""), int(a.get("k") or 8)),
                        "symbol": lambda: symbol(c, a.get("name", "")),
                        "neighbors": lambda: neighbors(c, a.get("name", "")),
                        "outline": lambda: outline(c, a.get("path", "")),
                        "stats": lambda: stats(c)}[name]()
                result = {"content": [{"type": "text", "text": text}]}
            except KeyError:
                result = {"content": [{"type": "text", "text": f"unknown tool {p.get('name')}"}], "isError": True}
            except Exception as e:
                result = {"content": [{"type": "text", "text": str(e)}], "isError": True}
        else:
            err = {"code": -32601, "message": f"method not found: {method}"}
        resp = {"jsonrpc": "2.0", "id": msg["id"], **({"error": err} if err else {"result": result})}
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


# ───────────────────────── cli ─────────────────────────


def find_root(start: Path) -> Path:
    p = start
    while True:
        if (p / ".atlas").is_dir() or (p / ".git").exists():
            return p
        if p.parent == p:
            return start
        p = p.parent


def main(argv):
    args, root, k, as_json, i = list(argv), None, 8, False, 0
    while i < len(args):
        if args[i] == "--root" and i + 1 < len(args):
            root = Path(args.pop(i + 1)); args.pop(i)
        elif args[i] == "-k" and i + 1 < len(args):
            try:
                k = int(args.pop(i + 1))
            except ValueError:
                k = 8
            args.pop(i)
        elif args[i] == "--json":
            as_json = True; args.pop(i)
        else:
            i += 1
    root = (root or find_root(Path.cwd())).resolve()
    cmd = args[0] if args else "help"
    rest = " ".join(args[1:])
    if cmd in ("help", "-h", "--help"):
        print("\n".join(__doc__.splitlines()[2:10]))
        return 0
    if cmd == "mcp":
        serve(root)
        return 0
    fresh = not (root / ".atlas/graph.db").exists()
    c = db_open(root)
    if cmd in ("stats", "status"):  # read only: they must not hide staleness by re-indexing
        r = c.execute("SELECT v FROM meta WHERE k='indexed_at'").fetchone()
        indexed_at = int(r[0]) if r else None
        if cmd == "status":
            ch, ad, rm = (0, 0, 0) if fresh or indexed_at is None else pending(c, root)
            state = "missing" if indexed_at is None else "stale" if ch + ad + rm else "fresh"
            print(json.dumps({"state": state, "changed": ch, "added": ad, "removed": rm, "indexed_at": indexed_at})
                  if as_json else f"{state}: {ch} changed, {ad} new, {rm} deleted since the last index")
            return 0
        print(json.dumps(stats_json(c, root)) if as_json else stats(c), end="" if not as_json else "\n")
        return 0
    t = time.monotonic()
    seen, changed, removed = index(c, root)
    if cmd == "index":
        out = f"indexed {seen} files ({changed} changed, {removed} removed) in {time.monotonic() - t:.2f}s\n{stats(c)}"
    elif cmd == "find":
        out = find(c, rest, k)
    elif cmd == "symbol":
        out = symbol(c, rest)
    elif cmd == "neighbors":
        out = neighbors(c, rest)
    elif cmd == "outline":
        out = outline(c, rest)
    else:
        print(f"unknown command {cmd}; run `atlas help`", file=sys.stderr)
        return 1
    print(out, end="" if out.endswith("\n") else "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

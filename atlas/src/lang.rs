//! Language detection and one generic extractor that works on any tree-sitter grammar.
//! Adding a language = one line in `language_for`.

use tree_sitter::{Language, Node, Parser};

pub struct Symbol {
    pub name: String,
    pub kind: String,
    pub start: usize, // 1-based lines
    pub end: usize,
    pub parent: Option<usize>, // index into the symbols vec
}

pub struct Edge {
    pub kind: &'static str, // calls | imports | extends
    pub target: String,
    pub line: usize,
    pub from: Option<usize>, // enclosing symbol index
}

#[derive(Default)]
pub struct Extract {
    pub symbols: Vec<Symbol>,
    pub edges: Vec<Edge>,
}

pub fn language_for(path: &str) -> Option<(&'static str, Language)> {
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "rs" => ("rust", tree_sitter_rust::LANGUAGE.into()),
        "py" | "pyi" => ("python", tree_sitter_python::LANGUAGE.into()),
        "js" | "mjs" | "cjs" | "jsx" => ("javascript", tree_sitter_javascript::LANGUAGE.into()),
        "ts" | "mts" | "cts" => ("typescript", tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()),
        "tsx" => ("tsx", tree_sitter_typescript::LANGUAGE_TSX.into()),
        "go" => ("go", tree_sitter_go::LANGUAGE.into()),
        "c" | "h" => ("c", tree_sitter_c::LANGUAGE.into()),
        "cc" | "cpp" | "cxx" | "hpp" | "hh" | "hxx" => ("cpp", tree_sitter_cpp::LANGUAGE.into()),
        "java" => ("java", tree_sitter_java::LANGUAGE.into()),
        "cs" => ("csharp", tree_sitter_c_sharp::LANGUAGE.into()),
        "sh" | "bash" | "zsh" => ("bash", tree_sitter_bash::LANGUAGE.into()),
        "gd" => ("gdscript", tree_sitter_gdscript::LANGUAGE.into()),
        _ => return None,
    })
}

/// Text kinds with light structure (no grammar needed).
pub fn text_kind(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "md" | "markdown" | "mdx" | "rst" | "txt" => "doc",
        "json" | "yaml" | "yml" | "toml" | "ini" | "cfg" | "tscn" | "tres" | "godot" => "config",
        "sql" => "sql",
        _ => "text",
    }
}

const DEF_WORDS: &[&str] = &[
    "function", "method", "class", "struct", "enum", "trait", "interface", "impl", "module", "mod_item",
    "namespace", "type_alias", "type_item", "signal", "constructor", "union", "record",
];

fn def_kind(kind: &str) -> Option<String> {
    let is_def = kind.ends_with("_definition")
        || kind.ends_with("_declaration")
        || kind.ends_with("_item")
        || kind.ends_with("_statement") && (kind.starts_with("signal") || kind.starts_with("class_name"))
        || kind == "function_signature";
    if !is_def || kind.contains("call") || kind.starts_with("use_") || kind.contains("import") {
        return None;
    }
    let word = DEF_WORDS.iter().find(|w| kind.contains(*w))?;
    Some(match *word {
        "mod_item" | "namespace" => "module",
        "type_alias" | "type_item" => "type",
        "constructor" => "method",
        "union" | "record" => "struct",
        w => w,
    }
    .to_string())
}

fn text<'a>(n: Node, src: &'a [u8]) -> &'a str {
    n.utf8_text(src).unwrap_or("")
}

/// The definition's name: its `name` field, else dig through `declarator` (C/C++), else first identifier.
fn def_name(n: Node, src: &[u8]) -> Option<String> {
    if let Some(x) = n.child_by_field_name("name") {
        return Some(text(x, src).to_string());
    }
    let mut d = n.child_by_field_name("declarator");
    while let Some(x) = d {
        if x.kind().contains("identifier") {
            return Some(text(x, src).to_string());
        }
        d = x.child_by_field_name("declarator").or_else(|| x.named_child(0));
    }
    for i in 0..n.named_child_count() as u32 {
        let c = n.named_child(i)?;
        if c.kind().contains("identifier") || c.kind() == "name" {
            return Some(text(c, src).to_string());
        }
    }
    None
}

/// Last identifier-ish token of a callee expression: `a.b::c(x)` → `c`.
fn last_ident(s: &str) -> Option<String> {
    let head = s.split('(').next().unwrap_or(s);
    let tok = head
        .rsplit(|c: char| !(c.is_alphanumeric() || c == '_'))
        .find(|t| !t.is_empty())?;
    (!tok.chars().next()?.is_ascii_digit()).then(|| tok.to_string())
}

fn walk(n: Node, src: &[u8], parent: Option<usize>, out: &mut Extract) {
    let kind = n.kind();
    let line = n.start_position().row + 1;
    let mut here = parent;

    if let Some(k) = def_kind(kind) {
        if let Some(name) = def_name(n, src) {
            let k = if k == "function" && parent.map_or(false, |p| matches!(out.symbols[p].kind.as_str(), "class" | "struct" | "impl" | "trait" | "interface")) { "method".into() } else { k };
            out.symbols.push(Symbol { name, kind: k, start: line, end: n.end_position().row + 1, parent });
            here = Some(out.symbols.len() - 1);
        }
    } else if kind == "variable_declarator" {
        // const f = () => {} / function () {}
        if let (Some(nm), Some(v)) = (n.child_by_field_name("name"), n.child_by_field_name("value")) {
            if v.kind().contains("function") {
                out.symbols.push(Symbol { name: text(nm, src).into(), kind: "function".into(), start: line, end: n.end_position().row + 1, parent });
                here = Some(out.symbols.len() - 1);
            }
        }
    } else if (kind.contains("call") || kind.contains("invocation")) && !kind.contains("definition") {
        let callee = n
            .child_by_field_name("function")
            .or_else(|| n.child_by_field_name("name"))
            .or_else(|| n.child_by_field_name("method"))
            .or_else(|| n.named_child(0));
        if let Some(t) = callee.and_then(|c| last_ident(text(c, src))) {
            let t = if t == "preload" || t == "load" || t == "require" { // module loads count as imports
                out.edges.push(Edge { kind: "imports", target: clip(text(n, src)), line, from: here });
                String::new()
            } else { t };
            if !t.is_empty() {
                out.edges.push(Edge { kind: "calls", target: t, line, from: here });
            }
        }
    } else if kind.contains("import") || kind == "use_declaration" || kind == "preproc_include" {
        out.edges.push(Edge { kind: "imports", target: clip(text(n, src)), line, from: here });
        return;
    } else if kind == "extends_statement" || kind == "superclass" || kind == "base_class_clause" || kind == "class_heritage" {
        if let Some(t) = last_ident(text(n, src).trim_start_matches("extends").trim()) {
            out.edges.push(Edge { kind: "extends", target: t, line, from: here });
        }
    }

    let mut c = n.walk();
    for ch in n.named_children(&mut c) {
        walk(ch, src, here, out);
    }
}

fn clip(s: &str) -> String {
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    s.chars().take(200).collect()
}

pub fn extract_code(lang: &Language, src: &str) -> Extract {
    let mut p = Parser::new();
    let mut out = Extract::default();
    if p.set_language(lang).is_err() {
        return out;
    }
    if let Some(tree) = p.parse(src, None) {
        walk(tree.root_node(), src.as_bytes(), None, &mut out);
    }
    out
}

/// Markdown headings become `section` symbols spanning to the next heading of the same or higher level.
pub fn extract_doc(src: &str) -> Extract {
    let mut out = Extract::default();
    let lines: Vec<&str> = src.lines().collect();
    let mut open: Vec<(usize, usize)> = vec![]; // (level, symbol idx)
    let mut fence = false;
    for (i, l) in lines.iter().enumerate() {
        if l.trim_start().starts_with("```") {
            fence = !fence;
        }
        if fence || !l.starts_with('#') {
            continue;
        }
        let level = l.chars().take_while(|c| *c == '#').count();
        let title = l[level..].trim();
        if title.is_empty() || level > 6 {
            continue;
        }
        while let Some(&(lv, idx)) = open.last() {
            if lv < level { break; }
            out.symbols[idx].end = i;
            open.pop();
        }
        out.symbols.push(Symbol { name: title.into(), kind: "section".into(), start: i + 1, end: lines.len(), parent: open.last().map(|o| o.1) });
        open.push((level, out.symbols.len() - 1));
    }
    out
}

/// Split identifiers so BM25 can match `crewSummary` with "crew summary" and `sync_herdr` with "herdr".
pub fn split_terms(s: &str) -> String {
    let mut out = String::new();
    for w in s.split(|c: char| !c.is_alphanumeric()) {
        if w.is_empty() { continue; }
        let mut cur = String::new();
        let mut prev_lower = false;
        for ch in w.chars() {
            if ch.is_uppercase() && prev_lower && !cur.is_empty() {
                out.push_str(&cur.to_lowercase());
                out.push(' ');
                cur.clear();
            }
            prev_lower = ch.is_lowercase() || ch.is_ascii_digit();
            cur.push(ch);
        }
        if !cur.is_empty() && cur.len() < w.len() {
            out.push_str(&cur.to_lowercase());
            out.push(' ');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(path: &str, src: &str) -> Vec<String> {
        let (_, l) = language_for(path).unwrap();
        extract_code(&l, src).symbols.iter().map(|s| format!("{}:{}", s.kind, s.name)).collect()
    }

    #[test]
    fn gdscript() {
        let src = "extends CharacterBody2D\nclass_name Player\nsignal died(reason)\n\nfunc _ready():\n\tjump(2)\n\nfunc jump(h):\n\tpass\n";
        let (_, l) = language_for("p.gd").unwrap();
        let x = extract_code(&l, src);
        let n: Vec<_> = x.symbols.iter().map(|s| format!("{}:{}", s.kind, s.name)).collect();
        assert!(n.contains(&"function:_ready".into()), "{n:?}");
        assert!(n.contains(&"function:jump".into()), "{n:?}");
        assert!(n.iter().any(|s| s.ends_with(":died")), "{n:?}");
        assert!(x.edges.iter().any(|e| e.kind == "calls" && e.target == "jump"));
        assert!(x.edges.iter().any(|e| e.kind == "extends" && e.target == "CharacterBody2D"));
    }

    #[test]
    fn typescript_rust_c() {
        let ts = names("a.ts", "export class A { run() { go() } }\nexport function go() {}\nconst f = () => 1\n");
        assert!(ts.contains(&"class:A".into()) && ts.contains(&"method:run".into()) && ts.contains(&"function:go".into()) && ts.contains(&"function:f".into()), "{ts:?}");
        let rs = names("a.rs", "struct S; impl S { fn m(&self) {} }\nfn main() { S.m(); }\n");
        assert!(rs.contains(&"struct:S".into()) && rs.contains(&"method:m".into()) && rs.contains(&"function:main".into()), "{rs:?}");
        let c = names("a.c", "int add(int a, int b) { return a + b; }\n");
        assert!(c.contains(&"function:add".into()), "{c:?}");
    }

    #[test]
    fn docs_and_terms() {
        let d = extract_doc("# Top\ntext\n## Sub\nmore\n# Next\n");
        assert_eq!(d.symbols.len(), 3);
        assert_eq!((d.symbols[0].start, d.symbols[0].end), (1, 4));
        assert_eq!(split_terms("crewSummary sync_herdr HTTPServer"), "crew summary ");
    }
}

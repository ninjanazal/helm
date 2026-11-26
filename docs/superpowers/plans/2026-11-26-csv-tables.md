# CSV Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only CSV tables: names/columns injected as a session section, rows fetched via `mcp__helm__table`.

**Architecture:** One new module `hooks/tables.ts` (parse, load, section, tool). `tools.ts` registers/dispatches; `register.tsx` injects the section. Reference implementation: Part 2 of `/home/eurico-martins/Downloads/tag-csv-plan.md` (tables.ts part only; ignore mirrors/`area`).

**Tech Stack:** TypeScript, `claude-code/testing` (bun-style `test`/`expect`), `$` EngineInterface (`$.fs.read/list`, `$.session.cwd`).

**Spec:** `.claude/helm/task.md` + grilling decisions below.

## Global Constraints
- Dir `.claude/helm/tables`, section id `helm:tables`, scope `session`.
- All I/O via `$.fs`; no new dependencies; never write any CSV; no row data in the section.
- Section ≤60 lines and ≤4096 bytes; omitted entirely when no tables.
- Tables = top-level `*.csv` only (no subdirs, no dotfiles); name = file name minus `.csv`, matched case-insensitively.
- `$.fs.list` entries may be `string` or `{name: string}`: accept both.
- Files over 1 MB (1_048_576 chars read) are not parsed; listed as `name (too large)`.
- Empty header → `col_N` (1-based index); duplicate header → `name_2`, `name_3`.
- `where` = exact, `contains` = substring, both case-insensitive; all conditions AND.
- query `limit` default 20, max 50; reply ≤8 KB; when cut, append `N of M rows shown`.
- Don't touch knowledge.ts, deck files.

## Review Focus
1. Quoted field holding a newline: row count must not grow → test in Task 1.
2. File with only a header row: `list` says 0 rows, query returns header + "0 of 0"-style empty result, no throw → Task 2.
3. `$.fs.list` throws (dir missing) → section `''`, tool `no tables yet` → Task 2.
4. Unknown column in `columns` → message listing valid columns → Task 2.
5. One huge cell (>8 KB) → reply still ≤8 KB → Task 2.

---

### Task 1: CSV parser and header normalising

**Files:** Create `hooks/tables.ts`, `hooks/tables.test.tsx`

**Interfaces — Produces:**
- `parseCsv(text: string): string[][]` — RFC 4180; strips BOM; CRLF/LF; ragged rows padded/trimmed to header width; drops trailing empty line.
- `normHeader(h: string[]): string[]`

- [ ] Step 1: tests
```ts
test('csv: quotes, commas, newlines, escapes, CRLF, BOM', () => {
  expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n"l1\nl2",z\r\n'))
    .toEqual([['a','b'],['x, y','he said "hi"'],['l1\nl2','z']])
})
test('csv: ragged rows padded/trimmed', () => {
  expect(parseCsv('a,b\n1\n1,2,3\n')).toEqual([['a','b'],['1',''],['1','2']])
})
test('csv: header normalised', () => {
  expect(normHeader(['name','','name','name'])).toEqual(['name','col_2','name_2','name_3'])
})
```
- [ ] Step 2: run `make check` → FAIL (module missing)
- [ ] Step 3: implement as a char-by-char state machine
- [ ] Step 4: `make check` → PASS

### Task 2: load, section, tool

**Files:** Modify `hooks/tables.ts`, `hooks/tables.test.tsx`

**Interfaces — Consumes:** Task 1. **Produces:**
- `TABLES_DIR`, `TABLES_ID` constants
- `tablesSection($: EngineInterface): Promise<string>` — `''` when no tables; lines `- name (N rows): col1, col2`
- `tableTool($: EngineInterface, args: Record<string, unknown>): Promise<string>`

Tests use a `fake(files)` engine like `hooks/knowledge.test.tsx:49`, with `fs.list` returning names (test both shapes).

- [ ] Step 1: tests
  - people.csv (`name,city` / `"Doe, Jane",Porto` / `Bob,Lisboa`): `query {table:'People', where:{city:'porto'}}` contains `Doe, Jane`, not `Bob`.
  - `contains:{name:'JAN'}` + `where:{city:'lisboa'}` → no rows (AND).
  - 30 tables × 40 columns → `tablesSection` byte length ≤ 4096 and ≤ 60 lines.
  - `fs.list` throws → section `''`, `list` → `no tables yet`.
  - `{name:'x.csv'}` and `'x.csv'` list shapes both load; `sub/`, `.hidden.csv`, `a.txt` ignored.
  - 120-row table, `limit:999` → 50 rows and `50 of 120 rows shown`.
  - 1.1M-char file → `list` shows `(too large)`, query on it returns a "too large" message.
  - header-only file → `list` shows `0 rows`, query doesn't throw.
  - unknown table / unknown column → message naming valid ones.
  - one 20 KB cell → reply length ≤ 8192.
  - `schema` → columns + at most 3 rows.
- [ ] Step 2: `make check` → FAIL
- [ ] Step 3: implement (reference: patch's `tableTool`)
- [ ] Step 4: `make check` → PASS

### Task 3: wire up and docs

**Files:** Modify `hooks/tools.ts` (register `table`, dispatch `mcp__helm__table`), `hooks/register.tsx:13,52-59` (add `TABLES_ID` to `HELM_SECTIONS`; push section when non-empty, `.catch(() => '')`), `README.md`, `skills/help/SKILL.md` (short "Tables (CSV)" section).

- [ ] Step 1: `make check` → PASS (92+ tests, skill checks green)
- [ ] Step 2: live check: put `.claude/helm/tables/people.csv` in place, reload plugin, call `mcp__helm__table {action:'list'}` → `people (2 rows)`. Remove the file after.
- [ ] Step 3: `git diff --stat` shows only scope files.

Commits: host only, via `/helm:commit`, after all tasks.

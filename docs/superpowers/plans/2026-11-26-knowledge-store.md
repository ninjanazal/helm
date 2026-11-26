# Knowledge Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-project knowledge store (topic map, vision, link to GLOSSARY.md) that helm injects as a capped index, fills via `mcp__helm__knowledge` and `/helm:map`, and shows on the deck as a read/write strip with size and coverage.

**Architecture:** `hooks/knowledge.ts` owns the store: pure parse/format/cap/coverage functions plus thin `$.fs` wrappers. `tools.ts` registers the tool; `register.tsx` adds a `helm:knowledge` session section. The deck detects knowledge reads/writes in its tool hook and draws a strip modelled on `pipeline()`.

**Tech Stack:** TypeScript plugin hooks on the `claude-code` engine; tests via `claude-code/testing` (`make check`).

**Spec:** `.claude/helm/task.md` (approved prompt) + grilling answers below.

## Global Constraints

- Store dir: `.claude/helm/knowledge/` — files `index.md`, `vision.md`. Glossary: repo-root `GLOSSARY.md` (domain-modeling format), linked, never copied.
- `.gitignore` keeps `.claude/helm/` ignored but adds `!.claude/helm/knowledge/` (and `.claude/helm/*` form if needed so the negation works).
- Index line format: `- <topic>: <path>[, <path>]{0,2} — <note>`; max 3 paths, note ≤ 80 chars, topic unique (case-insensitive).
- Injected index cap: 60 lines / 4096 bytes; when cut, append `- … N more entries (run /helm:map)`.
- Section id `helm:knowledge`; text starts `# Helm knowledge` and contains the rule "Check this index before searching; read linked files only when relevant." plus the capture rules (model-driven add; glossary/vision written silently with a one-line "noted: X").
- Stale entries (a path missing) are dropped from the injected index, never auto-deleted.
- Coverage = tracked top-level dirs (excluding dotdirs, `docs`, `test`, `tests`, `fixtures`, `bench`) with ≥1 entry path inside ÷ all such dirs, integer %.
- No new dependencies, no server, no embeddings (README.md:30-38). Theme colour names only.
- Strip: under the pipeline strip, lit cell held 2000 ms, hidden with no store or too few rows.

## Review Focus

- Index with a hand-edited malformed line → parse skips it, never throws, other entries survive.
- `add` with a topic differing only in case → updates in place, no duplicate.
- Repo with no source dirs (all excluded) → coverage 0%, no divide-by-zero.
- No store at all → no section, no strip, tool `status` says "no knowledge yet".
- Note longer than 80 chars / more than 3 paths → truncated, not rejected.

---

### Task 1: knowledge store module

**Files:**
- Create: `hooks/knowledge.ts`
- Test: `hooks/knowledge.test.tsx`

**Interfaces:**
- Produces:
  - `type Entry = { topic: string; paths: string[]; note: string }`
  - `parseIndex(md: string): Entry[]`, `formatIndex(e: Entry[]): string`
  - `upsert(e: Entry[], x: Entry): Entry[]` (case-insensitive topic, clamps paths ≤3, note ≤80)
  - `removeEntry(e: Entry[], topic: string): Entry[]`
  - `capIndex(md: string, lines = 60, bytes = 4096): string`
  - `stale(e: Entry[], exists: (p: string) => boolean): Entry[]`
  - `coverage(e: Entry[], tracked: string[]): number`
  - `type KnowStats = { entries: number; bytes: number; coverage: number; stale: number }`
  - `KNOWLEDGE_DIR`, `KNOWLEDGE_ID = 'helm:knowledge'`
  - `knowledgeSection($): Promise<string>` ('' with no store)
  - `knowledgeStats($): Promise<KnowStats | undefined>`
  - `knowledgeSet($, args): Promise<string>` (actions: `add`, `remove`, `stale`, `status`, `vision`, `term`)
- Consumes: `$.fs.read`, `$.fs.write`, `$.session.cwd()` (pattern: `hooks/testing.ts:46-52`). First check the engine's fs/exec API for path existence and listing tracked files (`git ls-files`); if neither exists, `exists` = `$.fs.read` succeeds on the file, and coverage uses a dir list passed by the `/helm:map` skill (`tracked` arg on `status`). Report which was used.

- [ ] **Step 1: Write failing tests** `knowledge: parse/format round-trips`, `upsert dedupes case-insensitively and clamps`, `malformed lines skipped`, `capIndex cuts at 60 lines / 4096 bytes with "… N more entries"`, `stale lists entries with a missing path`, `coverage: 2 of 4 dirs → 50; none → 0`.
- [ ] **Step 2: Run** `make check` — expect these FAIL (module missing).
- [ ] **Step 3: Implement** the signatures above in `hooks/knowledge.ts`. `term` appends `**<term>**: <def>` under GLOSSARY.md (creates it with a `# Glossary` header); `vision` appends a bullet to vision.md; every reply ≤1 line.
- [ ] **Step 4: Run** `make check` — PASS.
- [ ] **Step 5: Commit** `feat(knowledge): store, index cap, stale and coverage`.

### Task 2: tool and session section

**Files:** Modify `hooks/tools.ts` (register + dispatch), `hooks/register.tsx:12,43-58`

**Interfaces:** Consumes Task 1's `knowledgeSet`, `knowledgeSection`, `KNOWLEDGE_ID`.

- [ ] **Step 1:** Register `knowledge` tool: `action` enum `add|remove|stale|status|vision|term`, plus `topic`, `paths` (string[]), `note`, `text`, `term`, `tracked` (string[]). Dispatch in `handleHelmTool` like the others.
- [ ] **Step 2:** Add `KNOWLEDGE_ID` to `HELM_SECTIONS`; push the section only when non-empty.
- [ ] **Step 3:** `make check` — PASS. Commit `feat(knowledge): tool and index section`.

### Task 3: skill, docs, gitignore

**Files:** Create `skills/map/SKILL.md`; modify `skills/help/SKILL.md`, `README.md`, `.gitignore`

- [ ] **Step 1:** `.gitignore`: make `git check-ignore .claude/helm/knowledge/index.md` exit 1 while `git check-ignore .claude/helm/task.md` exits 0 (use `.claude/helm/*` + `!.claude/helm/knowledge/`).
- [ ] **Step 2:** `skills/map/SKILL.md` (`/helm:map [topic]`): judgement skill (not a one-call mapper) — list top-level dirs with `git ls-files`, read narrowly, call `mcp__helm__knowledge` `add` per topic (format rules above), then `stale` and `status` with `tracked`, and report entries/coverage/stale in ≤3 lines.
- [ ] **Step 3:** Add `/helm:map` to help and README (one line each, plus a short "Knowledge" README paragraph).
- [ ] **Step 4:** Both check-ignore commands as above; `make check` PASS. Commit `feat(map): /helm:map skill and docs`.

### Task 4: deck knowledge strip

**Files:** Modify `hooks/deck-core.ts` (near `pipeline`, :730-760), `hooks/deck.tsx:151-154,293+`, `hooks/deck.test.tsx`

**Interfaces:**
- Consumes: Task 1 `knowledgeStats($)`, `KNOWLEDGE_DIR`.
- Produces: `knowStrip(k: { stats: KnowStats; op?: 'read' | 'write'; at?: number }, now: number, w: number, rows: number): Line[]` and `KNOW_ROWS = 2`.

- [ ] **Step 1: Failing tests:** strip lit `read` cell for op read within 2000 ms; `write` likewise; both `▱` after 2000 ms; label row `"12 entries · 3.1 KB · 50% covered"` (+ `" · 2 stale"` when stale>0); `[]` with no stats or rows < KNOW_ROWS.
- [ ] **Step 2:** `make check` — FAIL.
- [ ] **Step 3:** Implement `knowStrip` reusing pipeline's `cell`/`centre` style (cells `read` · `knowledge` · `write`, middle cell always `bg: 'subtle'`). In `deckTool`: Read whose `file_path` contains `KNOWLEDGE_DIR` or GLOSSARY.md, or `mcp__helm__knowledge` `status|stale` → op read; `add|remove|vision|term` → op write; refresh stats then. Load stats at session start. In render, place the strip under the pipeline, consuming its rows from `free`.
- [ ] **Step 4:** `make check` — PASS. Commit `feat(deck): knowledge read/write strip`.

## Execution order

Tasks 1 and 3 in parallel → Task 2 and Task 4 in parallel (both need Task 1; no shared files). Host runs whole-task acceptance from `.claude/helm/task.md` at the end.

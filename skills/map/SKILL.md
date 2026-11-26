---
name: map
description: Map this repo into helm's knowledge index - which top-level areas exist, what each is for, and the repo's terms and vision. Use when the person runs /helm:map or asks helm to learn, index or map the codebase.
argument-hint: "[topic]"
---

Build or refresh the knowledge index in `.claude/helm/knowledge/`. This is a judgement task, not a one-call mapper: read narrowly, decide what each area is for, then record it.

1. Scope. If `$ARGUMENTS` names a topic, map only that area. Otherwise list the top-level directories with `git ls-files`, and skip dotdirs, `docs`, `test`, `tests`, `fixtures` and `bench`.
2. Read narrowly. For each area, read its README or entry file and a few representative files (`git ls-files <dir> | head`). Do not read whole trees.
3. Record each area with `mcp__helm__knowledge` `action: "add"`, one call per topic:
   - `topic`: a short noun, unique case-insensitively. An existing topic is updated in place, so reuse it.
   - `paths`: up to 3 repo-relative paths that best show the area.
   - `note`: what the area is for, at most 80 characters. Longer notes are truncated by the tool, not rejected.
   - Index line format: `- <topic>: <path>[, <path>] — <note>`.
   - Do not copy glossary or vision text into the index. Terms go to `GLOSSARY.md` at the repo root and the vision to `vision.md` through `action: "term"` (`term` plus `text`, the definition) and `action: "vision"` (`text`), which the tool writes silently with a one-line "noted: X".
4. Then call `mcp__helm__knowledge` `action: "stale"` and `action: "status"`, passing `tracked` as the `git ls-files` output (file paths, as a list). Stale entries (a missing path) are reported, never deleted automatically; remove one only with `action: "remove"` if the person asks.
5. Report in at most 3 lines: entries added or updated, coverage (the tool's `status` percentage of tracked top-level directories with an entry), and stale entries by topic. If the tool says there is no knowledge yet, say that instead.

Do not write files by hand, and do not call any tool beyond `mcp__helm__knowledge` and the read-only `git ls-files`, `ls` and `head`.

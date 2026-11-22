# Interactive make targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 24 make targets with 5 argument-free targets (`setup`, `remove`, `status`, `index`, `check`) whose choices are asked by `scripts/helm.sh`.

**Architecture:** All logic moves from the Makefile into one POSIX sh script with a function per piece and per verb; the Makefile becomes thin targets plus hidden legacy aliases. Tests drive the script with a stub `claude`/`cargo` on PATH and scripted stdin.

**Tech Stack:** POSIX sh, GNU make, existing `claude plugin test .` + `cargo test`.

**Spec:** `docs/superpowers/specs/2026-11-22-make-interactive-design.md`

## Global Constraints
- POSIX sh only (`#!/bin/sh`, no arrays, no `[[ ]]`, no `local` reliance); no new dependencies.
- Install/remove commands stay byte-identical to today's Makefile recipes (`claude plugin install helm --marketplace <src> --scope <s>`, `claude plugin install superpowers@claude-plugins-official --scope <s>`, `cargo install --path atlas --root <dir> --quiet --force`, `claude mcp add --scope <s> atlas -- <bin>/atlas mcp`, …).
- Scopes: `local` (this project, default) and `user` (every project). BIN local=`$PWD/.atlas/bin`, user=`$HOME/.local/bin`.
- Output style: `▸` step headers, `✔` green / `○` yellow-or-dim, colours only when stdout is a tty and `NO_COLOR` unset.
- Env presets honoured: `SCOPE`, `FROM` (here|github → `ninjanazal/helm`), `DIR`, `PIECES` (space-separated: `helm superpowers atlas herdr`), `YES=1` (skip remove confirm).
- Do not touch the uncommitted edits in hooks/deck-core.ts, deck.tsx, deck.test.tsx, register.tsx, nudge.*.

## Review Focus
- stdin not a tty (CI, `make setup < /dev/null`): setup must use defaults and finish; remove must exit 1 with a hint, never prompt or delete. → test in Task 1.
- Invalid menu input (`9`, `x`, empty for "where?"): re-ask once-per-bad-line or take the default for empty; never run with an unknown piece. → test in Task 1.
- Old alias with variables (`make atlas SCOPE=user`) must still act at user scope without prompting. → test in Task 2.
- `claude` missing from PATH: `status` still prints rows (all ○) instead of aborting. → test in Task 1.
- `NO_COLOR=1 make` / piped output: no escape codes. → test in Task 2.

---

### Task 1: `scripts/helm.sh` with tests

**Files:**
- Create: `scripts/helm.sh` (executable)
- Create: `scripts/helm.test.sh` (executable)

**Interfaces:**
- Produces: `sh scripts/helm.sh <verb>` with verbs `help | setup | remove | status | index | check`, plus non-interactive piece verbs used by aliases: `install <piece>` / `uninstall <piece>` / `update` / `enable` / `disable` (scope from `SCOPE`). Exit 0 on success, 1 on bad verb/refusal, printing `usage: make help` on a bad verb.

- [ ] **Step 1: Write `scripts/helm.test.sh`.** It makes a temp dir with stub `claude` and `cargo` scripts that append their argv to `$TMP/calls` (stub `claude plugin list` prints nothing, i.e. nothing installed), prepends it to PATH, and asserts:
  - `printf '1\n\n' | sh scripts/helm.sh setup` → calls contains `plugin install helm --marketplace` and `--scope local`, and `plugin install superpowers@claude-plugins-official --scope local`.
  - `printf '2\n2\n' | sh scripts/helm.sh setup` → calls contains only the superpowers install, with `--scope user`.
  - `sh scripts/helm.sh setup < /dev/null` → exit 0, installs all with `--scope local`.
  - `printf '1\n9\n2\n' | sh scripts/helm.sh setup` → output contains `not a choice`, then installs superpowers only.
  - `sh scripts/helm.sh remove < /dev/null` → exit 1, output contains `make remove` hint, calls file has no `uninstall`.
  - `printf '1\n1\ny\n' | sh scripts/helm.sh remove` → calls contains `plugin uninstall helm@helm --scope local`; with answer `n` → no uninstall.
  - `PATH=<dir without claude> sh scripts/helm.sh status` → exit 0, ≥5 lines containing `○`.
  - `sh scripts/helm.sh bogus` → exit 1, contains `make help`.
  - `NO_COLOR=1 sh scripts/helm.sh help | grep -c "$(printf '\033')"` → 0; `help | wc -l` ≤ 15.
- [ ] **Step 2:** `sh scripts/helm.test.sh` → FAIL (script missing).
- [ ] **Step 3: Implement `scripts/helm.sh`.** Functions: `ask_scope` (menu `1) this project only (default)  2) every project`; skip if `SCOPE` set or stdin not a tty), `ask_pieces` (numbered list with each piece's state from `piece_state <piece>`; Enter = all; skip if `PIECES` set or no tty), `piece_install/piece_remove <piece>` (recipes moved verbatim from Makefile), `cmd_status` (the 7 doctor checks, each guarded with `command -v claude`), `cmd_index` (`$ATLAS index --root ${DIR:-$PWD}`), `cmd_check` (`claude plugin validate .` then `claude plugin test .` then cargo test). In setup, an installed helm row says `→ will update` and, when chosen, asks `update / disable / enable / leave` (default update). Read input with `read -r`; validate against the menu numbers.
- [ ] **Step 4:** `sh scripts/helm.test.sh` → all PASS; `sh -n scripts/helm.sh` exits 0; `shellcheck -s sh scripts/*.sh` clean if installed.
- [ ] **Step 5: Commit** `feat(make): add interactive helm.sh behind the make targets`.

### Task 2: Thin Makefile, aliases, docs

**Files:**
- Modify: `Makefile` (whole file)
- Modify: `README.md:16-18,52`, `skills/help/SKILL.md:7,37`, `hooks/atlas.ts:49`, `hooks/atlas.test.tsx:33`
- Modify: `scripts/helm.test.sh` (add make-level assertions)

**Interfaces:**
- Consumes: Task 1's verbs.
- Produces: targets `help` (default goal), `setup`, `remove`, `status`, `index`, `check`; hidden aliases.

- [ ] **Step 1: Add make-level assertions** to `scripts/helm.test.sh`:
  - `make -s help | wc -l` ≤ 15 and contains none of `local:|global|doctor|atlas-remove|superpowers-remove`.
  - `make -s atlas SCOPE=user` (stubs on PATH) → calls contains `mcp add --scope user atlas`, stderr contains `→ now: make setup`, no prompt read (run with `< /dev/null`).
  - `make -s doctor 2>&1` contains `→ now: make status`.
  - `NO_COLOR=1 make -s help` has no escape codes.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Rewrite `Makefile`.** `.DEFAULT_GOAL := help`; each new target is `@sh scripts/helm.sh <verb>` with `export SCOPE FROM DIR PIECES YES` (only when set). Alias map (each prints `→ now: make <new>` to stderr, then runs non-interactively): local→`setup` with `SCOPE=local`, global→`setup` `SCOPE=user` (no index), unlocal/unglobal→`remove` with `YES=1 PIECES="helm superpowers atlas"`, doctor→status, install/plugin→`install helm`, superpowers/atlas/herdr→`install <piece>`, `<piece>-remove`/plugin-remove→`uninstall <piece>`, index-remove→`uninstall index`, update/enable/disable→same verb, test/validate→the matching part of check. Help text lives in the script (`help` verb), not in `##` comments.
- [ ] **Step 4: Docs.** README quick start → the 5 targets; help skill line 7 → `make setup` (pick superpowers); line 37 → `make setup` (pick atlas); `hooks/atlas.ts:49` → ``atlas is not installed. Run `make setup` in the helm repo and pick atlas.``; test line 33 → `toContain('make setup')`.
- [ ] **Step 5:** `sh scripts/helm.test.sh` PASS; `make check` no new failures vs. baseline; `git diff --stat` only the files above.
- [ ] **Step 6: Commit** `refactor(make): collapse targets into setup, remove, status, index, check`.

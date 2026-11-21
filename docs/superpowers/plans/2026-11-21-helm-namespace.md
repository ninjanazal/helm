# helm namespace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace team mode with four `helm:` skills — `deck`, `prompt`, `agent`, `atlas` — each backed by a helm tool that does the deterministic work.

**Architecture:** Skills in `skills/<verb>/SKILL.md` parse `$ARGUMENTS` and call one `mcp__helm__*` tool, relaying its text. Tools are registered in a new `hooks/tools.ts`; logic lives in small pure-first modules (`atlas.ts`, `agents.ts`, deck on/off in `deck.tsx`/`deck-core.ts`). `register.tsx` shrinks to the deck's event wiring plus tool registration.

**Tech Stack:** TypeScript/TSX on the `claude-code` plugin engine (`$`, `atom`, `claude-code/testing`), herdr 0.9.5 CLI, atlas (Rust, unchanged).

**Spec:** `docs/superpowers/specs/2026-11-21-helm-namespace-design.md`

## Global Constraints

- Registered command names must match `/^[a-zA-Z0-9_-]{1,64}$/` — so no hook commands; every `helm:` verb is a skill.
- No `/deck` or `/team` command remains. No `mcp__helm__*_team`, `write_file`, `add_task`, `read_file`, `list_files` tools remain.
- Tool answers use the existing convention: `{ result: string }`, errors `{ deny: string }` (move `toolText`/`toolArgs` from `register.tsx` into `tools.ts`).
- Every external call (`herdr`, `atlas`, `git`) goes through `$.process.run` with a timeout; failures become a readable message, never a throw.
- Agent files: `.claude/agents/<name>.md` (project) and `~/.claude/agents/<name>.md` (user). Names match `/^[a-z0-9][a-z0-9-]{0,63}$/`.
- Agent launch env var: `HELM_AGENT=<name>`. In a session with it set, the deck never opens and `agent_launch` refuses (no nested panes).
- Current task file: `.claude/helm/task.md` (project root). *Deviation from the spec's `$.store`, my call:* a file survives sessions, is readable by the agent, and avoids quoting a long prompt through herdr argv. Add `.claude/helm/` to `.gitignore`.
- Run all tests with `make check` (`claude plugin validate .` + `claude plugin test .` + `cargo test`).

## Review Focus

1. `/helm:deck off`, then `/clear` → the deck must stay closed (the `deckCleared` reopen timers must check the off flag). Test in Task 2.
2. `/helm:deck off`, then a brand-new session → stays closed (stored flag read at `session.start`). Test in Task 2.
3. `/helm:agent <name>` with no approved prompt yet → message offering `/helm:prompt`, no pane opened. Test in Task 4.
4. Agent file with missing/garbled frontmatter in `.claude/agents/` → listed as `<name> (unreadable frontmatter)`, never crashes `list`. Test in Task 4.
5. `/helm:atlas` with no atlas binary → says how to install (`make atlas`), not an error trace. Test in Task 3.

---

### Task 1: Remove team mode

**Files:**
- Delete: `hooks/contract.ts`, `hooks/contract.test.tsx`, `hooks/team.test.tsx`, `skills/create/`, `skills/start/`, `skills/janitor/`, `.claude/teams/`
- Rewrite: `hooks/register.tsx` (keep only deck wiring)
- Modify: `hooks/herdr.ts` (drop `crewSummary`, `syncHerdr`, `metadataArgv`, TTL/refresh state; keep `detectHerdr`, `resetHerdr`, `type Herdr`), `hooks/herdr.test.tsx`, `types/index.d.ts` (drop team types: `Member`, `Team`, `Live`, `Msg`, `QueueItem`, `Receipt`, `ChainRow`, `Draft`, `Layout`, `Tab`, `TeamEntry`, `TeamFile`, `LogEntry`, `MemberStatus` and their atom declarations; keep `DeckState`, `DeckDone`, `deck`, `deckFrame`)

**Interfaces:**
- Produces: `register.tsx` exporting `register: Register` that calls `registerDeck(on, options)` and wires these, each wrapped so errors fall through to `next(e)` as today:
  `session.measure → deckMeasure`, `session.end (reason 'clear') → deckCleared`, `session.start → deckStart` then `next` then `deckOpen`, `prompt.submit → deckPrompt`, `turn.step → deckStep(res.usage)`, `tool.call → deckTool(res)`, `turn.complete → deckTurnDone`.
- Produces: `herdr.ts` exports `detectHerdr($): Promise<Herdr | null>`, `resetHerdr(preset?)`, `type Herdr = { bin: string; pane: string }`.

- [ ] **Step 1:** `git checkout -b feat/helm-namespace` (the working tree's uncommitted WIP goes with it; commit it first as `wip: pre-namespace state` if the person agrees at execution start).
- [ ] **Step 2:** Delete the files listed above. Rewrite `register.tsx` to the wiring in Interfaces (~60 lines). Trim `herdr.ts`, its test (keep only a "detect is null without env" test), and `types/index.d.ts`.
- [ ] **Step 3:** Run `make check`. Expected: validate OK, deck + herdr tests pass, cargo tests pass, no TypeScript errors about missing team types.
- [ ] **Step 4:** Run `grep -rn "team\|contract" hooks types skills --include=*.ts* --include=*.md -il`. Expected: no hits other than prose to be rewritten in Task 5 (`skills/help`, `skills/prompt`).
- [ ] **Step 5:** Commit `refactor: remove team mode`.

### Task 2: Deck on/off, task tool, quiet agent sessions

**Files:**
- Modify: `hooks/deck-core.ts`, `hooks/deck.tsx`, `hooks/deck.test.tsx`
- Create: `hooks/tools.ts`
- Modify: `hooks/register.tsx` (call `registerHelmTools($)` in `session.start`, route `tool.call` for `mcp__helm__*`)

**Interfaces:**
- Produces (`deck-core.ts`): `isDeckOn(stored: unknown, agentEnv: string | undefined): boolean` — `false` if `agentEnv` is a non-empty string, else `stored !== false`.
- Produces (`deck.tsx`): `deckSet($, on: boolean): Promise<string>` — stores `deckOn:<projectRoot>` in `$.store`, opens or closes the pane (`$.ui.close` for `PANE`), returns `"Deck on."` / `"Deck off."`. `deckTask($, text: string): Promise<string>` — the old `command.run 'deck' task` body, returns `"Deck task set: <text>"`. `deckReset($): Promise<string>` → `"Deck reset."`. `deckOpenCmd($): Promise<string>` → `"Deck opened."` (also turns it on). Module flag `deckIsOn`, set in `deckStart` from `isDeckOn(await $.store.get(key), await $.env.get('HELM_AGENT'))`; `deckOpen`, `deckCleared`'s timers and `deckPrompt`'s reopen do nothing while it is false; polling and the frame timer skip work while it is false. Remove the `command.register` and `command.run 'deck'` handler.
- Produces (`tools.ts`): `registerHelmTools($): Promise<void>`, `handleHelmTool($, tool: string, args: Record<string, unknown>): Promise<unknown | undefined>` (undefined = not a helm tool), `toolText(text, isError?)`, `toolArgs(e)`. Tool `deck`: `{ action: 'open'|'on'|'off'|'task'|'reset', text?: string }`, `isDeferred: false`.

- [ ] **Step 1: Failing tests** in `deck.test.tsx`:

```ts
test('deck on/off: stored off wins, agent sessions never open', () => {
  expect(isDeckOn(undefined, undefined)).toBe(true)
  expect(isDeckOn(false, undefined)).toBe(false)
  expect(isDeckOn(true, 'reviewer')).toBe(false)
  expect(isDeckOn(true, '')).toBe(true)
})
test('deck tool: off closes and survives /clear; on reopens', async ($, on) => { /* register(), fire session.start,
  call handleHelmTool($, 'mcp__helm__deck', { action: 'off' }) → result 'Deck off.'; fire session.end {reason:'clear'},
  advance clock 6s; expect the pane not open. Fire session.start again (new session): still not open.
  action 'on' → 'Deck on.' and pane open. action 'task', text 'ship it' → 'Deck task set: ship it'. */ })
```

- [ ] **Step 2:** `claude plugin test .` → FAIL (`isDeckOn` / `handleHelmTool` not defined).
- [ ] **Step 3:** Implement per Interfaces. Pane open state: use whatever the test `$` exposes for open panes (see how the deleted `team.test.tsx` asserted `ui.open`; `git show HEAD~1:hooks/team.test.tsx | grep -n "ui\." ` for the pattern).
- [ ] **Step 4:** `make check` → PASS.
- [ ] **Step 5:** Commit `feat(deck): on/off and task via the helm deck tool`.

### Task 3: atlas status and refresh

**Files:**
- Create: `hooks/atlas.ts`, `hooks/atlas.test.tsx`
- Modify: `hooks/deck.tsx` (import `atlasBin` from `atlas.ts` instead of its own copy), `hooks/tools.ts`

**Interfaces:**
- Produces: `atlasBin($, cwd): Promise<string | undefined>` (moved unchanged). `atlasReport(status: unknown, stats: unknown): string` — pure. `atlasTool($, action: 'status'|'refresh'): Promise<string>`.
- Tool `atlas`: `{ action: 'status'|'refresh' }`.

- [ ] **Step 1: Failing tests** in `atlas.test.tsx`. First run `atlas status --json` and `atlas stats --json` in this repo and paste their real output as fixtures. Assertions:
  - fresh index → report contains `fresh`, the file count, and no `refresh` hint;
  - stale (changed files > 0) → contains `stale`, the changed count, and `/helm:atlas refresh`;
  - no index (`status` says missing or non-JSON) → `not indexed` and `/helm:atlas refresh`;
  - `atlasTool` with no binary (stub `atlasBin` → undefined via an injected lookup) → contains `make atlas`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `refresh` runs `[bin, 'index', '--root', cwd]`, timeout 120000, and returns the last stdout line plus a fresh `atlasReport`. Non-zero exit → `deny` with stderr's first 200 chars.
- [ ] **Step 4:** `make check` → PASS.
- [ ] **Step 5:** Commit `feat(atlas): status and refresh tool`.

### Task 4: Agents — list, save, current task, launch

**Files:**
- Create: `hooks/agents.ts`, `hooks/agents.test.tsx`
- Modify: `hooks/herdr.ts` (add argv builders), `hooks/tools.ts`, `.gitignore` (`.claude/helm/`)

**Interfaces:**
- Produces (`agents.ts`):
  - `type AgentSpec = { name: string; description: string; model?: string; effort?: string; tools?: string[]; instructions: string }`
  - `type AgentInfo = AgentSpec & { source: 'project' | 'user'; ok: boolean }`
  - `parseAgent(md: string, name: string, source): AgentInfo` — YAML-ish frontmatter (`key: value`, `tools` comma-separated); missing/garbled → `ok: false`.
  - `agentFile(spec: AgentSpec): string` — inverse of `parseAgent` (frontmatter + body). Round-trips.
  - `agentLine(a: AgentInfo): string` — `<name> · <model|inherit> · <effort|default> · <tools|all tools> · <source> — <description>`; `ok:false` → `<name> (unreadable frontmatter) · <source>`.
  - `listAgents($, root, home): Promise<AgentInfo[]>` — project first, then user agents whose name isn't in the project.
  - `setTask($, root, prompt: string, goal: string): Promise<void>` writes `.claude/helm/task.md` (`# <goal>\n\n<prompt>`); `getTask($, root): Promise<string | undefined>`.
  - `handoffPrompt(): string` — exactly: `Read .claude/helm/task.md: it is your task, already approved. Start with the superpowers brainstorming skill if it is available, then plan and build it.`
  - `launchAgent($, root, name, run?): Promise<string>`.
- Produces (`herdr.ts`): `splitArgv(h, cwd, name): string[]` → `[bin, 'pane', 'split', h.pane, '--direction', 'right', '--cwd', cwd, '--env', 'HELM_AGENT=<name>', '--no-focus']`; `paneIdFrom(stdout: string): string | undefined` — parses herdr JSON, returns the first `pane_id` found under `result`; `runArgv(h, pane, name, prompt): string[]` → `[bin, 'pane', 'run', pane, 'claude', '--agent', name, prompt]`.
- Tools: `agent_list {}`; `agent_save { name, description, model?, effort?, tools?: string[], instructions, overwrite?: boolean }` (refuses an existing name unless `overwrite`); `agent_launch { name }`; `set_task { prompt, goal }` (writes task file **and** calls `deckTask($, goal)`).

- [ ] **Step 1: Failing tests** in `agents.test.tsx`:
  - `parseAgent(agentFile(spec))` deep-equals `spec` (plus `source`, `ok: true`);
  - garbled file → `agentLine` is `x (unreadable frontmatter) · project`;
  - `agentLine` of `{name:'reviewer', model:'sonnet', effort:'high', tools:['Read','Grep'], description:'Reviews diffs', source:'user'}` is `reviewer · sonnet · high · Read, Grep · user — Reviews diffs`;
  - `splitArgv` / `runArgv` exact arrays as in Interfaces; `paneIdFrom('{"id":"x","result":{"pane":{"pane_id":"wC:p3"}}}')` is `wC:p3`, and `paneIdFrom('nope')` is undefined;
  - `launchAgent` with stubbed herdr and no task file → contains `/helm:prompt` and no `run` calls;
  - `launchAgent` outside herdr → contains `herdr`, no `run` calls;
  - `launchAgent` with `HELM_AGENT` set → refuses, no `run` calls;
  - `launchAgent` unknown name → lists available agent names;
  - happy path → two runs: `splitArgv(...)` then `runArgv(..., handoffPrompt())`, returns `Started <name> in pane <id>.`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `launchAgent` order: refuse if `HELM_AGENT`; `detectHerdr` null → herdr message; `getTask` empty → `/helm:prompt` offer; name not in `listAgents` → list; then split, parse id (missing → deny with herdr's stdout), run.
- [ ] **Step 4:** Live check, in herdr: save a throwaway agent via the tool, `set_task`, `agent_launch` → a right-hand pane opens running `claude --agent <name>` and it reads `.claude/helm/task.md`. If `herdr pane split` prints the id elsewhere, fix `paneIdFrom` and its test to the real output. Close the pane after.
- [ ] **Step 5:** `make check` → PASS. Commit `feat(agent): list, save, task hand-off and launch in herdr`.

### Task 5: Skills, docs and manifests

**Files:**
- Create: `skills/deck/SKILL.md`, `skills/atlas/SKILL.md`, `skills/agent/SKILL.md`
- Rewrite: `skills/prompt/SKILL.md`, `skills/help/SKILL.md`, `README.md`
- Modify: `.claude-plugin/plugin.json` + `marketplace.json` (description: `Steer Claude Code sessions: a live deck pane, a prompt builder, agents handed tasks in herdr panes, and atlas, a local code graph.`; drop `team` keyword), `Makefile` (`/deck` → `/helm:deck`)

**Interfaces:**
- Consumes: tools `deck`, `atlas`, `agent_list`, `agent_save`, `agent_launch`, `set_task` from Tasks 2–4.

- [ ] **Step 1:** `deck`, `atlas`: frontmatter `argument-hint` (`[on | off | task <text> | reset]`, `[refresh]`). Body: map `$ARGUMENTS` to the tool's `action` (empty → `open` / `status`), call the tool once, show its text as is, do nothing else. Unknown argument → list the valid ones without calling the tool.
- [ ] **Step 2:** `agent` (`argument-hint: "[list | <name>]"`): `list` → `agent_list`, show as is. `<name>` → `agent_launch`, show as is. Empty → if no approved task exists, say so and offer `/helm:prompt`; else draft an agent suited to the task in `.claude/helm/task.md` (name, description, model, effort, tools, instructions), show it, ask for changes and a name, call `agent_save`, then `agent_launch`. Outside herdr the launch reply says so; the agent stays saved.
- [ ] **Step 3:** `prompt`: keep the current procedure (goal, grounded context via atlas, constraints, acceptance checks, stop conditions, output) but make it unconditional, remove the "only when vague" trigger language from `description`, first call `deck` `{action:'task', text:<request>}`, and after approval call `set_task { prompt, goal }`, then stop and offer: work here (superpowers brainstorming → plan), or `/helm:agent [name]`.
- [ ] **Step 4:** `help`: one screen covering the four commands and the deck pane. No team content.
- [ ] **Step 5:** README: remove team sections and the "earlier team mode" paragraph; command table = the four skills + `/helm:help`.
- [ ] **Step 6:** `make check` → PASS. `grep -rni "/team\|/deck\b\|janitor\|helm:start\|helm:create" README.md skills Makefile .claude-plugin` → no hits.
- [ ] **Step 7:** Commit `feat: helm:deck, helm:agent, helm:atlas skills; docs`.

### Task 6: End-to-end check in a real session

- [ ] **Step 1:** `make install` (or `/reload-plugins`), restart Claude Code in herdr.
- [ ] **Step 2:** Run, in order, and check each: `/helm:deck off` (pane closes) → `/clear` (stays closed) → `/helm:deck on` (opens) → `/helm:atlas` (state report) → `/helm:atlas refresh` → `/helm:prompt add a --json flag to atlas stats` (prompt shown, deck task set; approve; `.claude/helm/task.md` written) → `/helm:agent list` → `/helm:agent` (define, save, pane opens; agent reads the task; no deck in that pane) → `/helm:agent <same name>` (second pane, no setup).
- [ ] **Step 3:** Fix anything that fails with a test first; record results in the PR description.

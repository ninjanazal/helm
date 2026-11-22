# helm: one `helm:` command surface — design

Date: 2026-11-21 · Status: draft for approval

## Intent

Everything helm offers is reached as `/helm:<verb>`. The previous approach (team mode: a fixed crew of job-contract
subagents in a team pane) is dropped. helm becomes: the deck pane, a prompt builder that is always used for new work,
agents handed tasks in their own herdr tab, and atlas.

Why: one predictable namespace; commands that do exactly what they say (`deck off` means off); and a forced path
through prompt-building so work starts from a complete, checkable prompt instead of a rough request.

## Goals

- `/helm:deck`, `/helm:prompt`, `/helm:agent`, `/helm:atlas` are the whole surface.
- Deterministic verbs (`deck on|off`, `atlas`, `atlas refresh`, `agent list`, `agent <name>`) act without the model
  interpreting anything.
- `/helm:prompt` cannot be skipped once invoked: it always builds the prompt and asks for approval first.
- Agents are reusable: defined once, saved, handed tasks later by name.

## Non-goals

- No team mode, team pane, team queue, team files, job contracts or member guardrails.
- No multi-agent orchestration inside one session (agents run in their own herdr tab / session).
- No agent support outside herdr beyond `list`.

## Anti-goals (failure even if it "works")

- `/helm:deck off` that leaves the pane open, keeps polling, or reopens on `/clear` / `/new`.
- `/helm:prompt` starting work before the person approved the prompt.
- `/helm:agent` handing off the raw rough request when an approved prompt exists.
- Leftover `/team` commands, `mcp__helm__*_team` tools or team docs after the change.

## Approaches considered

- **A. Hook-registered commands** named `helm:deck`, `helm:atlas`, `helm:agent` (via `$.command.register`), with
  `helm:prompt` staying a skill. Zero model turns for deterministic verbs. Depends on the engine accepting a `:` in a
  registered command name.
- **B. Skills calling small helm tools** (`deck_set`, `atlas_status`, `atlas_refresh`, `agent_list`, `agent_launch`).
  The `helm:` prefix is guaranteed (skills are namespaced by the plugin); behaviour is still fixed by the tool; costs
  one model turn per command.
- **C. Hybrid** (commands for deterministic verbs, skills where judgement is needed). Rejected: a skill and a command
  cannot share a name, which splits `helm:agent list` into differently named entries.

**Chosen: A, falling back to B** if the engine rejects `helm:`-prefixed registered command names. Picked by the person.

**Settled: B.** Claude Code 2.1.330 validates registered command names against `/^[a-zA-Z0-9_-]{1,64}$/`, so
`helm:deck` cannot be registered from hook code. Every `helm:` command is a skill (`skills/<verb>/SKILL.md`) whose
deterministic verbs call one helm tool registered with `$.tool.register`; the skill tells the model to call the tool
with the parsed argument and report the tool's text verbatim, nothing else. The old bare `/deck` command is removed
so there is one surface. Wherever this doc says "no model turn" read "one model turn that only relays a tool call".

## Commands

### `/helm:deck [on | off | task <text> | reset]`

- No argument: open the pane (today's `/deck`).
- `on`: turn the deck on for this project and open it. Remembered across `/clear`, `/new` and new sessions
  (per-project store key, like the old team on/off).
- `off`: close the pane, stop polling/animation timers, stop the auto-open on `session.start` / `/clear`. Remembered.
  Feed/metrics collection may keep running silently (cheap) so `on` shows a live picture — builder's call.
- `task <text>`, `reset`: as today.
- Default for a project never toggled: on (today's behaviour of opening at session start). *My call.*

### `/helm:prompt <rough request>` (skill; absorbs the earlier `helm:task` idea)

1. Re-anchor the deck: the request becomes the deck task; drift and turn counts reset (same effect as
   `deck task`). Needs a way for the skill to do this: a helm tool (e.g. `mcp__helm__deck_task`) or the
   `helm:deck task` command — builder's call.
2. Build the prompt with the existing `skills/prompt/SKILL.md` procedure (goal, grounded context via atlas,
   constraints, acceptance checks, stop conditions, output). Always, not only when the request looks vague.
3. Wait for approval. Nothing is worked on before it.
4. On approval: set the deck task to the prompt's one-line goal; store the approved prompt as the session's
   **current task** (used by `/helm:agent`).
5. **Stop at the approved prompt** (picked by the person). Tell the person the two ways on: work on it here, or
   `/helm:agent [name]` to hand it off. If they say to work here, the session uses superpowers (brainstorming → plan)
   when installed, otherwise works from the prompt and says so.
   The agent launch (`/helm:agent`) sends the approved prompt plus one line telling the agent to start with
   superpowers brainstorming if available, so the agent brainstorms and plans in its own pane.

### `/helm:agent [list | <name>]`

Agents are Claude Code agent files: `.claude/agents/<name>.md` (frontmatter: name, description, model, effort,
tools; body: instructions). *My call:* this folder, because `claude --agent <name>` reads it natively.

- **`/helm:agent` (no name):** in the current session, the model drafts an agent definition fitted to the current
  task with the person (role, model, effort, tools, instructions), asks for a name, writes
  `.claude/agents/<name>.md`, then launches it as below. Needs the model, so this path hands off to the model
  (under A: the command returns/injects an instruction for the model; under B: the skill does it).
- **`/helm:agent <name>`:** open a new herdr tab labelled `<name>` in the current workspace (`herdr tab create
  --label <name> --no-focus`) and run `claude --agent <name>` on the task in its root pane (`herdr pane run`).
  *Changed at the person's request (2026-11-22): a named tab per agent, not a split pane.* Unknown name → list the
  available agents.
- **`/helm:agent list`:** one line per agent: name, model, effort, tools, one-line description. Works without herdr.
- **The current task** is the latest approved `/helm:prompt` prompt. If there is none, *my call:* say so and offer
  `/helm:prompt` first rather than sending the raw conversation.
- Without herdr (`HERDR_PANE_ID` / `HERDR_BIN_PATH` unset): `<name>` and no-name report that herdr is required and stop
  (no-name still may save the definition — builder's call: save, then stop before launch).

### `/helm:atlas [refresh]`

- No argument: report state from `atlas status --json` and `atlas stats --json`: indexed or not, stale or fresh,
  files changed since last index, counts. Says how to install atlas if the binary is missing.
- `refresh`: run `atlas index --root <cwd>` and report the result.
- Binary lookup: reuse `deck.tsx`'s `atlasBin`.

## Removals

- Skills: `create`, `start`, `janitor`, `help` (replaced by a short `helm:help` covering the four commands —
  *my call*, keep `help`, rewritten).
- `/team` command and its handlers, the team pane, `mcp__helm__save_team|start_team|write_file|add_task|read_file|
  list_files` tools, team member registration as subagent types, queue, chain, team files, permission-flag tracking
  for members, team-related `AbovePrompt` rendering.
- `hooks/contract.ts` and its test: they are member job contracts/guardrails, team-only. *My call;* the plugin
  description's "guardrails" wording is dropped.
- `.claude/teams/` in this repo, team docs in README.
- Keep: deck (`deck.tsx`, `deck-core.ts`), herdr adapter (`herdr.ts`; its crew summary becomes unused and is removed or
  repurposed — builder's call), usage/limits bars if the deck uses them, atlas.

## Constraints

- Engine API is `$` from `claude-code` (`types/index.d.ts`); commands via `$.command.register` + `command.run`,
  tools via `$.tool.register`.
- herdr 0.9.5 CLI quirks (pane id first for `report-metadata`) — check `pane split` / `pane run` argument order the same
  way.
- Tests run with `claude plugin test .` and `cargo test` (`make check`). Existing deck/herdr tests must pass; team tests
  are deleted with the code.

## Calls settled after review (mine, correctable)

- **Current task lifetime:** stored per project in `.claude/helm/task.md` (git-ignored; the agent reads it directly), replaced by each newly approved `/helm:prompt`, kept across
  `/clear`, `/new` and new sessions. `deck task` / `deck reset` do not touch it.
- **Agent sessions:** launched with `HELM_AGENT=<name>` in the environment. helm sees it and keeps the deck closed
  and does not offer `/helm:agent` launches from inside (no nested panes) — the agent's pane is for the work.
- **Which agents count:** `list` and name lookup read project `.claude/agents/` and `~/.claude/agents/`, each line
  marked `project` / `user`. Plugin-shipped agents are not listed. New agents are saved to the project folder.

## Left to the builder

- Exact store keys and how `deck off` survives `/clear` (there is a `deckCleared` reopen path to gate).
- How the skill re-anchors the deck (tool vs command).
- Under A, how the no-name `helm:agent` path passes control to the model.
- Whether to keep the herdr display summary (e.g. "claude · agent <name> launched").

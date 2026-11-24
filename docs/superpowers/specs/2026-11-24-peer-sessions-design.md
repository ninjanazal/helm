# Peer sessions: see each other, warn on overlap, claim work

## Native vs missing

Checked on 2026-11-24, Claude Code 2.1.331, from this session with one other session open (a different project).

**Native, verified**
- `ListAgents` (model tool) lists live sessions on the machine: name, short id, `interactive`, busy/idle, age. It returned `pjplanner-18 [67dd9a] · interactive · busy · started 9m ago`. It is **machine-wide, not project-scoped**: that peer's cwd is `~/Projects/pjPlanner`. It gives no cwd, task, branch or files.
- Claude Code keeps a registry, `~/.claude/sessions/<pid>.json`: `pid, sessionId, cwd, startedAt, status, name, kind, messagingSocketPath, peerProtocol`. It is what `ListAgents` reads. It is internal and undocumented (`peerProtocol: 1`), and it disagreed with `ListAgents` once (registry `waiting`, `ListAgents` `busy`). Its `.key` siblings hold peer tokens and must never be read or copied. **Do not build on it**; at most a later optional accelerator.
- `SendMessage` (model tool) and `$.session.send({ to: { sessionId }, text })` (plugin API) deliver a message to another session, framed there as a peer turn with `origin.plugin`. Typed in `claude-code.d.ts` (`$.session.send`); **delivery not exercised**: the only peer is another project's, and interrupting it would be outward-facing. Unverified.
- `$.session.repo()` returns `root`, "the main working tree's for a worktree". `$.session.id()`, `$.session.cwd()`, `$.vcs.list` (worktrees, experimental) exist.
- Engine file API (read from the types): `$.fs` has `read, write, list (name, kind, size, mtimeMs), exists, stat`. **No mkdir, rename, delete or exclusive create**, and `write` overwrites. `$.process.run(argv)` runs a command with no shell (30 s default timeout), so `mkdir`, `mv`, `rm` are available. `$.store` is one JSON file per plugin under the user config dir, whole-value `set`, shared by all sessions: last writer wins.
- Verified here: 6 racing `mkdir claims/unit-a` produced exactly 1 winner. `mkdir` is the atomic claim primitive.

**Missing**
- Project-scoped discovery (who else is on *this* repo, including its worktrees).
- What a peer is doing: its task, branch, files edited.
- Overlap warnings (a peer edited the file you are about to edit).
- A task board with claims, and crash recovery for them.
- Peer state reaching the model without the model asking.

## Intent

Several Claude Code sessions on one project (same folder or git worktrees) should find each other with no setup, show the person who is doing what, avoid clobbering each other's files, and let work be split by claiming units from a shared board. Peers are equals; no lead.

## Goals
- Auto-discovery of peers on the same repo, worktrees included, with a heartbeat so "live" is true.
- Per-peer facts in the deck: task goal, branch, state, files edited.
- Overlap warning on edit, before the edit lands.
- A board of work units that a session claims atomically; a crashed session's claims free themselves.
- One session alone behaves exactly as today.

## Non-goals
- A lead session, auto-assigning work, or a scheduler.
- Cross-machine or cross-project coordination (use `ListAgents`/`SendMessage` for that).
- A daemon, TCP server, or new dependency.
- Merging worktrees; that stays git's job.

## Anti-goals (a failure even if it works)
- A peer shown live with no heartbeat behind it ("the runtime tells the truth").
- Any file helm must copy into a worktree for the flow to work, or any state a session cannot read from another cwd.
- A relaunch silently overwriting a task or taking another session's claim.
- Per-turn cost: no live peer list in the system prompt (it would bust the prompt cache every change).
- A hook failure breaking a turn: every hook falls through to `next(e)`, as in `hooks/register.tsx`.

## Approaches
1. **Per-session record files + claim directories in a shared dir (chosen).** Each session writes only its own file (no lost updates); claims use `mkdir` (atomic, verified). Works across worktrees, survives crashes by timestamp. Costs one `process.run` per claim and a small poll.
2. **One shared board file** (JSON). Simple to read, but `$.fs.write` is a blind overwrite with no lock: two sessions lose each other's updates. Loses.
3. **`$.store`**. Same whole-value last-writer-wins, 4 MiB cap, and it lives in the user config dir, so it is not tied to the project. Loses.
4. **Native only: `ListAgents` + `SendMessage`.** No project scope, no persistence, no atomic claim, no overlap data. Loses as the mechanism; kept as an optional nudge channel (`$.session.send`) in phase 3.

## Decided

**Shared dir.** `<repo-root>/.git/helm/peers/`, with `repo-root` from `$.session.repo().root` (main working tree even from a worktree). If `<root>/.git` is not a directory (submodule, bare), ask `git rev-parse --path-format=absolute --git-common-dir`. Not in git: `<cwd>/.claude/helm/peers/` (no worktrees exist there, so one folder is shared by definition). Inside `.git`, so git ignores it and `git clean` never touches it.

```
peers/sessions/<sessionId>.json     one writer: that session
peers/board/<slug>/task.json        written once by the creator, never rewritten
peers/board/<slug>/claim/owner.json mkdir of claim/ is the claim
peers/board/<slug>/done             written by the owner when finished
```

**Peer record** (≤4 KB, rewritten whole by its owner): `sessionId, pid, cwd, worktree (bool), branch, startedAt, state (idle|working), task (goal, one line, from the deck's task), edited[] (repo-relative, last 20, with ms), claims[] (slugs)`. Sources already exist in `DeckState` (`task, branch, touched, agents`, `types/index.d.ts:13-60`).

**Heartbeat and liveness.** Rewrite the record every **10 s** (every second tick of the existing 5 s `$.clock.every`, `hooks/deck.tsx:166`) and on session start, turn end and first edit of a file. A peer is **live** if the record's `mtimeMs` (from one `$.fs.list` call) is under **30 s** old; **lost** from 30 s to 10 min (shown dim, "lost 2m", never as working); hidden after 10 min; its record is removed by any session after **1 h**. One machine, one clock: no skew handling.

**Atomic claim.** `mkdir peers/board/<slug>/claim` through `$.process.run(['mkdir', path])`: exit 0 = won, non-zero = taken. Then write `claim/owner.json` `{ sessionId, at }`. A claim whose owner record is lost (>30 s) or missing is **stale**: take it over with `mv claim claim.stale-<myId8>-<ms>` (rename is atomic, so only one taker succeeds because the source vanishes) then `mkdir claim` again. Release is `mv claim claim.released-<ms>`. Sessions sweep `claim.stale-*` / `claim.released-*` older than 1 h with `rm -rf`, after checking the path starts with the shared dir. A directory without `owner.json` for under 5 s is "being claimed", not stale. Task creation is `mkdir board/<slug>` then `task.json`; an existing slug is an error, so nothing is ever overwritten.

**Overlap detection.** On `tool.call` for Edit, Write, MultiEdit, NotebookEdit: normalise `file_path` to repo-relative; look through peers (live only) for the path in `edited[]` within **120 s**, or under a claim they hold.
- Same folder (same physical file): **deny once** per (path, peer) with "peer `<name>` edited `<path>` 40 s ago; coordinate or retry". The retry passes. This is where clobbering happens.
- Different worktrees (a future merge conflict, not a clobber): **warn only**, toast plus a deck row.

**To the model.** A static session-scope `prompt.compose` section (same pattern as lean/workload/testing/advisor in `hooks/register.tsx`): peers exist, call `mcp__helm__peers`, claim a unit before starting it. Dynamic data comes through the tool, registered with `$.tool.register` like `hooks/tools.ts`: actions `list`, `add <slug> <text>`, `claim <slug>`, `release <slug>`, `done <slug>`. The tool does the work and returns text, as the other helm tools do, so the model never reads the shared files.

**To the person.** The deck's Agents tab already lists sub agents (`$.agent.list()`, `hooks/deck.tsx:248`). Add a Peers block under them, one row each:
```
● api      working  Fix refund fee rounding     feat/refund  ✎3  4s
● ui       idle     Settings page copy          wt-ui        ✎0  7s
○ docs     lost 2m  Update README               main         ✎1
```

**The three old failures**
1. *Agent files missing in worktrees:* nothing is copied into any worktree; the tool is a plugin tool present in every session, and the state is under the main repo's `.git`.
2. *Task files unreadable outside a worktree:* tasks live in the shared dir and are addressed by slug through the tool, never by relative path.
3. *Relaunch overwriting task copies:* one `task.json` per slug, created by `mkdir`, never rewritten; a relaunch gets its own session record, and a claim stays with its `sessionId` until it goes stale, so a relaunch cannot take or clobber it.

## Phases

1. **Visibility (read-only).** Peer record write + heartbeat, shared-dir resolution, Peers rows in the deck. No tool, no claims, no denies.
   Check: start 3 sessions (2 in worktrees); each deck shows the other two within 10 s; `kill -9` one and its row goes "lost" within 30 s and disappears at 10 min; a lone session shows no Peers block; `make test` passes with unit tests for resolution and liveness math.
2. **Overlap warnings.** `tool.call` check, deny-once and the worktree warn.
   Check: session A edits `x`; session B's first Edit of `x` within 120 s is denied with A's name, its retry succeeds; across worktrees B gets a toast and the edit succeeds.
3. **Claim board.** `mcp__helm__peers` tool, static prompt section, claims, stale takeover, optional `$.session.send` nudge.
   Check: 6 parallel `claim` calls on one slug give exactly 1 success; killing the owner frees the claim for takeover after 30 s; a second `add` of the same slug fails.

## Left to the builder
- Exact poll cadence split (10 s write vs 5 s read) and record field names.
- Deny wording; whether deny-once should become warn-only if it proves noisy.
- Whether to nudge the claimer through `$.session.send` when a peer touches files in its claim (phase 3, optional).
- Row layout in narrow panes.

## Unverified (design should not hinge on these; phase 1 checks them)
- That `$.clock.every` keeps firing during a long tool call, so the heartbeat holds mid-turn.
- That `$.process.run(['mkdir', …])` and `mv` run unprompted in a user's permission setup, and `$.session.repo().root` is set for a worktree opened via `--worktree`/EnterWorktree.
- `$.session.send` delivery into a peer in the same project.
- Whether a `--resume`d session keeps its `sessionId`, which decides if its old claims stay its own.

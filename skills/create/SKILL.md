---
name: create
description: Design and create a helm agent team with the person, a team of job-contract subagents (kind, scope, output, acceptance checks, stop limits, model and effort per member), saved to .claude/teams/ and opened in the team pane. Use when the person asks to create, set up, design or build a team.
argument-hint: "[what the team is for]"
---

# Create a helm team

Help the person design a team of subagents, then save it with the `mcp__helm__save_team` tool. The person's main session is always the team's lead; never add a lead member yourself.

## 1. Understand the job

If `$ARGUMENTS` already says what the team is for, start from it. Ask only what you cannot see for yourself, in one short message:

- What the team will work on (a kind of task, a product area, a repo).
- Any roles they already have in mind, and any they do not want.
- Cost preference: lean (more haiku/sonnet, lower effort) or strong (opus/high where it matters).

Look at the project yourself before asking about it: the languages, frameworks, test setup and folder layout (README, package files, top-level folders). Use what you find to make the briefs concrete: real test commands, real folder names.

## 2. Propose the team

Members are **jobs with contracts, not personas** (evidence: `.dev/member-spec.md` in the helm repo). Expert personas ("senior engineer", "world-class") don't improve accuracy, so write what the member does, what it may touch, what it returns, and how its work is checked.

Propose as few members as the work needs, usually 2–4. Prefer **read** members for parallel work (finding, research, review), **one write** member per area of files, and a **verify** member to check the writer's work. Multi-agent runs cost about 15× the tokens of chat, so add a member only when it brings parallel reads, a separate context, or a different tool set or model.

For each member give:

| field | what to write |
| --- | --- |
| `name` | handle, lowercase: `finder`, `fixer`, `checker` |
| `role` | short label for the pane only (it is not put in the prompt) |
| `emoji` / `color` | one emoji; one of cyan, magenta, green, yellow, blue, red, claude, different per member |
| `kind` | `read` (never edits, may run in parallel), `write` (edits only `scope.write`; one writer per scope), `verify` (checks another member's work, never edits) |
| `model` / `effort` | the cheapest that does the job: haiku/low for search and checks, sonnet/medium for most changes, opus/high only for hard reasoning |
| `purpose` | one functional line: what it does. No persona words |
| `description` | one sentence: when the lead should hand it work |
| `specificity` | `procedural` (code, data, commands: numbered steps after a short plan) or `principled` (open-ended judgement: guidance only) |
| `procedure` | 2–5 steps or principles, with this project's real commands and paths |
| `scope` | `{ "write": [globs] }` for write members (enforced); `{ "write": [] }` for read and verify members |
| `output` | the shape of its result, e.g. `JSON {hits:[{path,lines,why}]}` or `summary + files changed` |
| `acceptance` | yes/no checks: `{ "check": "command", "run": "<real test command>", "maxFailures": <known baseline> }`, `{ "check": "paths_exist" }`, `{ "check": "report" }`, or `{ "check": "criterion", "text": "…" }` for a verify member |
| `stop` | optional limits: `{ "turns": 10, "tokens": 30000, "fixAttempts": 2, "noProgress": 2 }`; defaults are 25 turns, 60k tokens, 2 fix attempts and 2 no-progress turns |
| `boundaries` | 1–3 extra lines it must never do (git commit/push, installs and rm -rf are already denied) |
| `tools` | an explicit list for read and verify members (e.g. `["Read", "Grep", "Glob"]`, plus `Bash` for a verify member that runs tests). An explicit list drops `Agent` |
| `allow` | optional `["commit"]` or `["commit", "push"]`, only if the person wants that member to commit |
| `reportsTo` / `handsTo` | optional chain, as before: `reportsTo` must reach the lead with no loops; `handsTo` names members who exist (e.g. `fixer → checker`) |

The runtime enforces this: an edit outside `scope.write` or a denied command is refused, the member must end with a ```json report naming its exit (accepted, blocked, failed_checks, budget, no_progress, guardrail, error), and the runtime re-runs the `command` and `paths_exist` checks. A member that claims `accepted` but fails a check is marked `failed_checks`.

Give the team a short name (`dev-team`, `docs-squad`). Show the proposal as a compact table (name, kind, model/effort, purpose, write scope, acceptance). Make sure write scopes don't overlap: every file has at most one writer.

Also propose the chain, as an indented list under the table, with `→` for each handoff:

```
- lead
  - techlead → builder, tester
    - builder → tester
    - tester → reviewer
    - reviewer → techlead
```

Check it before showing it: every `reportsTo` reaches the lead, and every `handsTo` names a member who exists (a handoff with no receiver is a mistake). Members may still message each other directly, so the chain sets the order, not a wall.

Optionally ask whether one member should be the **main** member. Untargeted prompts the person types then go to that member, and `@<member>` still goes to any member. The main member must be a member, not the lead. Leave it out to keep the main session handling untargeted prompts.

Ask the person to approve or change it. Apply their changes and show only what changed.

## 3. Save it

Once they approve, call `mcp__helm__save_team` with `name`, `members` and, if chosen, `main` (a member's handle). If it answers with `Contract warnings`, fix them and save again with `overwrite: true`, or show them to the person. If it answers with an `Error:` (an unknown handle in a relation, a self-reference, a `reportsTo` loop, a relation on the lead, or a `main` that is not a member), fix the proposal and call again. If it answers that the team exists, ask whether to replace it, then call again with `overwrite: true`, or pick another name.

Then tell the person in two or three lines: the team is saved and open in the pane, they give it work by typing a task in the chat, and `@<member> …` talks to one member directly.

---
name: prompt
description: Start a new task the helm way - turn the rough request into a complete, checkable prompt (goal, grounded context, constraints, acceptance checks, stop conditions, output), get it approved, and save it as the current task. Use when the person runs /helm:prompt, or says "prompt", "brief", "help me ask", "write the prompt for".
argument-hint: "<rough request>"
---

# Build the prompt first

The person prefers a complete input and a better result over a terse one. Your job here is to write the
prompt, not to do the work. Every step below runs, every time, however clear the request looks.

## 0. Re-anchor the deck
Call `mcp__helm__deck` with `{ "action": "task", "text": "<the request, one line, at most 80 characters>" }`. Do not show its reply.
If `$ARGUMENTS` is empty, ask in one line what the task is, then continue.

## 1. Ground it (cheap, before asking anything)
- Use Grep/Glob for the request's key terms and the names it mentions, and LSP (when available) for what a
  change would touch. Read only the ranges you need.
- Collect: the files and symbols involved (`path:lines`), how this repo tests (`Makefile`, package scripts,
  CI), the conventions you see (commit style, lint rules, CLAUDE.md), and earlier decisions in docs.
- Stop grounding after about 10 tool calls. The goal is a precise prompt, not a solution.

## 2. Find the real gaps
List what you still can't decide from the request plus the code. Ask **only** about things that change the
result, at most 3 questions, in one `AskUserQuestion` with a recommended option first. Don't ask what you can
look up, or what has a conventional default (pick the default and say so in Assumptions).

## 3. Write the prompt
Use this exact shape. The static parts come first; every line has to be specific to this task.

```xml
<goal>One or two sentences: the outcome, and why it matters.</goal>
<context>
  - path:lines: why it's relevant (from step 1)
  - Decisions already made / constraints the person stated
</context>
<task>
  Numbered steps for procedural work (code, data). For judgement work (design, writing), give principles
  instead of steps.
</task>
<constraints>
  Scope: files/dirs that may change; everything else is read-only.
  Don't: the specific things to avoid here (API breaks, new deps, touching X).
  Style: repo conventions that apply.
</constraints>
<acceptance>
  Yes/no checks, deterministic first:
  - [ ] `make test` exits 0 (or: no new failures vs. baseline N)
  - [ ] behaviour check: "running X shows Y"
  - [ ] diff touches only the scope above
</acceptance>
<stop>
  Stop and report, don't guess, when: a check still fails after 2 fix attempts · 2 turns with no new evidence ·
  a needed decision is missing (ask ONE question) · the change needs files outside scope.
</stop>
<output>What to hand back: summary ≤5 lines, files changed with path:lines, commands run and their
  results, open questions.</output>
<assumptions>Defaults you picked without asking, each one line, so the person can veto them.</assumptions>
```

## 3b. Match the acceptance to the testing level
Read the testing level: the file `.claude/helm/testing` if it exists, else call `mcp__helm__testing` with
`{ "action": "status" }`. `off`: acceptance lists only the existing checks the change could break, no new tests.
`light`: add checks for risky logic only. `thorough`: also add edge-case and regression checks, and the full suite.

## 4. Check the prompt before showing it
Fix it, don't just flag it, if any of these is true:
- The goal is vague ("improve", "clean up") with no observable result.
- An acceptance item can't be answered yes/no by running something or reading the diff.
- Scope is missing or is "everything".
- Context cites no `path:lines` for a code task.
- It contains persona text ("You are a senior…"), urgency or flattery. These add nothing.
- It repeats itself, or holds generic advice that would fit any task.

## 4b. Offer to split the work (only when it fits)
First read the workload mode: the file `.claude/helm/workload` if it exists, else call `mcp__helm__workload` with
`{ "action": "status" }`. `off`: skip this step silently, never offer a split. `always`: split every
time, even a single unit going to one cheaper agent, without asking (still pick a model and effort per unit) and
skip the question below. `sometimes`: as follows.

Once the prompt passes step 4, and before showing it, judge whether splitting pays. Offer it when handing units to
a cheaper model or lower effort has a clear cost advantage and each unit can be briefed exactly with its own
check. Small, tightly coupled or judgement-heavy work is not split: skip this step silently, don't ask.

If it fits, ask in one `AskUserQuestion` (recommended option first):
"This is big enough to hand to cheaper-model sub agents. Split it?"
- **Split (Recommended)**: the host stays the planner and reviewer; sub agents on a cheaper model (Haiku or
  Sonnet) do the units.
- **Keep it as one task**: one agent does everything.

On split, add this block after `<acceptance>`, one entry per unit, and keep the whole-task checks there:
```xml
<split>
  Host: plans, hands out units, reviews every result against its check, runs the whole-task acceptance.
  - unit 1 [model · effort], e.g. [haiku · low], [sonnet · medium]: what to do · scope (files) · check (command) · depends on: none
  - unit 2 ...
  The model · effort per unit is what the person approves in step 5, before any dispatch.
  Rules: units never share a file; give each sub agent only its unit, scope and check; a unit that fails its
  check twice comes back to the host, not retried blindly; independent units run in parallel.
  Lean: start every unit brief with "Lean: answer first, no recap, smallest complete change, keep checks and
  exact code, one line on anything skipped." (sub agents don't inherit the host's system prompt). Leave it out
  only if the person turned lean off (`/helm:lean off`).
</split>
```
Pick haiku/low for mechanical edits (rename, move, boilerplate, tests from a spec) and sonnet/medium for units
that read and judge code. If the person declines, write nothing and don't ask again.

## 4c. Ask the advisor about the draft
Read the advisor level: the file `.claude/helm/advisor` if it exists, else call `mcp__helm__advisor` with
`{ "action": "status" }`. `low`: skip this step. `mid` or `high`: if you have the built-in `advisor` tool (no
parameters; not `mcp__helm__advisor`, which only sets the level), call it once on the draft before showing it, and fold its answer into the prompt.

## 5. Get it approved
Show the prompt in one fenced block, then one line: "Approve it, edit it, or change the scope?"
- Approval covers the model and effort per unit in `<split>`, if any.
- If they edit: apply the edits, re-check step 4, and show it again.
- Do not start the work in this step, even if they say "run it": approval comes first, then step 6.

## 6. Save it and stop
On approval call `mcp__helm__set_task` with `{ "prompt": "<the approved prompt, whole>", "goal": "<the goal in one line>" }`.
Then stop and say, in one line, that it is saved and that "go" starts it here: if superpowers is installed,
brainstorming then writing-plans first (otherwise straight from the prompt, as the contract), finishing with
the `<output>` report checked against `<acceptance>`. If the prompt has a `<split>`, "go" dispatches its units
to sub agents (parallel where independent) instead of doing them in the host.

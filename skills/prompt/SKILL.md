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

## 4. Check the prompt before showing it
Fix it, don't just flag it, if any of these is true:
- The goal is vague ("improve", "clean up") with no observable result.
- An acceptance item can't be answered yes/no by running something or reading the diff.
- Scope is missing or is "everything".
- Context cites no `path:lines` for a code task.
- It contains persona text ("You are a senior…"), urgency or flattery. These add nothing.
- It repeats itself, or holds generic advice that would fit any task.

## 5. Get it approved
Show the prompt in one fenced block, then one line: "Approve it, edit it, or change the scope?"
- If they edit: apply the edits, re-check step 4, and show it again.
- Do not start the work in this step, even if they say "run it": approval comes first, then step 6.

## 6. Save it and stop
On approval call `mcp__helm__set_task` with `{ "prompt": "<the approved prompt, whole>", "goal": "<the goal in one line>" }`.
Then stop and say, in one line, that it is saved and that "go" starts it here: if superpowers is installed,
brainstorming then writing-plans first (otherwise straight from the prompt, as the contract), finishing with
the `<output>` report checked against `<acceptance>`.

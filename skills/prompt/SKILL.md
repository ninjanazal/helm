---
name: prompt
description: Turn a rough request into a complete, checkable work prompt before any work starts (goal, grounded context, constraints, acceptance checks, stop conditions, output). Use when the person says "prompt", "brief", "help me ask", "write the prompt for", or starts a non-trivial task with a short or vague request.
---

# Build the prompt first

The person prefers a complete input and a better result over a terse one. Your job here is to write the
prompt, not to do the work. Do the work only after they approve the prompt.

## 1. Ground it (cheap, before asking anything)
- If the `atlas` MCP tools exist, use them: `find` for the request's key terms, `symbol` / `outline` for the
  names it mentions, `neighbors` for what a change would touch. Otherwise use Grep/Glob. Read only the
  returned ranges.
- Collect: the files and symbols involved (`path:lines`), how this repo tests (`Makefile`, package scripts,
  CI), the conventions you see (commit style, lint rules, CLAUDE.md), and earlier decisions in team files or docs.
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

## 5. Hand it over
Show the prompt in one fenced block, then one line: "Run it, edit it, or change the scope?"
- On "run": do the work with that prompt as the contract, and finish with the `<output>` report, checked
  against `<acceptance>`.
- If they edit: apply the edits, re-check step 4, and show it again.
- Save the approved prompt under `.claude/prompts/<yyyy-mm-dd>-<slug>.md` so good prompts can be reused
  and compared later.

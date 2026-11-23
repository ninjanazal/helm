---
name: lean
description: Turn helm's lean mode (fewer output tokens) on or off, set its level, or show it. Lean is on by default. Use when the person runs /helm:lean or says "stop lean", "normal mode", "be lean".
argument-hint: "[on | off | lite | full]"
---

Map `$ARGUMENTS` to one call of the `mcp__helm__lean` tool, then show its reply as is. Do nothing else: no other tools, no commentary.

| `$ARGUMENTS` | Call |
| --- | --- |
| empty | `{ "action": "status" }` |
| `on`, `off`, `lite`, `full` | `{ "action": "<that word>" }` |

Anything else: do not call the tool; reply with one line: `Usage: /helm:lean [on | off | lite | full]`.

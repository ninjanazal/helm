---
name: workload
description: Set how much work helm hands to cheaper sub agents - off, sometimes or always - or show it. Use when the person runs /helm:workload or asks to delegate more or less to cheaper models.
argument-hint: "[off | sometimes | always]"
---

Map `$ARGUMENTS` to one call of the `mcp__helm__workload` tool, then show its reply as is. Do nothing else: no other tools, no commentary.

| `$ARGUMENTS` | Call |
| --- | --- |
| empty | `{ "action": "status" }` |
| `off`, `sometimes`, `always` | `{ "action": "<that word>" }` |

Anything else: do not call the tool; reply with one line: `Usage: /helm:workload [off | sometimes | always]`.

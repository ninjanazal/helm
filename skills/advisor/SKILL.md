---
name: advisor
description: Set how often helm asks the model to consult the advisor while planning - low, mid or high - or show it. Use when the person runs /helm:advisor or asks for more or fewer advisor calls.
argument-hint: "[low | mid | high]"
---

Map `$ARGUMENTS` to one call of the `mcp__helm__advisor` tool, then show its reply as is. Do nothing else: no other tools, no commentary.

| `$ARGUMENTS` | Call |
| --- | --- |
| empty | `{ "action": "status" }` |
| `low`, `mid`, `high` | `{ "action": "<that word>" }` |

Anything else: do not call the tool; reply with one line: `Usage: /helm:advisor [low | mid | high]`.

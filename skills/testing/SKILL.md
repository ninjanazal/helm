---
name: testing
description: Set how much testing helm writes and runs - off, light or thorough - or show it. Use when the person runs /helm:testing or asks for fewer or more tests.
argument-hint: "[off | light | thorough]"
---

Map `$ARGUMENTS` to one call of the `mcp__helm__testing` tool, then show its reply as is. Do nothing else: no other tools, no commentary.

| `$ARGUMENTS` | Call |
| --- | --- |
| empty | `{ "action": "status" }` |
| `off`, `light`, `thorough` | `{ "action": "<that word>" }` |

Anything else: do not call the tool; reply with one line: `Usage: /helm:testing [off | light | thorough]`.

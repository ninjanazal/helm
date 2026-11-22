---
name: atlas
description: Report the state of the atlas code index for this project, or rebuild it. Use when the person runs /helm:atlas or asks whether atlas is indexed, stale or needs a refresh.
argument-hint: "[refresh]"
---

Map `$ARGUMENTS` to one call of the `mcp__helm__atlas` tool, then show its reply as is. Do nothing else: no other tools, no commentary.

| `$ARGUMENTS` | Call |
| --- | --- |
| empty | `{ "action": "status" }` |
| `refresh` | `{ "action": "refresh" }` |

Anything else: do not call the tool; reply with one line: `Usage: /helm:atlas [refresh]`.

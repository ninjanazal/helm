---
name: switch
description: Turn helm on or off for this project (the deck pane and lean mode). Use when the person runs /helm:switch or asks to enable, disable, show or hide helm or its deck.
argument-hint: "[on | off]"
---

Map `$ARGUMENTS` to one call of the `mcp__helm__deck` tool, then show its reply as is. Do nothing else: no other tools, no commentary.

| `$ARGUMENTS` | Call |
| --- | --- |
| empty | `{ "action": "open" }` |
| `on` | `{ "action": "on" }` |
| `off` | `{ "action": "off" }` |

Anything else: do not call the tool; reply with one line: `Usage: /helm:switch [on | off]`.

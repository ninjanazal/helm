---
name: deck
description: Open, turn on or off, re-anchor or reset the helm deck pane (session health, drift, touched files, live feed). Use when the person runs /helm:deck or asks to show, hide, turn on/off or reset the deck.
argument-hint: "[on | off | task <text> | reset]"
---

Map `$ARGUMENTS` to one call of the `mcp__helm__deck` tool, then show its reply as is. Do nothing else: no other tools, no commentary.

| `$ARGUMENTS` | Call |
| --- | --- |
| empty | `{ "action": "open" }` |
| `on` | `{ "action": "on" }` |
| `off` | `{ "action": "off" }` |
| `task <text>` | `{ "action": "task", "text": "<text>" }` |
| `reset` | `{ "action": "reset" }` |

Anything else: do not call the tool; reply with one line: `Usage: /helm:deck [on | off | task <text> | reset]`.

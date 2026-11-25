---
name: help
description: Show the helm guide - the deck pane and every /helm command. Use when the person asks how helm works or for its help.
---

Show the person the guide below as it is, then offer to answer any question about it. Do not call tools.
If no `superpowers:*` skills are in your skill list, add one line after it: "superpowers is not installed: helm works without it; add it with `make setup` in the helm repo (pick superpowers)."

# ⎈ helm

## Commands
| Command | What it does |
| --- | --- |
| `/helm:switch [on \| off]` | Turn helm on or off for this project: the deck pane and lean mode. Off stays off across `/clear` and new sessions. |
| `/helm:prompt <request>` | The one to work with: give it a task. It re-anchors the deck, builds a complete prompt (goal, context, scope, acceptance checks, stop conditions, optional split to cheaper sub agents), and once you approve it saves it as the current task. Say "go" to run it. |
| `/helm:lean [on \| off \| lite \| full]` | Lean mode: the model answers first, skips recaps and writes the smallest complete change, never at the cost of checks or exact code. On by default; `off` (or "stop lean") turns it off; applies from the next session, `/clear` or compaction. A project can pin it in `.claude/helm/lean`. |
| `/helm:testing [off \| light \| thorough]` | How much testing the host writes and runs. `light` (default): tests only for risky logic. `thorough`: test-first, edge cases, a regression test per bug, the full suite before done. `off`: no tests unless asked. Applies from the next session, `/clear` or compaction. A project can pin it in `.claude/helm/testing`. |
| `/helm:workload [off \| sometimes \| always]` | How much work the host hands to cheaper sub agents. `off`: never. `sometimes` (default): a unit goes to a cheaper model or lower effort only where it is clearly cheaper and can be briefed exactly. `always`: every unit (implementation, exploration, tests, docs) goes to a cheaper model or effort than the host (haiku < sonnet < opus, never above the host, always cheaper), while the host plans, reviews and verifies. Non-off modes list model and effort per unit for approval before dispatch. The deck chip shows the measured share, e.g. `25% delegated`. Applies from the next session, `/clear` or compaction. A project can pin it in `.claude/helm/workload`. |
| `/helm:advisor [low \| mid \| high]` | How often the model consults the built-in advisor, with planning as the main trigger. `low`: also on the drafted plan. `mid` (default): plus plan changes and before done. `high`: plus before planning starts, every plan revision and when results do not fit. Applies from the next session, `/clear` or compaction. A project can pin it in `.claude/helm/advisor`. |
| `/helm:commit [--dry]` | Commit the staged changes: `type(scope): subject`, bulleted body, no attribution lines. `--dry` only shows the message. |
| `/helm:help` | This guide. |

## The deck
The session's health beside the chat: the task, a drift meter (time for a fresh session?), a skills section (the skill running now, a suggested next skill with why, the last three used), context and 5h limit bars with the pace to the limit, tokens, cost, cache hits, the files this session touched, and a live feed of tool calls. It animates only while a turn runs.

Drift = 0.4 × context fill + 0.4 × topic shift (new terms vs. the task) + 0.2 × turns/60. At 0.70 it suggests a fresh session.

## The task
The current task lives in `.claude/helm/task.md` (git-ignored). Each approved `/helm:prompt` replaces it, and its goal anchors the deck.

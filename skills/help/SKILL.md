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
| `/helm:prompt <request>` | Start a task: re-anchors the deck, builds a complete prompt (goal, context, scope, acceptance checks, stop conditions), and once you approve it saves it as the current task. Then say "go" to work on it here. |
| `/helm:deck` | Open the deck pane. |
| `/helm:deck on` / `off` | Turn the deck on or off for this project. Off stays off across `/clear` and new sessions. |
| `/helm:deck task <text>` / `reset` | Re-anchor the task (resets drift) / clear the deck. |
| `/helm:commit [--dry]` | Commit the staged changes: `type(scope): subject`, bulleted body, no attribution lines. `--dry` only shows the message. |
| `/helm:help` | This guide. |

## The deck
The session's health beside the chat: the task, a drift meter (time for a fresh session?), context and 5h limit bars with the pace to the limit, tokens, cost, cache hits, the files this session touched, and a live feed of tool calls. It animates only while a turn runs.

Drift = 0.4 × context fill + 0.4 × topic shift (new terms vs. the task) + 0.2 × turns/60. At 0.70 it suggests a fresh session.

## The task
The current task lives in `.claude/helm/task.md` (git-ignored). Each approved `/helm:prompt` replaces it, and its goal anchors the deck.

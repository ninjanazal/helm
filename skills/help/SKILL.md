---
name: help
description: Show the helm guide - the deck pane and every /helm command. Use when the person asks how helm works or for its help.
---

Show the person the guide below as it is, then offer to answer any question about it. Do not call tools.

# ⎈ helm

## Commands
| Command | What it does |
| --- | --- |
| `/helm:prompt <request>` | Start a task: re-anchors the deck, builds a complete prompt (goal, context, scope, acceptance checks, stop conditions), and once you approve it saves it as the current task. Then work on it here, or hand it off. |
| `/helm:agent` | Define an agent for the current task with Claude, save it to `.claude/agents/<name>.md`, and start it in a new herdr pane on the task. |
| `/helm:agent <name>` | Start a saved agent in a new herdr pane on the current task. |
| `/helm:agent list` | Saved agents: name, model, effort, tools, project or user, what it is for. |
| `/helm:deck` | Open the deck pane. |
| `/helm:deck on` / `off` | Turn the deck on or off for this project. Off stays off across `/clear` and new sessions. |
| `/helm:deck task <text>` / `reset` | Re-anchor the task (resets drift) / clear the deck. |
| `/helm:atlas` | Is the code index fresh, stale or missing, and how big. |
| `/helm:atlas refresh` | Rebuild the index. |
| `/helm:help` | This guide. |

## The deck
The session's health beside the chat: the task, a drift meter (time for a fresh session?), context and 5h limit bars with the pace to the limit, tokens, cost, cache hits, tokens saved by atlas, and a live feed of tool calls. It animates only while a turn runs.

Drift = 0.4 × context fill + 0.4 × topic shift (new terms vs. the task) + 0.2 × turns/60. At 0.70 it suggests a fresh session.

## Agents
- The current task lives in `.claude/helm/task.md` (git-ignored). Each approved `/helm:prompt` replaces it.
- An agent pane runs `claude --agent <name>` with `HELM_AGENT=<name>` set: no deck there, and it does not start agents of its own. It reads the task file and starts with superpowers brainstorming when installed.
- Agents need herdr. Without it, `/helm:agent` still saves the definition and `list` works.

## atlas
A local code graph (`.atlas/graph.db`). Its MCP tools `find`, `symbol`, `neighbors` and `outline` answer with `path:lines` instead of whole files. Install with `make atlas` in the helm repo.

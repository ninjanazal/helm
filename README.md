# ⎈ helm

> Steer your Claude Code sessions: see what they cost and when they drift, start every task from a complete prompt, hand it to agents in their own herdr tab, and find code without reading whole files.

helm is a Claude Code plugin plus **atlas**, a local code graph:

- **Deck pane:** the session's health beside the chat. It shows the task, a drift meter (time for a fresh session?), context and 5h limit bars with the pace to the limit, tokens, cost, cache hits, tokens saved by atlas, and a live feed of tool calls. It animates only while a turn runs.
- **`/helm:prompt`:** turns a rough request into a complete, checkable prompt (goal, grounded context, scope, acceptance checks, stop conditions) and saves it as the current task once approved.
- **`/helm:agent`:** hands that task to a saved agent in its own herdr tab, or defines a new agent for it first.
- **atlas** (`atlas/`, Rust): indexes code in 12 languages (GDScript included) plus docs and config into `.atlas/graph.db`. It answers `find`, `symbol`, `neighbors` and `outline` over MCP with `path:lines`, not whole files. No services or models are needed.
- Optional companions: **superpowers** (workflow skills) and **herdr** (agent-aware terminal).

## 📦 Install

```
make local     # this project only: plugin, superpowers, atlas + index
make global    # every project
make doctor    # what is installed, and where
```

Every piece can be installed or removed on its own, per scope: `make <piece>` / `make <piece>-remove` with `SCOPE=local|user` (pieces: `plugin`, `superpowers`, `atlas`, `index`). Then run `/reload-plugins` and `/helm:deck` in Claude Code.

From GitHub, without cloning: `/plugin install helm --marketplace ninjanazal/helm`.

## 🧭 Deck

- `/helm:deck` opens the pane; `/helm:deck on|off` turns it on or off for the project (off survives `/clear` and new sessions); `/helm:deck task <text>` re-anchors the task (and resets drift); `/helm:deck reset` clears it.
- Drift = 0.4 × context fill + 0.4 × topic shift (new terms vs. the task's first prompt) + 0.2 × turns/60. At 0.70 it suggests a fresh session.
- Every number comes from the engine, git or `atlas stats --json`; cost is the engine's own estimate.

## ⌨️ Commands

| Command | What it does |
| --- | --- |
| `/helm:prompt <request>` | Start a task: builds a complete prompt, saves it as the current task once you approve |
| `/helm:agent [list \| <name>]` | Hand the current task to an agent in a new herdr tab named after it; with no name, define and save one first |
| `/helm:deck [on \| off \| task <text> \| reset]` | The deck pane |
| `/helm:atlas [refresh]` | Index state, or rebuild it |
| `/helm:help` | The full guide |

## 🤖 Agents

- Agents are Claude Code agent files: `.claude/agents/<name>.md` (project) or `~/.claude/agents/` (user).
- `/helm:agent <name>` opens a new herdr tab labelled `<name>` (in the background) and runs `claude --agent <name>` there on the task in `.claude/helm/task.md` (git-ignored). The tab gets `HELM_AGENT=<name>`: no deck there, no nested agents.
- Needs [herdr](https://herdr.dev); `/helm:agent list` works without it.

## 🛠️ Developing

```
claude --plugin-dir .       # run it from this folder
make test                   # run the tests (claude plugin test .)
claude plugin validate .    # check it
```

---
name: agent
description: Hand the current approved task to an agent in its own herdr tab, define and save a new agent for it, or list saved agents. Use when the person runs /helm:agent or asks to send the task to another agent or session.
argument-hint: "[list | <name>]"
---

# helm agent

The current task is the prompt approved with `/helm:prompt`, saved in `.claude/helm/task.md`. Agents are Claude Code agent files in `.claude/agents/<name>.md`.

## `/helm:agent list`
Call `mcp__helm__agent_list` and show its reply as is.

## `/helm:agent <name>`
Call `mcp__helm__agent_launch` with `{ "name": "<name>" }` and show its reply as is. Nothing else.

## `/helm:agent` (no argument): define an agent for the task, then hand it off
1. Read `.claude/helm/task.md`. If it is missing or empty, say there is no approved task yet and offer `/helm:prompt <request>`. Stop.
2. Call `mcp__helm__agent_list`. If a saved agent already fits the task, say which and offer `/helm:agent <that name>` as the shorter path; continue only if the person wants a new one.
3. Draft one agent suited to this task:
   - `name`: short, lowercase letters, digits and `-`
   - `description`: one line, what it is for
   - `model` and `effort`: the cheapest that can do the task well (e.g. `sonnet` · `medium` for routine code, `opus` · `high` for design or tricky debugging)
   - `tools`: a list only when it should be restricted (e.g. a reviewer: `Read, Grep, Glob, Bash`); leave out for all tools
   - `instructions`: how this agent works, its boundaries and what it hands back. Specific to its role, not to this one task (the task arrives separately), so it can be reused. No persona text.
4. Show the draft in one block, then ask in one line: "Save it as `<name>`, change something, or rename?"
5. On approval call `mcp__helm__agent_save` with the fields. If the name exists, ask before passing `overwrite: true`.
6. Call `mcp__helm__agent_launch` with the name and show its reply as is. Outside herdr it says so; the agent stays saved for later.

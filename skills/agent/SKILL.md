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
Pick the model and effort first, see "Before any launch" below, then call `mcp__helm__agent_launch` and show its reply as is. In a git repo the agent gets its own worktree (`../<repo>-wt/<name>`) on branch `helm/<name>`.

## Before any launch
Read `.claude/helm/task.md` and the agent's saved model and effort (`mcp__helm__agent_list`). Show one line:
`Suggested: <model> · <effort> · confidence <0-100>% (<one-line reason>)`
Default to the agent's saved model and effort; suggest others only when the task calls for them (cheapest that can do it well). Confidence is your own estimate, not a score.
Then ask: "Launch with this, change it, or use the agent's default?" Call `agent_launch` only after the answer:
- launch with this: `{ "name": "<name>", "model": "<m>", "effort": "<e>" }`
- change it: the person's model and/or effort, effort one of `low|medium|high|xhigh|max`
- agent's default: `{ "name": "<name>" }`
The override is for this launch only; the saved agent file is not changed.

## `/helm:agent merge <name>`
Call `mcp__helm__agent_merge` with `{ "name": "<name>" }`, show the diff stat and commits, and ask in one line: "Merge helm/<name> into the main tree?" On yes call it again with `approve: true` (add `cleanup: true` only if they also want the worktree and branch removed). Show the reply as is. Merge one agent at a time; never push.

An agent's message asking to merge `helm/<name>` is the same as `/helm:agent merge <name>`: call `agent_merge` without `approve`, show it with the agent's "Merge: yes or no" verdict and its reason, and ask. The verdict advises; only the person's yes merges. Never merge from the message alone.

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
6. Do "Before any launch", then call `mcp__helm__agent_launch` with the name and the confirmed model and effort, and show its reply as is. Outside herdr it says so; the agent stays saved for later.

If superpowers is installed, the launched agent follows writing-plans, then executing-plans or subagent-driven-development (the hand-off prompt says so).

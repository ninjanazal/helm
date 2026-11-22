---
name: agent
description: Hand the current approved task to an agent in its own herdr tab, split it across a team of agents and orchestrate them, define and save a new agent for it, or list saved agents. Use when the person runs /helm:agent or asks to send the task to another agent or session.
argument-hint: "[list | <name> | team | stop <name> | merge <name>]"
---

# helm agent

The current task is the prompt approved with `/helm:prompt`, saved in `.claude/helm/task.md`. Agents are Claude Code agent files in `.claude/agents/<name>.md`. Each launch copies the current task to `.claude/helm/tasks/<name>.md` (that copy is the agent's task; later tasks don't change it) and adds the agent to the team (`.claude/helm/team.json`, shown in the deck's TEAM section).

This session is the orchestrator: agents never start or merge other agents. The person approves every launch and every merge.

## `/helm:agent list`
Call `mcp__helm__agent_list` and show its reply as is.

## `/helm:agent <name>`
Pick the model and effort first, see "Before any launch" below, then call `mcp__helm__agent_launch` and show its reply as is. In a git repo the agent gets its own worktree (`../<repo>-wt/<name>`) on branch `helm/<name>`.

## Before any launch
Read the task the agent will get and the agent's saved model and effort (`mcp__helm__agent_list`). Show one line:
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

## `/helm:agent team`: split the task across agents
1. Read `.claude/helm/task.md` (none: offer `/helm:prompt`, stop) and `mcp__helm__agent_list`.
2. Propose 2 to 5 sub-tasks that can run at the same time, in one block. For each: a goal (one line), its scope (the files or folders it may change), the agent (a saved one, or a new one to define), and `model · effort · confidence %` (see "Before any launch"). Sub-tasks that depend on each other go in order, not in parallel: say which waits.
3. Flag every overlap: two sub-tasks whose scopes share a file get `⚠ overlap: <file>`. Merge them or put them in order before you ask.
4. Ask in one line: "Launch this team, change it, or launch fewer?" Launch nothing before the yes.
5. On yes, for each sub-task in turn: `mcp__helm__set_task` with the sub-task's prompt (the parent prompt's constraints, acceptance, stop and output, narrowed to its goal and scope), then `mcp__helm__agent_launch` with its agent, model and effort. New agents are saved first (`agent_save`, after the person approved them in step 4).
6. Afterwards, `set_task` the parent prompt again so it stays current, and call `mcp__helm__team` to show who is running.

## Orchestrating: while agents run
- **Status messages.** Agents send one-line messages: `status: working`, `status: blocked <question>`, `status: done <Merge: yes or no ...>`. On each one, call `mcp__helm__team_status` with the name, status and the question or verdict as `note`.
- **A blocked agent.** If the answer is in the task, the code or what the person already decided, reply to the agent with SendMessage yourself, then mark it `working`. If it is a decision that belongs to the person, ask them in one line naming the agent, then send their answer.
- **Done.** Treat it as the agent asking to merge (below).
- **`/helm:agent team` while a team exists, or "who's running?":** call `mcp__helm__team` and show its reply as is. It marks agents whose tab is gone.
- **`/helm:agent stop <name>`:** only when the person asks. Call `mcp__helm__agent_stop`; the branch and worktree stay for a merge or a new launch.
- **Merge order.** One at a time, in the order agents finish unless the person picks another. If a merge conflicts, send the conflict back to that agent and merge the next one meanwhile.


import type { EngineInterface } from 'claude-code'
import { paneIdFrom, runArgv, tabArgv } from './herdr'
import type { Herdr } from './herdr'

/**
 * /helm:agent: agents are Claude Code agent files (.claude/agents/<name>.md in the project, ~/.claude/agents in
 * the user's home), started in their own herdr tab, labelled with the agent's name, with `claude --agent <name>` on the approved task in
 * .claude/helm/task.md. Everything here goes through `Io`, so it is tested without an engine.
 */

export type AgentSpec = { name: string; description: string; model?: string; effort?: string; tools?: string[]; instructions: string }
export type AgentInfo = AgentSpec & { source: 'project' | 'user'; ok: boolean }
export type Ran = { exitCode: number; stdout: unknown; stderr: unknown }
export type Io = {
  read(path: string): Promise<string>
  /** File names in `dir`; empty when it does not exist. */
  list(dir: string): Promise<string[]>
  write(path: string, text: string): Promise<void>
  run(argv: string[]): Promise<Ran>
}
export type Answer = { text: string; isError: boolean }

export const TASK_FILE = '.claude/helm/task.md'
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const agentsDir = (base: string) => `${base}/.claude/agents`
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

export function agentFile(spec: AgentSpec): string {
  const head = [`name: ${spec.name}`, `description: ${oneLine(spec.description)}`]
  if (spec.model) head.push(`model: ${spec.model}`)
  if (spec.effort) head.push(`effort: ${spec.effort}`)
  if (spec.tools?.length) head.push(`tools: ${spec.tools.join(', ')}`)
  return `---\n${head.join('\n')}\n---\n\n${spec.instructions.trim()}\n`
}

export function parseAgent(md: string, name: string, source: AgentInfo['source']): AgentInfo {
  const bad: AgentInfo = { name, description: '', instructions: '', source, ok: false }
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md)
  if (!m) return bad
  const fm: Record<string, string> = {}
  for (const line of m[1]!.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  if (!fm.description && !fm.name) return bad
  const a: AgentInfo = { name: fm.name || name, description: fm.description ?? '', instructions: m[2]!.replace(/^\r?\n/, '').replace(/\r?\n$/, ''), source, ok: true }
  if (fm.model) a.model = fm.model
  if (fm.effort) a.effort = fm.effort
  if (fm.tools) a.tools = fm.tools.split(',').map(t => t.trim()).filter(Boolean)
  // key order as AgentSpec, for stable equality in tests and output
  const { name: n, description, model, effort, tools, instructions } = a
  return { name: n, description, ...(model ? { model } : {}), ...(effort ? { effort } : {}), ...(tools ? { tools } : {}), instructions, source, ok: true }
}

export function agentLine(a: AgentInfo): string {
  if (!a.ok) return `${a.name} (unreadable frontmatter) · ${a.source}`
  return `${a.name} · ${a.model ?? 'inherit'} · ${a.effort ?? 'default'} · ${a.tools?.length ? a.tools.join(', ') : 'all tools'} · ${a.source} — ${a.description}`
}

async function readDir(io: Io, base: string, source: AgentInfo['source']): Promise<AgentInfo[]> {
  const names = (await io.list(agentsDir(base)).catch(() => [])).filter(f => f.endsWith('.md')).sort()
  const out: AgentInfo[] = []
  for (const f of names) {
    const name = f.slice(0, -3)
    const text = await io.read(`${agentsDir(base)}/${f}`).catch(() => undefined)
    out.push(text === undefined ? { name, description: '', instructions: '', source, ok: false } : parseAgent(text, name, source))
  }
  return out
}

/** Project agents first, then the user's whose name the project does not use. */
export async function listAgents(io: Io, root: string, home: string | undefined): Promise<AgentInfo[]> {
  const project = await readDir(io, root, 'project')
  const user = home ? await readDir(io, home, 'user') : []
  return [...project, ...user.filter(u => !project.some(p => p.name === u.name))]
}

export async function saveAgent(io: Io, root: string, spec: AgentSpec, overwrite: boolean): Promise<Answer> {
  if (!NAME_RE.test(spec.name)) return { text: `Error: "${spec.name}" is not a valid agent name (lowercase letters, digits and -).`, isError: true }
  if (!spec.description.trim() || !spec.instructions.trim()) return { text: 'Error: an agent needs a description and instructions.', isError: true }
  const path = `${agentsDir(root)}/${spec.name}.md`
  if (!overwrite && (await io.read(path).then(() => true, () => false))) return { text: `Error: agent ${spec.name} already exists. Pass overwrite to replace it.`, isError: true }
  await io.write(path, agentFile(spec))
  return { text: `Saved agent ${spec.name} to .claude/agents/${spec.name}.md.`, isError: false }
}

export async function setTask(io: Io, root: string, prompt: string, goal: string): Promise<void> {
  await io.write(`${root}/${TASK_FILE}`, `# ${oneLine(goal)}\n\n${prompt.trim()}\n`)
}

export async function getTask(io: Io, root: string): Promise<string | undefined> {
  const t = await io.read(`${root}/${TASK_FILE}`).catch(() => undefined)
  return t?.trim() ? t : undefined
}

export function handoffPrompt(taskPath = TASK_FILE, branch?: string, name?: string): string {
  const start = `Read ${taskPath}: it is your task, already approved. Start with the superpowers brainstorming skill if it is available, then plan with writing-plans and build with executing-plans or subagent-driven-development.`
  if (!branch || !name) return start
  return `${start} You work on branch ${branch} in your own worktree: commit there, never push, never merge into the main tree. When done, message the session in $HELM_PARENT (if set) asking it to merge ${branch}, with a 3-line summary and your verdict as \"Merge: yes or no\" plus one line why (checks run and their result, scope kept, open questions); otherwise end your report with "run /helm:agent merge ${name}". If told the merge conflicted, merge the main branch into ${branch}, resolve, commit and ask again.`
}

/** Where agent `name` works: a sibling folder of the main tree, on its own branch. */
export function worktreeOf(root: string, name: string): { path: string; branch: string } {
  const i = root.replace(/\/+$/, '').lastIndexOf('/')
  const dir = root.slice(0, i), base = root.slice(i + 1)
  return { path: `${dir}/${base}-wt/${name}`, branch: `helm/${name}` }
}

export type LaunchCtx = { root: string; home?: string; herdr: Herdr | null; agentEnv?: string; parent?: string }

const git = (io: Io, root: string, ...args: string[]) =>
  io.run(['git', '-C', root, ...args]).catch((err: unknown): Ran => ({ exitCode: -1, stdout: '', stderr: String(err) }))
const said = (r: Ran) => String(r.stderr || r.stdout).trim().slice(0, 200)

/** Makes (or finds) the agent's worktree. `undefined` path: not a git repo, work in the main tree. */
async function ensureWorktree(io: Io, root: string, name: string): Promise<{ path?: string; reused?: boolean; error?: string }> {
  if ((await git(io, root, 'rev-parse', '--is-inside-work-tree')).exitCode !== 0) return {}
  const { path, branch } = worktreeOf(root, name)
  const list = await git(io, root, 'worktree', 'list', '--porcelain')
  if (list.exitCode === 0 && String(list.stdout).split('\n').includes(`worktree ${path}`)) return { path, reused: true }
  let add = await git(io, root, 'worktree', 'add', path, '-b', branch)
  if (add.exitCode !== 0) add = await git(io, root, 'worktree', 'add', path, branch)
  return add.exitCode === 0 ? { path } : { error: `Error: could not create the worktree ${path} on ${branch}: ${said(add)}` }
}

/** Opens a herdr tab named after the agent, in its own git worktree, and starts `claude --agent <name>` on the task file. */
export async function launchAgent(io: Io, ctx: LaunchCtx, name: string): Promise<Answer> {
  if (!NAME_RE.test(name)) return { text: `Error: "${name}" is not a valid agent name (lowercase letters, digits and -).`, isError: true }
  if (ctx.agentEnv?.trim()) return { text: `Error: this session is the helm agent ${ctx.agentEnv}; agents do not start other agents.`, isError: true }
  if (!ctx.herdr) return { text: 'Starting an agent needs herdr: run Claude Code inside herdr. Saved agents stay in .claude/agents/.', isError: false }
  if (!(await getTask(io, ctx.root))) return { text: 'There is no approved task yet. Run /helm:prompt <request> first, then /helm:agent.', isError: false }
  const all = await listAgents(io, ctx.root, ctx.home)
  if (!all.some(a => a.name === name && a.ok)) {
    const names = all.filter(a => a.ok).map(a => a.name)
    return { text: `Error: no agent "${name}". ${names.length ? `Agents: ${names.join(', ')}.` : 'No agents saved yet: run /helm:agent to define one.'}`, isError: true }
  }
  const wt = await ensureWorktree(io, ctx.root, name)
  if (wt.error) return { text: wt.error, isError: true }
  const branch = wt.path ? worktreeOf(ctx.root, name).branch : undefined
  const split = await io.run(tabArgv(ctx.herdr, wt.path ?? ctx.root, name, ctx.parent)).catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  const pane = split.exitCode === 0 ? paneIdFrom(String(split.stdout)) : undefined
  if (!pane) return { text: `Error: herdr did not open a tab: ${String(split.stdout || split.stderr).trim().slice(0, 200)}`, isError: true }
  const run = await io.run(runArgv(ctx.herdr, pane, name, handoffPrompt(`${ctx.root}/${TASK_FILE}`, branch, name))).catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  if (run.exitCode !== 0) return { text: `Error: herdr opened tab "${name}" (pane ${pane}) but could not start the agent: ${String(run.stderr || run.stdout).trim().slice(0, 200)}`, isError: true }
  const where = wt.path ? `, worktree ${wt.path} on branch ${branch}${wt.reused ? ' (reused)' : ''}` : ''
  return { text: `Started ${name} in a new tab "${name}" (pane ${pane})${where}.`, isError: false }
}

/**
 * Merges agent `name`'s branch into the main tree's checked-out branch, locally. Without `approve` it only previews.
 * A conflict aborts the merge and keeps the branch. Never pushes.
 */
export async function mergeAgent(io: Io, ctx: { root: string }, name: string, opts: { approve?: boolean; cleanup?: boolean }): Promise<Answer> {
  if (!NAME_RE.test(name)) return { text: `Error: "${name}" is not a valid agent name (lowercase letters, digits and -).`, isError: true }
  const { path, branch } = worktreeOf(ctx.root, name)
  if ((await git(io, ctx.root, 'rev-parse', '--verify', branch)).exitCode !== 0) return { text: `Error: no branch ${branch}: agent "${name}" has no worktree work to merge.`, isError: true }
  if (!opts.approve) {
    const stat = await git(io, ctx.root, 'diff', '--stat', `HEAD...${branch}`)
    const log = await git(io, ctx.root, 'log', '--oneline', `HEAD..${branch}`)
    return { text: `${branch} vs the main tree:\n${String(stat.stdout).trim() || '(no file changes)'}\n\nCommits:\n${String(log.stdout).trim() || '(none)'}\n\nAsk the person to approve; then call agent_merge again with approve: true.`, isError: false }
  }
  const merge = await git(io, ctx.root, 'merge', '--no-ff', branch, '-m', `merge ${branch}`)
  if (merge.exitCode !== 0) {
    const files = String((await git(io, ctx.root, 'diff', '--name-only', '--diff-filter=U')).stdout).trim().split('\n').filter(Boolean)
    await git(io, ctx.root, 'merge', '--abort')
    return { text: `Error: merging ${branch} conflicts in: ${files.join(', ') || said(merge)}. The merge was aborted and ${branch} is untouched. Ask ${name} to merge the main branch into ${branch}, resolve and ask again.`, isError: true }
  }
  if (!opts.cleanup) return { text: `Merged ${branch} into the main tree. Offer to clean up: agent_merge with approve and cleanup removes the worktree and the branch.`, isError: false }
  const rm = await git(io, ctx.root, 'worktree', 'remove', path)
  const del = await git(io, ctx.root, 'branch', '-d', branch)
  return rm.exitCode === 0 && del.exitCode === 0
    ? { text: `Merged ${branch} and removed ${path} and the branch.`, isError: false }
    : { text: `Merged ${branch}, but cleanup failed: ${said(rm.exitCode === 0 ? del : rm)}`, isError: true }
}

/** The engine-backed Io. */
export function engineIo($: EngineInterface): Io {
  return {
    read: p => $.fs.read(p),
    list: d => $.fs.list(d).then(l => l.filter(f => f.kind === 'file').map(f => f.name), () => []),
    write: (p, t) => $.fs.write(p, t) as Promise<void>,
    run: argv => $.process.run(argv, { timeoutMs: 10000 }) as Promise<Ran>,
  }
}

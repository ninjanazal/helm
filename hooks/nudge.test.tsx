import { expect, test } from 'claude-code/testing'
import { atlasNudge, newNudge } from './nudge'

const on = () => newNudge(true)

test('first Grep is denied with the ToolSearch load step', () => {
  const n = on()
  const r = atlasNudge(n, { tool: 'Grep', pattern: 'poll' })
  expect(r).toContain('select:mcp__atlas__find')
  expect(r).toContain('not a user denial')
})

test('only the first search is nudged: the second Grep passes', () => {
  const n = on()
  atlasNudge(n, { tool: 'Grep', pattern: 'a' })
  expect(atlasNudge(n, { tool: 'Grep', pattern: 'b' })).toBe(undefined)
})

test('after any atlas call, Grep passes', () => {
  const n = on()
  expect(atlasNudge(n, { tool: 'mcp__atlas__find', query: 'x' })).toBe(undefined)
  expect(atlasNudge(n, { tool: 'Grep', pattern: 'a' })).toBe(undefined)
})

test('subagent calls are never nudged and do not use up the nudge', () => {
  const n = on()
  expect(atlasNudge(n, { tool: 'Grep', pattern: 'a', agentId: 'x1' })).toBe(undefined)
  expect(atlasNudge(n, { tool: 'Grep', pattern: 'a' })).toContain('mcp__atlas__find')
})

test('no index means no nudge', () => {
  expect(atlasNudge(newNudge(false), { tool: 'Grep', pattern: 'a' })).toBe(undefined)
})

test('Glob and other tools pass', () => {
  const n = on()
  expect(atlasNudge(n, { tool: 'Glob', pattern: '**/*.ts' })).toBe(undefined)
  expect(atlasNudge(n, { tool: 'Read', file_path: '/x' })).toBe(undefined)
  expect(atlasNudge(n, { tool: 'Grep', pattern: 'a' })).toContain('mcp__atlas__find')
})

test('Bash code searches are nudged; grep filtering a pipe is not', () => {
  expect(atlasNudge(on(), { tool: 'Bash', command: 'grep -rn poll hooks' })).toContain('mcp__atlas__find')
  expect(atlasNudge(on(), { tool: 'Bash', command: 'cd /p && rg poll' })).toContain('mcp__atlas__find')
  expect(atlasNudge(on(), { tool: 'Bash', command: 'git grep -n poll' })).toContain('mcp__atlas__find')
  expect(atlasNudge(on(), { tool: 'Bash', command: 'cat f | grep x' })).toBe(undefined)
  expect(atlasNudge(on(), { tool: 'Bash', command: 'ls hooks' })).toBe(undefined)
})

test('input nested under input is read too', () => {
  expect(atlasNudge(on(), { tool: 'Bash', input: { command: 'grep -rn x .' } })).toContain('mcp__atlas__find')
})

test('hook: with an index, the first Grep of a session gets the hint and the next one runs', async ($, on) => {
  on('session.cwd', () => ({ value: '/proj' }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { context: { window: 200000 }, rateLimits: [] } }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('tool.register', () => ({ value: {} }) as never)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
  on('fs.list', (_, e) => ({ value: JSON.stringify(e).includes('.atlas/bin') ? [{ name: 'atlas' }] : [{ name: 'graph.db' }] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.call', () => ({ result: 'ran' }) as never)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const first = (await $.tool.call({ tool: 'Grep', pattern: 'poll' } as never)) as { deny?: string }
  expect(String(first.deny)).toContain('select:mcp__atlas__find')
  const second = (await $.tool.call({ tool: 'Grep', pattern: 'poll' } as never)) as { result?: string; deny?: string }
  expect(second.deny).toBe(undefined)
})

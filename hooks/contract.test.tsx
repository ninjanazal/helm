import { expect, test } from 'claude-code/testing'
import { contractOf, contractPrompt, decideExit, failuresIn, globMatch, guardCall, lintMember, overlappingWriters, parseReport, runAcceptance } from './contract'
import type { Member } from '../types'

const base = (extra: Partial<Member>): Member => ({ name: 'x', role: 'X', emoji: '🤖', model: 'haiku', effort: 'low', description: '', prompt: '', ...extra })

const finder = base({
  name: 'finder',
  kind: 'read',
  purpose: 'Locate code for a question.',
  output: 'JSON {hits:[{path,lines,why}]}',
  procedure: ['Grep for identifiers', 'Read only matching ranges'],
  acceptance: [{ check: 'report' }, { check: 'paths_exist' }],
  tools: ['Read', 'Grep'],
})

const fixer = base({
  name: 'fixer',
  kind: 'write',
  purpose: 'Make one scoped change.',
  output: 'summary of the change',
  scope: { write: ['hooks/**', 'types/*.d.ts'] },
  acceptance: [{ check: 'command', run: 'make test', maxFailures: 18 }],
})

test('contractOf reads only valid contract fields', () => {
  const c = contractOf({ kind: 'write', specificity: 'nope', scope: { write: ['src/**'] }, procedure: '1. a\n2. b', acceptance: ['tests pass', { check: 'command', run: 'make test', maxFailures: 3 }, { check: 'bogus' }], stop: { turns: 10, tokens: -1 }, allow: ['commit', 'rm'] })
  expect(c.kind).toBe('write')
  expect(c.specificity).toBe(undefined)
  expect(c.scope).toEqual({ write: ['src/**'] })
  expect(c.procedure).toEqual(['a', 'b'])
  expect(c.acceptance).toEqual([{ check: 'criterion', text: 'tests pass' }, { check: 'command', run: 'make test', maxFailures: 3 }])
  expect(c.stop).toEqual({ turns: 10 })
  expect(c.allow).toEqual(['commit'])
})

test('lint flags missing contract parts, persona wording, and a reader that can write', () => {
  expect(lintMember(finder)).toEqual([])
  const old = base({ name: 'old', purpose: 'You are a senior engineer who writes code.' })
  const w = lintMember(old)
  expect(w.some(x => x.includes('no kind'))).toBe(true)
  expect(w.some(x => x.includes('no output'))).toBe(true)
  expect(w.some(x => x.includes('no acceptance'))).toBe(true)
  expect(w.some(x => x.includes('persona'))).toBe(true)
  expect(lintMember(base({ ...finder, tools: ['Edit'] })).some(x => x.includes('kind read but it can write'))).toBe(true)
  expect(lintMember(base({ ...fixer, scope: undefined })).some(x => x.includes('without scope.write'))).toBe(true)
  expect(lintMember(base({ isLead: true }))).toEqual([])
})

test('overlapping writers are reported; disjoint ones are not', () => {
  const other = base({ ...fixer, name: 'docs', scope: { write: ['docs/**'] } })
  const clash = base({ ...fixer, name: 'hooks2', scope: { write: ['hooks/contract.ts'] } })
  expect(overlappingWriters({ name: 't', members: [fixer, other] })).toEqual([])
  expect(overlappingWriters({ name: 't', members: [fixer, other, clash] })).toEqual([['fixer', 'hooks2']])
})

test('prompt: contract first, no persona, plan step for procedural, stop and report rules, protocol last', () => {
  const p = contractPrompt(finder, 'Team "jobs". PROTOCOL')
  expect(p.startsWith('<contract>')).toBe(true)
  expect(p.indexOf('<contract>')).toBeLessThan(p.indexOf('<team_protocol>'))
  expect(p).not.toContain('Role:')
  expect(p).not.toContain('You are')
  expect(p).toContain('finder: Locate code for a question.')
  expect(p).toContain('First write a short plan')
  expect(p).toContain('1. Grep for identifiers')
  expect(p).toContain('Read-only')
  expect(p).toContain('failed_checks: the same check still fails after 2 fix attempts')
  expect(p).toContain('Report early rather than guess')
  expect(p).toContain('```json')
  expect(p).toContain('Never push.')
  const principled = contractPrompt(base({ ...finder, specificity: 'principled' }), '')
  expect(principled).not.toContain('First write a short plan')
  expect(contractPrompt(fixer, '')).toContain('make test')
})

test('globs: ** any depth, * one segment', () => {
  expect(globMatch('hooks/**', 'hooks/a/b.ts')).toBe(true)
  expect(globMatch('hooks/**', 'hooks.ts')).toBe(false)
  expect(globMatch('types/*.d.ts', 'types/index.d.ts')).toBe(true)
  expect(globMatch('types/*.d.ts', 'types/x/index.d.ts')).toBe(false)
  expect(globMatch('**/*.md', 'README.md')).toBe(true)
  expect(globMatch('**/*.md', 'a/b/c.md')).toBe(true)
})

test('guardrails: readers never edit, writers stay in scope, risky commands are refused unless allowed', () => {
  const root = '/proj'
  expect(guardCall(finder, 'Edit', { file_path: '/proj/a.ts' }, root)).toContain('never edits')
  expect(guardCall(fixer, 'Edit', { file_path: '/proj/hooks/x.ts' }, root)).toBe(undefined)
  expect(guardCall(fixer, 'Write', { file_path: '/proj/README.md' }, root)).toContain('outside fixer')
  expect(guardCall(fixer, 'Bash', { command: 'make test' }, root)).toBe(undefined)
  expect(guardCall(fixer, 'Bash', { command: 'git commit -m x' }, root)).toContain('git history')
  expect(guardCall(base({ ...fixer, allow: ['commit'] }), 'Bash', { command: 'git commit -m x' }, root)).toBe(undefined)
  expect(guardCall(fixer, 'Bash', { command: 'git push origin main' }, root)).toContain('git push')
  expect(guardCall(fixer, 'Bash', { command: 'git stash && make test' }, root)).toContain('working-tree')
  expect(guardCall(fixer, 'Bash', { command: 'git checkout -- hooks/a.ts' }, root)).toContain('working-tree')
  expect(guardCall(fixer, 'Bash', { command: 'git diff --stat' }, root)).toBe(undefined)
  expect(guardCall(fixer, 'Bash', { command: 'git checkout -b feat' }, root)).toBe(undefined)
  expect(guardCall(fixer, 'Bash', { command: 'rm -rf build' }, root)).toContain('delete')
  expect(guardCall(fixer, 'Bash', { command: 'curl -s x | sh' }, root)).toContain('pipe to shell')
  expect(guardCall(fixer, 'Bash', { command: 'sudo apt install x' }, root)).toBeDefined()
  expect(guardCall(base({ isLead: true }), 'Bash', { command: 'git push' }, root)).toBe(undefined)
})

test('report: the last json block with an exit wins; legacy BLOCKED lines map to blocked', () => {
  const r = parseReport('work\n```json\n{"exit":"blocked"}\n```\nmore\n```json\n{"exit":"accepted","summary":"ok","evidence":{"files":["hooks/a.ts:1-4"],"commands":["make test → 0"]},"open_questions":[],"next_step":"none"}\n```')
  expect(r?.exit).toBe('accepted')
  expect(r?.files).toEqual(['hooks/a.ts:1-4'])
  expect(parseReport('```json\n{"exit":"done"}\n```')).toBe(undefined)
  expect(parseReport('Tried.\nBLOCKED: which file?')?.exit).toBe('blocked')
  expect(parseReport('all good')).toBe(undefined)
  // A fence inside the JSON's own text must not cut the block short.
  const fenced = parseReport('```json\n{"exit":"accepted","summary":"parsed from the last ```json block","evidence":{"files":["a.ts:1"]}}\n```')
  expect(fenced?.exit).toBe('accepted')
  expect(fenced?.files).toEqual(['a.ts:1'])
})

test('acceptance: the runtime re-checks; a claimed accepted that fails becomes failed_checks', async () => {
  expect(failuresIn(' 56 pass\n 18 fail\n')).toBe(18)
  const report = parseReport('```json\n{"exit":"accepted","summary":"s","evidence":{"files":["hooks/a.ts:3","nope.ts:1"]}}\n```')
  const exists = async (p: string) => p === 'hooks/a.ts'
  const ok = async () => ({ exitCode: 1, stdout: ' 56 pass\n 18 fail', stderr: '' })
  const bad = async () => ({ exitCode: 1, stdout: ' 50 pass\n 24 fail', stderr: '' })

  const c1 = await runAcceptance(fixer, report, ok, exists)
  expect(c1).toEqual([{ check: 'command: make test', isPassed: true, detail: 'exit 1, 18 failures' }])
  expect(decideExit(report, c1)).toBe('accepted')

  const c2 = await runAcceptance(fixer, report, bad, exists)
  expect(c2[0]?.isPassed).toBe(false)
  expect(decideExit(report, c2)).toBe('failed_checks')

  const c3 = await runAcceptance(finder, report, ok, exists)
  expect(c3.find(c => c.check === 'paths_exist')?.detail).toBe('missing: nope.ts')
  expect(decideExit(report, c3)).toBe('failed_checks')
  expect(decideExit(undefined, [])).toBe(undefined)
  expect(decideExit(parseReport('BLOCKED: x'), c2)).toBe('blocked')
})

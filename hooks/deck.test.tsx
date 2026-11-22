import { expect, mock, test } from 'claude-code/testing'
import { bar, isDeckOn, deck, drift, driftGauge, layout, len, paceToLimit, parseWorktrees, terms, topicShift, verdict } from './deck-core'
import type { DeckData } from './deck-core'

const data = (x: Partial<DeckData> = {}): DeckData => ({
  task: 'Add GDScript support to atlas', taskAt: 0, turns: 12, model: 'opus-5-5', effort: 'medium', branch: 'main', dirty: 3,
  ctx: { tokens: 118000, window: 200000, percent: 59 }, limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: 3 * 3600 }],
  compactions: 1, cost: 4.8, costStartAt: 0, tokens: { input: 1000, output: 2000, cacheRead: 9000, cacheWrite: 1000 },
  atlas: { files: 24, queries: 14, returned: 1100, avoided: 57000, on: true }, sessionAvoided: 8000, touched: [{ path: 'hooks/deck.tsx', edited: true }, { path: 'hooks/herdr.ts', edited: false }, { path: 'atlas/src/query.rs', edited: false }],
  cur: { seq: 'ffrre', at: 0, tok0: 1000, doing: 'editing', target: 'hooks/deck-core.ts' }, history: [{ n: 11, seq: 'frr', tok: 31000, ms: 60000, result: 'warn', text: '2 whole-file reads' }, { n: 12, seq: 'ffret', tok: 18000, ms: 42000, result: 'ok', text: 'tests passed' }],
  drift: drift(59, 0.5, 12), feed: [{ at: 0, kind: 'find', text: 'find exit', note: 'atlas', tone: 'good' }], running: true, ...x,
})
const text = (secs: ReturnType<typeof deck>) => secs.map(x => [x.title, ...x.body.map(l => l.map(s => s.t).join(''))].join('\n')).join('\n')

test('drift weighs context, topic and turns, and topic shift counts new terms', () => {
  const d = drift(50, 0.5, 30)
  expect(Number(d.score.toFixed(2))).toBe(0.5)
  const task = terms('add gdscript support to atlas')
  expect(topicShift(task, terms('gdscript parser for atlas'))).toBe(1 / 3)
  expect(topicShift(task, new Set())).toBe(0)
})

test('bars: filled, track and threshold cells', () => {
  expect(bar(0.5, 4, 'x').map(s => s.c ?? 'dim').join(',')).toBe('x,subtle')
  expect(bar(0.2, 10, 'x', 0.7).map(s => `${s.c ?? 'dim'}:${s.t.length}`).join(',')).toBe('x:2,subtle:5,warning:1,subtle:2')
})

test('pace: only when the limit would hit before the reset', () => {
  expect(paceToLimit(50, 0, undefined, 3.6e6)).toBe(3.6e6)
  expect(paceToLimit(10, 0, 2 * 3.6e6, 3.6e6)).toBe(undefined)
})

test('deck: every section, fits the width, animates only while running', () => {
  const now = 3.6e6
  const on = deck(data(), 46, 7, now)
  const t = text(on)
  for (const x of ['TASK', 'DRIFT', 'SESSION', 'SAVED BY ATLAS', 'LIVE', 'Add GDScript', '59%', '42%', '$4.80', 'cache 82%', '⟲', 'editing hooks/deck-core.ts', '■ read 2', '■ edit 1', '■ find 2', 'last turns', '#12 ✔ tests passed', '#11 ⚠ 2 whole-file reads', '⎇ main', 'ATLAS', 'hooks/', '├ deck.tsx ✎', '└ herdr.ts', 'atlas/src/']) expect(t).toContain(x)
  for (const sec of on) for (const l of sec.body) expect(len(l)).toBeLessThanOrEqual(46)
  // the session meters' bars line up whatever their values say
  const ses = on.find(x => x.id === 'session')!.body.filter(l => l[0]?.t.trim() === 'context' || l[0]?.t.trim() === '5h')
  expect(new Set(ses.map(l => l.map(x => x.t).join('').indexOf(' ', 9 + 20))).size).toBe(1)
  expect(on.filter(x => x.lit).length).toBe(1)
  const idle = deck(data({ running: false }), 46, 7, now)
  expect(idle.some(x => x.lit)).toBe(false)
  expect(text(idle)).toContain('✔')
  expect(text(idle)).toContain('idle · turn 12 finished')
  expect(text(deck(data({ drift: drift(95, 1, 60) }), 46, 0, now))).toContain('start a fresh session')
  expect(text(deck(data({ atlas: undefined }), 46, 0, now))).not.toContain('SAVED')
  // unknown figures are hidden, not shown as zero
  const fresh = text(deck(data({ tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, task: undefined }), 46, 0, now))
  expect(fresh).not.toContain('tokens 0')
  expect(fresh).toContain('your next prompt becomes the task')
})

test('atlas state: stale shows the changed count, fresh the index size', () => {
  const t = (a: Partial<NonNullable<DeckData['atlas']>>) => text(deck(data({ atlas: { files: 24, queries: 1, returned: 1, avoided: 1, on: true, ...a } }), 46, 0, 1))
  expect(t({ state: 'stale', pending: 6, changed: 4, added: 2 })).toContain('NEEDS REFRESH')
  expect(t({ state: 'stale', pending: 6, changed: 4, added: 2 })).toContain('4 changed · 2 new')
  expect(t({ state: 'stale', pending: 6 })).toContain('make index')
  expect(t({ state: 'fresh' })).toContain('up to date · 24 files')
  expect(t({ state: 'missing' })).toContain('NO INDEX')
  const cov = t({ state: 'fresh', lines: 9090, symbols: 384, db_bytes: 1904640, code_files: 16, code_with_symbols: 16, calls: 5441, resolved: 1573, langs: [['tsx', 6], ['rust', 6], ['doc', 6]] })
  for (const x of ['9.1k lines', '1.8 MB', 'parsed', '100% 16/16', 'linked', '29% of calls', 'langs', '■ tsx 6']) expect(cov).toContain(x)
})

test('open layout: lower-case titles with a rule; the light sweeps only while running', () => {
  const secs = deck(data(), 44, 7, 3.6e6)
  const on = layout(secs, 46, 7, true).map(l => l.map(s => s.t).join(''))
  expect(on[0]!.startsWith('◆ task ─')).toBe(true)
  expect(on.some(l => l.includes('━'))).toBe(true)
  for (const l of on) expect([...l].length).toBeLessThanOrEqual(46)
  const off = layout(secs, 46, 7, false).map(l => l.map(s => s.t).join(''))
  expect(off.some(l => l.includes('━'))).toBe(false)
  // one section carries the pulsing dot while running, none when idle
  expect(on.filter(l => /^[●○] /.test(l)).length).toBe(1)
  expect(off.filter(l => /^[●○] /.test(l)).length).toBe(0)
})

test('verdict: tests decide, then whole-file reads, untested edits, no tools', () => {
  const c = (x: object) => ({ seq: 'r', at: 0, tok0: 0, whole: 0, edits: 0, ...x })
  expect(verdict(c({ tests: false })).result).toBe('err')
  expect(verdict(c({ tests: true, whole: 2 })).text).toBe('tests passed')
  expect(verdict(c({ whole: 2 })).text).toBe('2 whole-file reads')
  expect(verdict(c({ edits: 1 })).text).toBe('edited, not tested')
  expect(verdict(c({ seq: '' })).result).toBe('none')
  expect(verdict(c({})).text).toBe('done')
})

test('drift gauge: fill coloured by zone, a word for the zone, a scale under it', () => {
  const [bar, scale] = driftGauge(0.6, 46)
  const tones = bar!.filter(x => x.t.includes('▆')).map(x => x.c)
  expect(tones).toEqual(['success', 'warning', 'subtle'])
  expect(bar!.map(x => x.t).join('')).toContain('0.60 drifting')
  expect(scale!.map(x => x.t).join('')).toContain('on task')
  expect(scale!.map(x => x.t).join('')).toContain('│fresh')
  expect(driftGauge(0.8, 46)[0]!.map(x => x.t).join('')).toContain('start fresh')
})

// The deck's open is fire-and-forget: let it land before counting.
const settle = () => new Promise<void>(r => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => unknown }).setTimeout(r, 50))

test('/clear (session.end, reason clear, no session.start after it) reopens the deck', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_, e) => { opened.push((e as { id: string }).id); return { value: { isPlaced: true } } })
  on('clock.every', () => ({ value: undefined }))
  on('session.end', () => ({ sessionId: 's1' }))
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  expect(opened).toContain('helm-deck')
  await settle()
  const n = opened.length
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's2', resume: { id: 's2' } } as never)
  await settle()
  expect(opened.length).toBe(n)
})

test('deck: a fresh session with atlas stats but no touched files yet still draws', () => {
  // Atlas answers within a second of launch, before any Read or Edit sets touched: this threw and left the pane blank.
  const t = text(deck(data({ touched: undefined, history: undefined, cur: undefined, feed: [], turns: 0 }), 46, 0, 3.6e6))
  expect(t).toContain('ATLAS')
})

test('deck on/off: stored off wins, agent sessions never open', () => {
  expect(isDeckOn(undefined, undefined)).toBe(true)
  expect(isDeckOn(false, undefined)).toBe(false)
  expect(isDeckOn(true, 'reviewer')).toBe(false)
  expect(isDeckOn(true, '')).toBe(true)
})

function stubDeck(on: Parameters<Parameters<typeof test>[1]>[1], stored: Record<string, unknown>, env: Record<string, string> = {}) {
  const opened: string[] = []
  const closed: string[] = []
  const clock = mock.clock(on, { now: Date.UTC(2026, 10, 22, 10, 0) })
  on('session.cwd', () => ({ value: '/proj' }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('session.usage', () => ({ value: { context: { window: 200000 }, rateLimits: [] } }) as never)
  on('env.get', (_, e) => ({ value: Object.entries(env).find(([k]) => JSON.stringify(e).includes(k))?.[1] }) as never)
  on('store.get', (_, e) => ({ value: stored[(e as { key: string }).key] }))
  on('store.set', (_, e) => { stored[(e as { key: string }).key] = (e as { value: unknown }).value; return { value: undefined } })
  on('tool.register', () => ({ value: {} }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
  on('fs.list', () => ({ value: [] }))
  on('ui.open', (_, e) => { opened.push((e as { id: string }).id); return { value: { isPlaced: true } } })
  on('ui.close', (_, e) => { closed.push((e as { id: string }).id); return { value: undefined } as never })
  return { opened, closed, clock }
}
const said = (r: unknown) => String((r as { result?: string; deny?: string }).result ?? (r as { deny?: string }).deny)
const deckTool = ($: Parameters<Parameters<typeof test>[1]>[0], args: Record<string, unknown>) => $.tool.call({ tool: 'mcp__helm__deck', ...args } as never)

test('deck tool: off closes and stays off across /clear and a new session; on reopens', async ($, on) => {
  const stored: Record<string, unknown> = {}
  const { opened, closed, clock } = stubDeck(on, stored)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await clock.advance(3000)
  expect(opened).toContain('helm-deck')

  expect(said(await deckTool($, { action: 'off' }))).toBe('Deck off.')
  expect(closed).toContain('helm-deck')
  expect(stored['deckOn:/proj']).toBe(false)
  opened.length = 0
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  await clock.advance(6000)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await clock.advance(3000)
  expect(opened).toEqual([])

  expect(said(await deckTool($, { action: 'on' }))).toBe('Deck on.')
  expect(stored['deckOn:/proj']).toBe(true)
  expect(opened).toContain('helm-deck')
  expect(said(await deckTool($, { action: 'task', text: 'ship it' }))).toBe('Deck task set: ship it')
  expect(said(await deckTool($, { action: 'reset' }))).toBe('Deck reset.')
  expect(said(await deckTool($, { action: 'open' }))).toBe('Deck opened.')
})

test('deck never opens in an agent session started by helm:agent', async ($, on) => {
  const { opened, clock } = stubDeck(on, {}, { HELM_AGENT: 'reviewer' })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await clock.advance(3000)
  expect(opened).toEqual([])
})

test('worktrees: helm agents are the helm/* branches in other folders; the main tree and other branches are skipped', () => {
  const out = 'worktree /p\nHEAD a1\nbranch refs/heads/main\n\nworktree /p-wt/reviewer\nHEAD b2\nbranch refs/heads/helm/reviewer\n\nworktree /p-wt/spike\nHEAD c3\nbranch refs/heads/feature/x\n\nworktree /p-wt/gone\nHEAD d4\ndetached\n'
  expect(parseWorktrees(out)).toEqual([{ name: 'reviewer', path: '/p-wt/reviewer', branch: 'helm/reviewer' }])
  expect(parseWorktrees('')).toEqual([])
})

test('deck: an AGENTS section lists each agent branch with its commits ahead and uncommitted files; none, no section', () => {
  const t = text(deck(data({ agents: [{ name: 'reviewer', branch: 'helm/reviewer', ahead: 3, dirty: 2 }, { name: 'scout', branch: 'helm/scout', ahead: 0, dirty: 0 }] }), 46, 0, 3.6e6))
  for (const x of ['AGENTS', 'reviewer', '⎇ helm/reviewer', '+3', '±2', 'scout']) expect(t).toContain(x)
  expect(text(deck(data(), 46, 0, 3.6e6))).not.toContain('AGENTS')
  expect(text(deck(data({ agents: [] }), 46, 0, 3.6e6))).not.toContain('AGENTS')
  for (const sec of deck(data({ agents: [{ name: 'a-very-long-agent-name-indeed', branch: 'helm/a-very-long-agent-name-indeed', ahead: 12, dirty: 30 }] }), 46, 0, 3.6e6)) for (const l of sec.body) expect(len(l)).toBeLessThanOrEqual(46)
})

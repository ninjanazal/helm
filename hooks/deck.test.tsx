import { expect, mock, test } from 'claude-code/testing'
import { addSkill, skillCommand, suggestSkill, keepLimits, FIVE_CHART_MIN, FIVE_CHART_SPREAD, fmtDur, addCtx, addFive, agentDone, agentStep, agentTag, applyStep, applyTodo, bar, brailleLine, isDeckOn, deck, pipeline, toolPhase, live, marquee, drift, driftGauge, layout, len, paceToLimit, terms, topicShift, verdict } from './deck-core'
import type { DeckData, FiveSample } from './deck-core'

const data = (x: Partial<DeckData> = {}): DeckData => ({
  task: 'Add GDScript support to the parser', taskAt: 0, turns: 12, model: 'opus-5-5', effort: 'medium', branch: 'main', changes: { files: 3, added: 40, removed: 7 },
  ctx: { tokens: 118000, window: 200000, percent: 59 }, limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: 3 * 3600 }],
  compactions: 1, cost: 4.8, tokens: { input: 1000, output: 2000, cacheRead: 9000, cacheWrite: 1000 },
  touched: [{ path: 'hooks/deck.tsx', edited: true }, { path: 'hooks/tools.ts', edited: false }, { path: 'src/parser/query.rs', edited: false }],
  cur: { seq: 'ffrre', at: 0, tok0: 1000, doing: 'editing', target: 'hooks/deck-core.ts' }, history: [{ n: 11, seq: 'frr', tok: 31000, ms: 60000, result: 'warn', text: '2 whole-file reads' }, { n: 12, seq: 'ffret', tok: 18000, ms: 42000, result: 'ok', text: 'tests passed' }],
  drift: drift(59, 0.5, 12), feed: [{ at: 0, kind: 'find', text: 'grep exit', tone: 'dim' }], running: true, ...x,
})
const agent = (id: string, x: object = {}) => ({ id, task: `audit part ${id}`, type: 'Explore', model: 'haiku-5-5', tokens: 12_300, steps: 4, startedAt: 3.6e6 - 65_000, ...x })
const five = (done = 0) => Array.from({ length: 5 }, (_, i) => ({ text: `check ${i + 1}`, state: (i < done ? 'done' : 'todo') as 'done' | 'todo' }))
const HIST = [{ n: 6, seq: 'r', tok: 2000, ms: 8000, result: 'ok' as const, text: 'done', ask: 'what can we add', cost: 0.04 }, { n: 7, seq: 'e', tok: 14000, ms: 52000, result: 'ok' as const, text: 'done', ask: 'fix the colours to match the mock I picked', cost: 0.31 }]
const text = (secs: ReturnType<typeof deck>) => secs.map(x => [x.title, ...x.body.map(l => l.map(s => s.t).join(''))].join('\n')).join('\n')

test('drift weighs context, topic and turns, and topic shift counts new terms', () => {
  const d = drift(50, 0.5, 30)
  expect(Number(d.score.toFixed(2))).toBe(0.5)
  const task = terms('add gdscript support to the parser')
  expect(topicShift(task, terms('gdscript grammar for the parser'))).toBe(1 / 3)
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
  for (const x of ['Add GDScript', 'FOCUS', 'USAGE', '59%', '42%', '$4.80', '⟲', '⎇ main', 'opus-5-5', 'medium', '12 turns', '1h 00m', '✎ 1 edited']) expect(t).toContain(x)
  expect(t).not.toContain('cache')
  expect(t).not.toContain('■')
  // no live activity section, and no pace or forecast lines
  expect(on.some(x => x.id === 'now')).toBe(false)
  for (const x of ['at this pace', 'full in']) expect(t).not.toContain(x)
  for (const sec of on) for (const l of sec.body) expect(len(l)).toBeLessThanOrEqual(46)
  // the usage meters' bars line up whatever their values say
  const wk0 = deck(data({ limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: 3 * 3600 }, { kind: 'seven_day', percentUsed: 23, resetsAt: 5 * 3600 }] }), 46, 7, now)
  const ses = wk0.find(x => x.id === 'usage')!.body.filter(l => l[0]?.t.trim() === 'context' || l[0]?.t.trim() === 'week')
  expect(ses.length).toBe(2)
  expect(new Set(ses.map(l => l.map(x => x.t).join('').indexOf(' ', 9 + 20))).size).toBe(1)
  // the task section has a tab; a section is live only while work flows in it and a turn runs
  expect(on[0]!.id).toBe('head')
  expect(on[0]!.title).toBe('▣ TASK')
  expect(on.filter(x => x.live).map(x => x.id)).toEqual([])
  const work = deck(data({ agents: [agent('a')], todos: [{ text: 'x', state: 'working' }] }), 46, 7, now)
  expect(work.filter(x => x.live).map(x => x.id)).toEqual(['agents', 'todo'])
  const idle = deck(data({ running: false, agents: [agent('a')], todos: [{ text: 'x', state: 'working' }] }), 46, 7, now)
  expect(idle.some(x => x.live)).toBe(false)
  expect(text(idle)).toContain('✔')
  expect(text(deck(data({ drift: drift(95, 1, 60) }), 46, 0, now))).toContain('start a fresh session')
  expect(text(deck(data({ touched: undefined }), 46, 0, now))).not.toContain('edited')
  // unknown figures are hidden, not shown as zero
  const fresh = text(deck(data({ tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, task: undefined }), 46, 0, now))
  expect(fresh).not.toContain('tokens 0')
  expect(fresh).toContain('your next prompt becomes the task')
  // tokens: in = input + cache writes, out = output; no $/h rate
  expect(t).toContain('$4.80  ·  ↓ 2.0k in  ·  ↑ 2.0k out')
  expect(t).toMatch(/^ +\$4\.80  ·  ↓ 2\.0k in/m)
  expect(t).not.toContain('/h')
  expect(t).not.toContain('rate ')
  const big = text(deck(data({ tokens: { input: 1000, output: 2000, cacheRead: 1_400_000, cacheWrite: 1000 } }), 46, 0, now))
  expect(big).not.toContain('1.4M')
  // a weekly limit gets its own meter and reset countdown
  const wk = text(deck(data({ limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: 3 * 3600 }, { kind: 'seven_day', percentUsed: 23, resetsAt: 5 * 3600 }] }), 46, 0, now))
  expect(wk).toContain('23% ↻4h 00m')
  expect(fmtDur((145 * 60 + 17) * 60_000)).toBe('6d 1h')
})

test('task: goal, now, model / effort / lean chips, then the facts wrapped without cutting an item', () => {
  const [top, ...rest] = deck(data(), 30, 0, 3.6e6)[0]!.body.map(l => l.map(s => s.t).join(''))
  expect(top).toContain('Add GDScript')
  expect(rest.join('|')).toBe('     opus-5-5  ▰▰▱▱ medium||1h 00m · 12 turns · ⎇ main|3 files +40 −7|✎ 1 edited 2 read')
  // the live state is not repeated in the task section
  const busy = deck(data({ running: true, phase: { kind: 'tool', verb: 'editing', target: 'hooks/deck.tsx' } }), 40, 0, 3.6e6)[0]!.body.map(l => l.map(s => s.t).join(''))
  expect(busy.join('|')).not.toMatch(/editing|idle|writing/)
  // the model chip is a fill in a theme colour
  expect(deck(data(), 40, 0, 3.6e6)[0]!.body[1]![1]).toMatchObject({ t: ' opus-5-5 ', bg: 'claude' })
})

test('focus: the task keywords, and why it drifts only once it does', () => {
  const rows = (x: object, w = 60) => deck(data(x), w, 0, 3.6e6).find(s => s.id === 'focus')!.body.map(l => l.map(s => s.t).join(''))
  const base = { taskTerms: ['gdscript', 'deck', 'tool', 'chart', 'extra'], recent: [['deck', 'invoice', 'billing']], turns: 9 }
  expect(rows({ ...base, drift: drift(10, 0, 2) })[1]).toContain('Add GDScript support to the parser')
  expect(rows({ ...base, drift: drift(10, 0, 2) })[2]).toContain('editing hooks/deck-core.ts')
  expect(rows({ ...base, drift: drift(10, 0, 2) })).toHaveLength(3)
  expect(rows({ ...base, drift: drift(95, 0.5, 2) }).slice(3).join(' ')).toBe('Drifting: the context is 95% full; recent prompts are about invoice, billing, not the task.')
  expect(rows({ ...base, drift: drift(50, 1, 2) }).slice(3).join(' ')).toBe('Drifting: recent prompts are about invoice, billing, not the task; the context is 50% full.')
  expect(rows({ ...base, drift: drift(30, 0.6, 60) }).slice(3).join(' ')).toBe('Drifting: 9 turns on this task; recent prompts are about invoice, billing, not the task; the context is 30% full.')
  // no task yet: no focus line
  expect(rows({ taskTerms: [], task: undefined, cur: undefined, drift: drift(10, 0, 2) })).toHaveLength(1)
})

test('marquee: fits as is; too long scrolls while running, is cut with … when idle', () => {
  expect(marquee('short', 10, 3, true)).toBe('short')
  expect(marquee('a long goal that does not fit', 10, 0, false)).toBe('a long go…')
  const a = marquee('a long goal that does not fit', 10, 0, true), b = marquee('a long goal that does not fit', 10, 4, true)
  expect([...a].length).toBe(10)
  expect(a).not.toBe(b)
  expect(marquee('a long goal that does not fit', 10, 4, false)).toBe(marquee('a long goal that does not fit', 10, 0, false))
})

test('live: a tab, then a timeline (age │ what), running agents first, the feed newest first; nothing to list or short → []', () => {
  const feed = [{ at: 0, kind: 'read' as const, text: 'deck.tsx' }, { at: 60_000, kind: 'edit' as const, text: 'deck-core.ts', tone: 'good' as const }]
  const ls = live({ feed, agents: [agent('a')], running: true }, 40, 10, 0, 120_000).map(l => l.map(s => s.t).join(''))
  expect(ls[0]).toContain('● live')
  expect(ls[1]).toMatch(/^  now │ ⌁ /)
  expect(ls[2]).toMatch(/^ +1m │ ✎ deck-core\.ts/)
  expect(ls[3]).toMatch(/^ +2m │ ≡ deck\.tsx/)
  for (const l of ls) expect([...l].length).toBeLessThanOrEqual(40)
  expect(live({ feed, running: true }, 40, 4, 0, 0).length).toBe(4)
  expect(live({ feed, running: true }, 40, 2, 0, 0)).toEqual([])
  expect(live({ feed: [], running: true }, 40, 10, 0, 0)).toEqual([])
})

test('deck: fits 24, 40 and 80 columns with 0 or 2 agents; empty sections are absent; no checks section', () => {
  for (const w of [24, 40, 80]) for (const na of [0, 2]) {
    const d = data({ agents: [agent('a'), agent('b', { endedAt: 3.6e6 - 5000 })].slice(0, na), drift: drift(95, 1, 60), todos: five(1), history: HIST, ctxSeries: [20, 30, 45, 59], fiveSeries: [0, 10, 20, 30, 42].map((pct, i) => ({ at: i * 60_000, pct })) })
    const secs = deck(d, w, 3, 3.6e6)
    for (const l of layout(secs, w, 3, true)) expect(len(l)).toBeLessThanOrEqual(w)
    expect(secs.some(x => x.id === 'agents')).toBe(na > 0)
    expect(secs.some(x => x.id === 'checks')).toBe(false)
    expect(secs.some(x => x.id === 'now')).toBe(false)
  }
})

test('agents: one compact row each, running first; the title counts running agents and all their tokens', () => {
  const secs = deck(data({ agents: [agent('b', { endedAt: 3.6e6 - 5000 }), agent('a')] }), 60, 0, 3.6e6)
  const ag = secs.find(x => x.id === 'agents')!
  expect(ag.title).toBe('⌁ AGENTS')
  expect(ag.meta).toBe('1 running · 25k')
  const rows = ag.body.map(l => l.map(s => s.t).join(''))
  expect(rows.length).toBe(2)
  expect(rows[0]).toMatch(/^⠋ audit part a · Explore · haiku-5-5 · 12k 1m$/)
  expect(rows[1]).toBe('✔ audit part b · Explore · haiku-5-5 · 12k')
  expect(ag.body[1]![3]!.d).toBe(true)
})

test('agentTag: general-purpose reads general, other types unchanged, none is empty', () => {
  expect(agentTag('general-purpose')).toBe('general')
  expect(agentTag('Explore')).toBe('Explore')
  expect(agentTag(undefined)).toBe('')
})

const doneRow = (x: object) => deck(data({ agents: [{ id: 'a', task: 'Rebase root', type: 'general-purpose', model: 'sonnet-5-5', tokens: 40000, steps: 1, startedAt: 0, endedAt: 1, ...x }] }), 60, 0, 3.6e6)
  .find(s => s.id === 'agents')!.body[0]!.map(s => s.t).join('')

test('agent row: task first, then the tag, then model·effort', () => {
  const row = doneRow({ effort: 'medium' })
  expect(row.indexOf('Rebase root')).toBeLessThan(row.indexOf('general'))
  expect(row).toContain('sonnet-5-5·medium')
})

test('agent row: without effort the model is followed by a spaced dot', () => {
  const row = doneRow({})
  expect(row).toContain('sonnet-5-5 · 40')
  expect(row).not.toContain('sonnet-5-5·')
})

test('applyStep: effort is stored on the agent, and a step without effort keeps it', () => {
  const u = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  let s = { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } } as { tokens: DeckData['tokens']; agents?: DeckData['agents'] }
  s = applyStep(s, { agentId: 'a1', model: 'claude-haiku-5-5', effort: 'high' }, u, 0, { task: 'audit hooks', type: 'Explore' })
  expect(s.agents![0]!.effort).toBe('high')
  s = applyStep(s, { agentId: 'a1', model: 'claude-haiku-5-5' }, u, 10)
  expect(s.agents![0]!.effort).toBe('high')
})

test('idle frames are static, and every colour is a theme name', () => {
  const d = data({ running: false, agents: [agent('a')], todos: five(2) })
  const draw = (f: number) => JSON.stringify(layout(deck(d, 46, f, 3.6e6), 48, f, false))
  expect(draw(1)).toBe(draw(9))
  const THEME = new Set(['claude', 'success', 'error', 'warning', 'suggestion', 'subtle'])
  for (const run of [true, false]) {
    const lines = layout(deck(data({ running: run, agents: [agent('a')], drift: drift(95, 1, 60), todos: [...five(1), { text: 'w', state: 'working' }], history: HIST }), 46, 4, 3.6e6), 48, 4, run)
    for (const l of lines) for (const s of l) {
      if (s.c !== undefined) expect(THEME.has(s.c)).toBe(true)
      expect('inv' in s).toBe(false)
    }
  }
})

test('sub-agent steps add up on their own card; at most 6 agents are kept', () => {
  let list = agentStep([], 'a1', { model: 'claude-haiku-5-5', tokens: 160, now: 1000, task: 'audit hooks', type: 'Explore' })
  list = agentStep(list, 'a1', { model: 'claude-haiku-5-5', tokens: 160, now: 2000 })
  list = agentStep(list, 'a2', { model: 'claude-sonnet-5-5', tokens: 40, now: 3000 })
  list = agentDone(list, 'a1', 9000)
  expect(list).toEqual([
    { id: 'a1', task: 'audit hooks', type: 'Explore', model: 'haiku-5-5', tokens: 320, steps: 2, startedAt: 1000, endedAt: 9000 },
    { id: 'a2', task: '', type: undefined, model: 'sonnet-5-5', tokens: 40, steps: 1, startedAt: 3000 },
  ])
  let many: ReturnType<typeof agentStep> = []
  for (let i = 0; i < 9; i++) many = agentStep(many, `x${i}`, { model: 'm', tokens: 1, now: i })
  expect(many.map(a => a.id)).toEqual(['x3', 'x4', 'x5', 'x6', 'x7', 'x8'])
})

test('a step is routed: sub-agent tokens go to the agent card, the main total counts only the main loop', () => {
  const u = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 9000, cache_creation_input_tokens: 10 }
  let s = { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } } as { tokens: DeckData['tokens']; agents?: DeckData['agents']; model?: string; effort?: string }
  s = applyStep(s, { model: 'claude-opus-5-5', effort: 'high' }, u, 0)
  s = applyStep(s, { agentId: 'a1', model: 'claude-haiku-5-5' }, u, 10, { task: 'audit hooks', type: 'Explore' })
  s = applyStep(s, { agentId: 'a1', model: 'claude-haiku-5-5' }, u, 20)
  expect(s.tokens).toEqual({ input: 100, output: 50, cacheRead: 9000, cacheWrite: 10 })
  expect(s.model).toBe('opus-5-5')
  expect(s.effort).toBe('high')
  expect(s.agents).toEqual([{ id: 'a1', task: 'audit hooks', type: 'Explore', model: 'haiku-5-5', tokens: 320, steps: 2, startedAt: 10 }])
})

test('workload chip shows the measured delegated share', () => {
  const txt = (o: Partial<DeckData>) => deck(data({ workload: 'always', ...o }), 80, 0, 3.6e6)[0]!.body.map(l => l.map(s => s.t).join('')).join('\n')
  expect(txt({})).not.toContain('delegated')
  expect(txt({ delegated: 0 })).not.toContain('delegated')
  expect(txt({ tokens: { input: 200, output: 100, cacheRead: 0, cacheWrite: 0 }, delegated: 100 })).toContain('25% delegated')
  expect(txt({ tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, delegated: 100 })).toContain('100% delegated')
  expect(txt({ tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, delegated: 0 })).not.toContain('NaN')
})

test('delegated sums every sub-agent step even after old cards are dropped', () => {
  const u = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  let s = { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } } as { tokens: DeckData['tokens']; agents?: DeckData['agents']; delegated?: number }
  for (let i = 0; i < 8; i++) s = applyStep(s, { agentId: `g${i}`, model: 'claude-haiku-5-5' }, u, i)
  expect(s.delegated).toBe(120)
  expect(s.agents!.length).toBe(6)
})

test('tab layout: lower-case filled title tabs with a rule; the light sweeps only while running', () => {
  const secs = deck(data({ agents: [agent('a')] }), 44, 7, 3.6e6)
  const on = layout(secs, 46, 7, true).map(l => l.map(s => s.t).join(''))
  expect(on.some(l => l.startsWith(' ◇ focus  ─'))).toBe(true)
  expect(on.some(l => l.startsWith(' ⌁ agents  1 running · 12k ─'))).toBe(true)
  expect(on.some(l => l.includes('/helm:'))).toBe(false)
  for (const l of on) expect([...l].length).toBeLessThanOrEqual(46)
  // the light moves along the agents rule over a few frames
  expect(Array.from({ length: 40 }, (_, f) => layout(secs, 46, f, true)).some(ls => ls.some(l => l.some(s => s.t.includes('━'))))).toBe(true)
  const off = layout(secs, 46, 7, false).map(l => l.map(s => s.t).join(''))
  expect(off.some(l => l.includes('━'))).toBe(false)
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

test('drift gauge: one row, the bar in its zone colour, a word for the zone; no scale', () => {
  const g = driftGauge(0.6, 46)
  expect(g.length).toBe(1)
  expect(g[0]!.filter(x => /[▰▱]/.test(x.t)).map(x => x.c)).toEqual(['warning', 'subtle'])
  expect(g[0]!.map(x => x.t).join('')).toContain('drifting')
  expect(driftGauge(0.8, 46)[0]!.map(x => x.t).join('')).toContain('start fresh')
  expect(driftGauge(0.2, 30)[0]!.map(x => x.t).join('')).toContain('ok')
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

test('deck: a fresh session with no touched files, history or turn yet still draws', () => {
  const t = text(deck(data({ touched: undefined, history: undefined, cur: undefined, feed: [], turns: 0 }), 46, 0, 3.6e6))
  expect(t).toContain('Add GDScript')
  expect(t).toContain('0 turns')
  expect(t).not.toContain('edited')
})

test('deck on/off: on unless stored off', () => {
  expect(isDeckOn(undefined)).toBe(true)
  expect(isDeckOn(true)).toBe(true)
  expect(isDeckOn(false)).toBe(false)
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

test('todo: TodoWrite replaces the list; TaskCreate adds, TaskUpdate changes or deletes by id', () => {
  const w = applyTodo([], 'TodoWrite', { todos: [{ content: 'read', status: 'completed', activeForm: 'x' }, { content: 'edit', status: 'in_progress', activeForm: 'x' }, { content: 'test', status: 'pending', activeForm: 'x' }] }, '')
  expect(w.map(t => `${t.state}:${t.text}`)).toEqual(['done:read', 'working:edit', 'todo:test'])
  let t = applyTodo([], 'TaskCreate', { subject: 'first', description: 'd' }, '{"result":"Task #4 created successfully"}')
  t = applyTodo(t, 'TaskCreate', { subject: 'second', description: 'd' }, '{"result":"ok"}')
  expect(t.map(x => x.id)).toEqual(['4', '2'])
  t = applyTodo(t, 'TaskUpdate', { taskId: '4', status: 'in_progress' }, '')
  t = applyTodo(t, 'TaskUpdate', { taskId: '2', status: 'deleted' }, '')
  expect(t).toEqual([{ id: '4', text: 'first', state: 'working' }])
  expect(applyTodo(t, 'Read', {}, '')).toBe(t)
})

test('todo section: counts, states, hidden without a list', () => {
  const secs = deck(data({ todos: [{ text: 'read', state: 'done' }, { text: 'edit', state: 'working' }, { text: 'test', state: 'todo' }] }), 46, 0, 3.6e6)
  const t = secs.find(x => x.id === 'todo')!
  expect(t.meta).toBe('1 of 3')
  expect(t.body.map(l => l.map(s => s.t).join(''))).toEqual(['✔ read', '⠋ edit', '○ test'])
  expect(deck(data(), 46, 0, 3.6e6).some(x => x.id === 'todo')).toBe(false)
})

test('turns: no turns section; the header shows the lean level next to effort', () => {
  expect(deck(data({ history: HIST }), 50, 0, 3.6e6).some(x => x.id === 'turns')).toBe(false)
  const head = (lean?: 'off' | 'lite' | 'full') => text(deck(data({ lean }), 60, 0, 3.6e6).slice(0, 1))
  // lean is a bar like effort's: ▰ cells grow with the level, then its name
  const chip = (lean: 'off' | 'lite' | 'full') => deck(data({ lean }), 60, 0, 3.6e6)[0]!.body.flat().filter(s => s.c === 'success' && s.b).map(s => s.t.trim())
  expect(head('full')).toContain('lean ▰▰ full')
  expect(head('lite')).toContain('lean ▰▱ lite')
  expect(head('off')).toContain('lean ▱▱ off')
  expect(deck(data({ lean: 'full' }), 60, 0, 3.6e6)[0]!.body.map(l => l.map(s => s.t).join('')).some(l => l.includes('medium') && l.includes('lean'))).toBe(false)
  for (const l of ['off', 'lite', 'full'] as const) expect(chip(l)).toEqual([l])
  expect(head()).not.toContain('lean')
})

test('task: lean and workload share a line, wrapping when narrow', () => {
  const rows = deck(data({ lean: 'full', workload: 'always' }), 60, 0, 3.6e6)[0]!.body
  const line = (k: string) => rows.find(l => l.map(s => s.t).join('').trim().startsWith(k))!
  expect(line('lean').map(s => s.t).join('').trim()).toBe('lean ▰▰ full  workload ▰▰ always')
  expect(line('lean').filter(s => s.c === 'success' && s.b).map(s => s.t.trim())).toEqual(['full', 'always'])
  // too narrow for both: workload wraps to its own line
  const narrow = deck(data({ lean: 'full', workload: 'always' }), 30, 0, 3.6e6)[0]!.body.map(l => l.map(s => s.t).join('').trim())
  expect(narrow).toContain('lean ▰▰ full')
  expect(narrow.some(l => l.startsWith('workload'))).toBe(true)
  expect(deck(data(), 60, 0, 3.6e6)[0]!.body.some(l => l.map(s => s.t).join('').includes('workload'))).toBe(false)
})

test('task: testing joins the settings row, wraps when narrow, absent when unset', () => {
  const text = (w: number, d = data({ lean: 'full', workload: 'always', testing: 'thorough' })) => deck(d, w, 0, 3.6e6)[0]!.body.map(l => l.map(s => s.t).join('').trim())
  // centred 2x2 grid: lean | workload on one row, testing alone on the next
  expect(text(80)).toContain('lean ▰▰ full         workload ▰▰ always')
  expect(text(80)).toContain('testing ▰▰ thorough')
  const narrow = text(30)
  expect(narrow.some(l => l.startsWith('testing'))).toBe(true)
  expect(narrow.some(l => l.startsWith('lean') && l.includes('testing'))).toBe(false)
  expect(text(80, data({ lean: 'full' })).some(l => l.includes('testing'))).toBe(false)
})

test('brailleLine: exact cells for flat, rising, drop, multi-row, partial and clamped', () => {
  expect(brailleLine([50, 50, 50, 50], 2, 1)).toEqual(['⠒⠒'])
  expect(brailleLine([0, 100], 1, 1)).toEqual(['⡜'])
  expect(brailleLine([100, 0], 1, 1)).toEqual(['⢣']) // compaction / reset drop
  expect(brailleLine([0, 100], 1, 2)).toEqual(['⢸', '⡇'])
  expect(brailleLine([0, 100], 2, 1)).toEqual([' ⡜']) // newest at the right edge
  expect(brailleLine([], 2, 1)).toEqual(['  '])
  expect(brailleLine([150, 150], 1, 1)).toEqual(['⠉']) // clamped to max
  expect(brailleLine([0, 10, 20, 30, 40, 50, 60, 70, 80, 90], 3, 1)).toEqual(['⠔⠒⠊']) // last 2·w only
})

test('series: context per turn, capped', () => {
  let c: number[] = []
  for (let i = 0; i < 130; i++) c = addCtx(c, i % 100)
  expect(c.length).toBe(120)
  expect(c.at(-1)).toBe(29)
  expect(addCtx([5], NaN)).toEqual([5])
})

test('series: 5h per minute, resets with its window', () => {
  const R = 1.8e12 // epoch ms (resetMs reads numbers under 1e12 as seconds)
  let f = addFive(undefined, undefined, 10, R, 0)
  f = addFive(f.fiveSeries, f.fiveAt, 11, R + 2000, 30_000) // jitter, same minute: replaced
  expect(f.fiveSeries).toEqual([{ at: 0, pct: 11 }])
  f = addFive(f.fiveSeries, f.fiveAt, 12, R, 90_000) // a new minute: appended
  expect(f.fiveSeries.map(x => x.pct)).toEqual([11, 12])
  f = addFive(f.fiveSeries, f.fiveAt, 1, R + 5 * 3.6e6, 200_000) // a new window: reset
  expect(f.fiveSeries).toEqual([{ at: 200_000, pct: 1 }])
  let h = addFive(undefined, undefined, 1, R, 0)
  for (const t of [30_000, 50_000, 70_000]) h = addFive(h.fiveSeries, h.fiveAt, 2, R, t)
  expect(h.fiveSeries.length).toBe(2)
  let g = { fiveSeries: [] as FiveSample[], fiveAt: R as number | undefined }
  for (let i = 0; i < 130; i++) g = addFive(g.fiveSeries, g.fiveAt, i % 100, R, i * 60_000)
  expect(g.fiveSeries.length).toBe(120)
  expect(addFive([{ at: 0, pct: 3 }], R, undefined, R, 120_000).fiveSeries).toEqual([{ at: 0, pct: 3 }])
  // no reset time: the series is kept (same window), not restarted on every call
  let k = addFive(undefined, undefined, 1, undefined, 0)
  for (const t of [60_000, 120_000]) k = addFive(k.fiveSeries, k.fiveAt, 2, undefined, t)
  expect(k.fiveSeries.length).toBe(3)
})

test('usage: context bar without a trail, and the 5h braille chart', () => {
  const ser = { ctxSeries: [20, 30, 45, 59], fiveSeries: Array.from({ length: 30 }, (_, i) => ({ at: i * 60_000, pct: Math.round((i * 42) / 29) })) }
  const rows = (w: number, x = {}) => deck(data({ ...ser, ...x }), w, 0, 3.6e6).find(s => s.id === 'usage')!.body.map(l => l.map(s => s.t).join(''))
  const B = /[⠁-⣿]/
  const u = rows(46)
  expect(u[0]).toMatch(/^context .*59%/)
  expect(u[0]).not.toMatch(B)
  expect(u[1]).toMatch(/^5h .*▰.*42% +↻/)
  expect(u.slice(2, 5).every(r => r.length === 46 && B.test(r))).toBe(true)
  expect(u.length).toBeLessThanOrEqual(9)
  expect(rows(46, { limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: 3 * 3600 }, { kind: 'seven_day', percentUsed: 23, resetsAt: 5 * 3600 }] }).length).toBeLessThanOrEqual(8)
  for (const r of u) expect([...r].length).toBeLessThanOrEqual(46)
  expect(rows(46, { limits: [{ kind: 'five_hour', percentUsed: 42 }] })[1]).not.toContain('↻')
  // narrow panes: the context bar keeps its 4-cell floor (the trail yields), and the value is not clipped away
  for (let w = 12; w <= 16; w++) {
    const c = rows(w)[0]!
    expect([...c].length).toBeLessThanOrEqual(w)
    expect([...c].filter(ch => ch === '▰' || ch === '▱').length).toBeGreaterThanOrEqual(4)
    if (w >= 13) expect(c).toContain('59%')
  }
  const n = rows(32)
  expect(n[1]).toMatch(/^5h .*▰.*42%/)
  // two chart rows at narrow widths, scaled to the series so both have a line
  expect(n.slice(2, 4).every(r => r.length === 32 && B.test(r))).toBe(true)
  for (const r of n) expect([...r].length).toBeLessThanOrEqual(32)
  // fewer than 2 samples: plain meters, no braille
  const few = rows(46, { ctxSeries: [59], fiveSeries: [{ at: 0, pct: 42 }] })
  expect(few.some(r => B.test(r))).toBe(false)
  expect(few.some(r => /^5h .*42%/.test(r))).toBe(true)
  // under half an hour of 5h samples: the meter only, no chart
  const early = rows(46, { fiveSeries: ser.fiveSeries.slice(0, 29) })
  expect(early.some(r => /^5h .*▰.*42%/.test(r))).toBe(true)
  expect(early.slice(1).some(r => B.test(r))).toBe(false)
  // a long but flat series (9% for 40 minutes): the meter only, and no row of only spaces
  const flat = rows(46, { limits: [{ kind: 'five_hour', percentUsed: 9, resetsAt: 3 * 3600 }, { kind: 'seven_day', percentUsed: 8, resetsAt: 5 * 3600 }], fiveSeries: Array.from({ length: 40 }, (_, i) => ({ at: i * 60_000, pct: 9 })) })
  expect(flat.some(r => /^5h .*▰.*9%/.test(r))).toBe(true)
  expect(flat.some(r => B.test(r))).toBe(false)
  expect(flat.every(r => r.trim() !== '')).toBe(true)
  // no 5h limit (API key): no 5h block
  expect(rows(46, { limits: [] }).some(r => r.startsWith('5h'))).toBe(false)
})

test('usage: the 5h bar stays when the chart shows, and the chart is scaled to its own range', () => {
  const lim = [{ kind: 'five_hour', percentUsed: 13, resetsAt: 4 * 3600 }, { kind: 'seven_day', percentUsed: 8, resetsAt: 5 * 3600 }]
  const rows = (n: number, w = 46) => deck(data({ limits: lim, fiveSeries: Array.from({ length: n }, (_, i) => ({ at: i * 60_000, pct: 4 + Math.round((i * 9) / Math.max(1, n - 1)) })) }), w, 0, 3.6e6).find(s => s.id === 'usage')!.body.map(l => l.map(s => s.t).join(''))
  const r = rows(40)
  expect(r.some(x => /^5h .*▰.*13%/.test(x))).toBe(true)
  expect(r.every(x => x.trim() !== '')).toBe(true)
  expect(r.filter(x => /[⠁-⣿]/.test(x)).length).toBeGreaterThanOrEqual(2)
  expect(rows(40, 32).every(x => x.trim() !== '')).toBe(true)
  expect(rows(1).some(x => /[⠁-⣿]/.test(x))).toBe(false)
})

test('pipeline: each phase draws its own row, idle is still, short or narrow draws nothing', () => {
  const THEME = new Set(['claude', 'success', 'warning', 'error', 'suggestion', 'subtle', undefined])
  const BG = new Set(['claude', 'warning', 'suggestion', undefined])
  const str = (ls: ReturnType<typeof pipeline>) => ls.map(l => l.map(s => s.t).join('')).join('\n')
  const phases = [{ kind: 'thinking' as const }, toolPhase('Edit', { file_path: '/r/hooks/deck.tsx' }), { kind: 'waiting' as const }, { kind: 'idle' as const }]
  const drawn = phases.map(p => pipeline(p, 6, 30, 3, 12_000))
  expect(new Set(drawn.map(str)).size).toBe(4)
  for (const ls of drawn) {
    expect(ls.length).toBe(3)
    for (const l of ls) { expect(len(l)).toBeLessThanOrEqual(30); for (const s of l) { expect(THEME.has(s.c)).toBe(true); expect(BG.has(s.bg)).toBe(true) } }
  }
  expect(str(drawn[0]!)).toContain('thinking · 12k this turn')
  expect(str(drawn[1]!)).toContain('editing hooks/deck.tsx')
  expect(str(drawn[1]!)).toContain('✎ editing')
  expect(drawn[1]![0]!.find(s => s.bg)).toMatchObject({ bg: 'suggestion' })
  expect(str(pipeline({ kind: 'idle' }, 0, 30, 3))).toBe(str(pipeline({ kind: 'idle' }, 77, 30, 3)))
  expect(str(pipeline({ kind: 'thinking' }, 0, 30, 3))).not.toBe(str(pipeline({ kind: 'thinking' }, 2, 30, 3)))
  expect(pipeline({ kind: 'thinking' }, 0, 30, 2)).toEqual([])
  expect(pipeline({ kind: 'thinking' }, 0, 23, 3)).toEqual([])
  expect(pipeline(toolPhase('Bash', { command: 'make check 2>&1' }), 0, 40, 3)[2]!.map(s => s.t).join('').trim()).toBe('⠋ testing make check')
})

test('task: advisor model warns when weaker than the session model', () => {
  const text = (w: number, d: Partial<Parameters<typeof data>[0]>) => deck(data({ advisor: 'mid', ...d }), w, 0, 3.6e6)[0]!.body.map(l => l.map(s => s.t).join('').trim())
  expect(text(80, { model: 'sonnet-5-5', advisorModel: 'haiku' }).some(l => l.includes('⚠ weaker'))).toBe(true)
  expect(text(80, { model: 'sonnet-5-5', advisorModel: 'opus' }).some(l => l.includes('mid opus'))).toBe(true)
  expect(text(80, { model: 'sonnet-5-5', advisorModel: 'opus' }).some(l => l.includes('⚠'))).toBe(false)
  expect(text(80, { model: 'sonnet-5-5' }).some(l => l.includes('mid opus'))).toBe(false)
  for (const w of [30, 40, 80]) expect(text(w, { model: 'sonnet-5-5', advisorModel: 'haiku' }).every(l => [...l].length <= w)).toBe(true)
})

test('keepLimits: a kind missing from an update is kept until its reset passes', () => {
  const five = { kind: 'five_hour', percentUsed: 40, resetsAt: 10_000 }
  expect(keepLimits([five], [], 5_000_000)).toEqual([five])
  expect(keepLimits([five], [], 11_000_000)).toEqual([])
  const week = { kind: 'seven_day', percentUsed: 8 }
  expect(keepLimits([five, week], [{ kind: 'five_hour', percentUsed: 50 }], 0)).toEqual([{ kind: 'five_hour', percentUsed: 50 }, week])
})

test('usage: the 5h meter shows at narrow and wide widths, with and without a chart', () => {
  const lim = [{ kind: 'five_hour', percentUsed: 13, resetsAt: 4 * 3600 }]
  const fiveSeries = Array.from({ length: FIVE_CHART_MIN }, (_, i) => ({ at: i * 60_000, pct: 4 + Math.round((i * (FIVE_CHART_SPREAD + 2)) / (FIVE_CHART_MIN - 1)) }))
  for (const w of [32, 60]) for (const fs of [[], fiveSeries]) {
    const r = deck(data({ limits: lim, fiveSeries: fs }), w, 0, 3.6e6).find(s => s.id === 'usage')!.body.map(l => l.map(s => s.t).join(''))
    expect(r.some(x => x.startsWith('5h') && /[▰▱]/.test(x))).toBe(true)
  }
})

const sg = (x: Partial<DeckData> = {}) => data({ task: undefined, changes: undefined, feed: [], running: false, ...x })
const NOW = 3.6e6
const T = (at: number, tone: 'good' | 'bad') => ({ at, kind: 'test' as const, text: 'test', note: tone === 'bad' ? 'failed' : 'passed', tone })
const E = (at: number) => ({ at, kind: 'edit' as const, text: 'a.ts' })
const R = (at: number) => ({ at, kind: 'run' as const, text: 'x', note: 'exit≠0', tone: 'bad' as const })

test('suggestSkill: rules a-f, priority, used skills skipped', () => {
  const DB = 'mattpocock-skills:diagnosing-bugs'
  const ch = { files: 2, added: 1, removed: 0 }
  const sk = (name: string, at: number) => ({ name, at, via: 'tool' as const })
  expect(suggestSkill(sg({ feed: [T(1, 'bad')] }), NOW)).toEqual({ name: DB, why: 'tests failing' })
  expect(suggestSkill(sg({ feed: [R(NOW - 5), R(NOW - 4)] }), NOW)).toEqual({ name: DB, why: 'commands failing' })
  expect(suggestSkill(sg({ feed: [R(NOW - 5)] }), NOW)).toBeUndefined()
  expect(suggestSkill(sg({ feed: [E(5), T(3, 'good')] }), NOW)).toEqual({ name: 'superpowers:verification-before-completion', why: 'edited, not verified' })
  expect(suggestSkill(sg({ feed: [E(5)] }), NOW)?.why).toBe('edited, not verified')
  // c: pass + uncommitted, unreviewed; d: reviewed after the edit
  const pc = sg({ feed: [E(1), T(3, 'good')], changes: ch })
  expect(suggestSkill(pc, NOW)).toEqual({ name: 'mattpocock-skills:code-review', why: 'checks pass, unreviewed' })
  expect(suggestSkill({ ...pc, skills: [sk('mattpocock-skills:code-review', 0)] }, NOW)?.name).toBe('mattpocock-skills:code-review')
  expect(suggestSkill({ ...pc, skills: [sk('mattpocock-skills:code-review', NOW - 1000)] }, NOW)).toEqual({ name: 'helm:commit', why: 'checks pass, uncommitted' })
  // e: grilled with a tracker -> to-spec; without one, nothing (f needs no skill used)
  const g = sg({ task: 'x', tracker: true, skills: [sk('mattpocock-skills:grilling', 10)] })
  expect(suggestSkill(g, NOW)).toEqual({ name: 'mattpocock-skills:to-spec', why: 'grilled, no spec yet' })
  expect(suggestSkill({ ...g, tracker: false }, NOW)).toBeUndefined()
  expect(suggestSkill({ ...g, skills: [sk('mattpocock-skills:grill-me', 10)] }, NOW)?.name).toBe('mattpocock-skills:to-spec')
  // to-spec ran after t0 (outside the used window): not suggested again
  expect(suggestSkill({ ...g, skills: [...g.skills, sk('mattpocock-skills:to-spec', 20)] }, NOW)).toBeUndefined()
  // f
  expect(suggestSkill(sg({ task: 'x' }), NOW)).toEqual({ name: 'mattpocock-skills:grill-me', why: 'new task, not grilled' })
  expect(suggestSkill(sg({ task: 'x', skills: [{ name: 'helm:prompt', at: 0, via: 'tool' }] }), NOW)).toBeUndefined()
  // priority: failing test beats a new task and an edit
  expect(suggestSkill(sg({ task: 'x', feed: [T(1, 'bad')] }), NOW)?.name).toBe(DB)
  expect(suggestSkill(sg({ feed: [T(1, 'bad'), E(5)] }), NOW)?.why).toBe('tests failing')
  // recently used or running: skipped, falls through to b
  const dbg = { name: DB, at: NOW - 1000, via: 'tool' as const }
  expect(suggestSkill(sg({ feed: [T(1, 'bad'), E(5)], skills: [dbg] }), NOW)?.why).toBe('edited, not verified')
  expect(suggestSkill(sg({ feed: [T(1, 'bad')], skills: [{ ...dbg, at: 0 }] }), NOW)?.why).toBe('tests failing')
  expect(suggestSkill(sg({ feed: [T(1, 'bad')], skills: [{ ...dbg, at: 100 }], running: true, skillsSince: 50 }), NOW)).toBeUndefined()
})

test('skills: command names and the history list', () => {
  expect(skillCommand('/helm:prompt x')).toBe('helm:prompt')
  expect(skillCommand('/clear')).toBeUndefined()
  expect(skillCommand('/brainstorm', ['brainstorm'])).toBe('brainstorm')
  const l = [1, 2, 3, 4].map(i => ({ name: `s${i}`, at: i, via: 'tool' as const }))
  expect(addSkill(l, { name: 's2', at: 9, via: 'command' }).map(s => s.name)).toEqual(['s1', 's3', 's4', 's2'])
  expect(addSkill(l, { name: 's5', at: 9, via: 'tool' }).map(s => s.name)).toEqual(['s2', 's3', 's4', 's5'])
})

test('deck: skills section sits between focus and usage and fits', () => {
  for (const w of [32, 60]) {
    const on = deck(data({ running: true, skillsSince: 10, skills: [{ name: 'superpowers:verification-before-completion', at: 5, via: 'tool' }, { name: 'superpowers:systematic-debugging', at: 20, via: 'tool' }] }), w, 0, NOW)
    const ids = on.map(x => x.id)
    expect(ids.indexOf('skills')).toBe(ids.indexOf('focus') + 1)
    expect(ids.indexOf('usage')).toBe(ids.indexOf('skills') + 1)
    const sk = on.find(x => x.id === 'skills')!
    expect(sk.tone).toBe('claude')
    expect(sk.body[0]!.map(s => s.t).join('')).toContain('▸ superpowers:systematic-debugg')
    for (const l of sk.body) expect(len(l)).toBeLessThanOrEqual(w)
  }
  expect(deck(sg(), 46, 0, NOW).some(x => x.id === 'skills')).toBe(false)
})

test('suggestSkill: a skill used before taskAt does not stop grill-me', () => {
  const old = { name: 'helm:prompt', at: 50, via: 'tool' as const }
  expect(suggestSkill(sg({ task: 'x', taskAt: 100, skills: [old] }), NOW)?.name).toBe('mattpocock-skills:grill-me')
})

test('suggestSkill: a failing test from before taskAt does not trigger debugging', () => {
  expect(suggestSkill(sg({ feed: [T(1, 'bad')], taskAt: 100 }), NOW)).toBeUndefined()
})

test('deck: with skills, usage and agents sections still show at w=60', () => {
  const ids = deck(data({ skills: [{ name: 'helm:prompt', at: 5, via: 'tool' }], agents: [agent('a')] }), 60, 0, NOW).map(x => x.id)
  expect(ids).toContain('usage')
  expect(ids).toContain('agents')
  expect(ids).toContain('skills')
})

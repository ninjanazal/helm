import { expect, mock, test } from 'claude-code/testing'
import { addCtx, addFive, agentDone, agentStep, applyStep, applyTodo, parseChecks, bar, brailleLine, isDeckOn, deck, drift, driftGauge, layout, len, paceToLimit, terms, topicShift, verdict } from './deck-core'
import type { DeckData, FiveSample } from './deck-core'

const data = (x: Partial<DeckData> = {}): DeckData => ({
  task: 'Add GDScript support to the parser', taskAt: 0, turns: 12, model: 'opus-5-5', effort: 'medium', branch: 'main', dirty: 3,
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
  for (const x of ['editing hooks/deck-core.ts', 'at this pace', 'full in']) expect(t).not.toContain(x)
  for (const sec of on) for (const l of sec.body) expect(len(l)).toBeLessThanOrEqual(46)
  // the usage meters' bars line up whatever their values say
  const wk0 = deck(data({ limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: 3 * 3600 }, { kind: 'seven_day', percentUsed: 23, resetsAt: 5 * 3600 }] }), 46, 7, now)
  const ses = wk0.find(x => x.id === 'usage')!.body.filter(l => l[0]?.t.trim() === 'context' || l[0]?.t.trim() === 'week')
  expect(ses.length).toBe(2)
  expect(new Set(ses.map(l => l.map(x => x.t).join('').indexOf(' ', 9 + 20))).size).toBe(1)
  // the header has no title; a section is live only while work flows in it and a turn runs
  expect(on[0]!.id).toBe('head')
  expect(on[0]!.title).toBe('')
  expect(on.filter(x => x.live).map(x => x.id)).toEqual([])
  const work = deck(data({ agents: [agent('a')], checks: [{ text: 'x', state: 'working' }] }), 46, 7, now)
  expect(work.filter(x => x.live).map(x => x.id)).toEqual(['agents', 'checks'])
  const idle = deck(data({ running: false, agents: [agent('a')], checks: [{ text: 'x', state: 'working' }] }), 46, 7, now)
  expect(idle.some(x => x.live)).toBe(false)
  expect(text(idle)).toContain('✔')
  expect(text(deck(data({ drift: drift(95, 1, 60) }), 46, 0, now))).toContain('start a fresh session')
  expect(text(deck(data({ touched: undefined }), 46, 0, now))).not.toContain('edited')
  // unknown figures are hidden, not shown as zero
  const fresh = text(deck(data({ tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, task: undefined }), 46, 0, now))
  expect(fresh).not.toContain('tokens 0')
  expect(fresh).toContain('your next prompt becomes the task')
  // tokens: in = input + cache writes, out = output; no $/h rate
  expect(t).toContain('$4.80 · 4.0k tok')
  expect(t).not.toContain('/h')
  expect(t).not.toContain('rate ')
  const big = text(deck(data({ tokens: { input: 1000, output: 2000, cacheRead: 1_400_000, cacheWrite: 1000 } }), 46, 0, now))
  expect(big).not.toContain('1.4M')
  // a weekly limit gets its own meter and reset countdown
  const wk = text(deck(data({ limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: 3 * 3600 }, { kind: 'seven_day', percentUsed: 23, resetsAt: 5 * 3600 }] }), 46, 0, now))
  expect(wk).toContain('23% ↻4h 00m')
})

test('header: topic first, then time, turns, model, effort and branch, wrapped without cutting an item', () => {
  const [top, ...rest] = deck(data(), 30, 0, 3.6e6)[0]!.body.map(l => l.map(s => s.t).join(''))
  expect(top).toContain('Add GDScript')
  expect(rest.join('|')).toBe('1h 00m · 12 turns · opus-5-5|medium · ⎇ main ±3|✎ 1 edited 2 read')
})

test('deck: fits 24, 40 and 80 columns with 0 or 3 checks and 0 or 2 agents; empty sections are absent', () => {
  for (const w of [24, 40, 80]) for (const nc of [0, 3]) for (const na of [0, 2]) {
    const d = data({ agents: [agent('a'), agent('b', { endedAt: 3.6e6 - 5000 })].slice(0, na), checks: five(2).slice(0, nc), drift: drift(95, 1, 60), todos: five(1), history: HIST, ctxSeries: [20, 30, 45, 59], fiveSeries: [0, 10, 20, 30, 42].map((pct, i) => ({ at: i * 60_000, pct })) })
    const secs = deck(d, w, 3, 3.6e6)
    for (const l of layout(secs, w, 3, true)) expect(len(l)).toBeLessThanOrEqual(w)
    expect(secs.some(x => x.id === 'agents')).toBe(na > 0)
    expect(secs.some(x => x.id === 'checks')).toBe(nc > 0)
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
  expect(rows[0]).toMatch(/^⠋ Explore · audit part a +12k 1m$/)
  expect(rows[1]).toBe('✔ Explore · audit part b · 12k')
  expect(ag.body[1]![2]!.d).toBe(true)
})

test('checks: the approved prompt\'s items last, ticked by state; hidden without a prompt', () => {
  const ck = [...five(3)]
  ck[3] = { text: 'idle frames static', state: 'working' as never }
  const secs = deck(data({ checks: ck }), 46, 0, 3.6e6)
  expect(secs[secs.length - 1]!.id).toBe('checks')
  const c = secs.find(x => x.id === 'checks')!
  expect(c.title).toBe('☑ CHECKS')
  expect(c.meta).toBe('3 of 5')
  expect(c.body.map(l => l.map(s => s.t).join(''))).toEqual(['✔ check 1', '✔ check 2', '✔ check 3', '⠋ idle frames static  ← working on', '○ check 5'])
  expect(c.body[4]![0]!.c).toBe('subtle')
  expect(deck(data({ checks: five(5) }), 46, 0, 3.6e6).find(x => x.id === 'checks')!.tone).toBe('success')
  // idle: the working check shows a still mark
  expect(deck(data({ checks: ck, running: false }), 46, 0, 3.6e6).find(x => x.id === 'checks')!.body[3]![0]!.t).toBe('○')
  expect(deck(data(), 46, 0, 3.6e6).some(x => x.id === 'checks')).toBe(false)
})

test('parseChecks: the acceptance block\'s items, nothing outside it', () => {
  const p = ['<goal>x</goal>', '- [ ] not this one', '<acceptance>', '  - [ ] `make check exits 0`', '  - [ ] widths fit', '  - [x] already done', '  - [ ] a `code` bit inside', '  - [ ] fifth', '  not an item', '</acceptance>', '- [ ] nor this'].join('\n')
  expect(parseChecks(p)).toEqual([
    { text: 'make check exits 0', state: 'todo' },
    { text: 'widths fit', state: 'todo' },
    { text: 'already done', state: 'done' },
    { text: 'a `code` bit inside', state: 'todo' },
    { text: 'fifth', state: 'todo' },
  ])
  expect(parseChecks('no block')).toEqual([])
})

test('idle frames are static, and every colour is a theme name', () => {
  const d = data({ running: false, agents: [agent('a')], checks: five(2) })
  const draw = (f: number) => JSON.stringify(layout(deck(d, 46, f, 3.6e6), 48, f, false))
  expect(draw(1)).toBe(draw(9))
  const THEME = new Set(['claude', 'success', 'error', 'warning', 'suggestion', 'subtle'])
  for (const run of [true, false]) {
    const lines = layout(deck(data({ running: run, agents: [agent('a')], checks: [...five(2), { text: 'w', state: 'working' }], drift: drift(95, 1, 60), todos: [...five(1), { text: 'w', state: 'working' }], history: HIST }), 46, 4, 3.6e6), 48, 4, run)
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

test('open layout: lower-case titles with a rule; the light sweeps only while running', () => {
  const secs = deck(data({ agents: [agent('a')] }), 44, 7, 3.6e6)
  const on = layout(secs, 46, 7, true).map(l => l.map(s => s.t).join(''))
  expect(on.some(l => l.startsWith('◇ focus ─'))).toBe(true)
  expect(on.some(l => l.startsWith('⌁ agents · 1 running · 12k ─'))).toBe(true)
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
  expect(g[0]!.filter(x => x.t.includes('▆')).map(x => x.c)).toEqual(['warning', 'subtle'])
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

test('deck tool check: marks an item of the approved prompt, answers the count, refuses a bad n', async ($, on) => {
  const stored: Record<string, unknown> = {}
  stubDeck(on, stored)
  on('fs.write', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const prompt = '<goal>g</goal>\n<acceptance>\n- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d\n- [ ] e\n</acceptance>'
  await $.tool.call({ tool: 'mcp__helm__set_task', prompt, goal: 'g' } as never)
  expect(said(await deckTool($, { action: 'check', n: 2, state: 'done' }))).toBe('Check 2 done (1/5).')
  expect(said(await deckTool($, { action: 'check', n: 3, state: 'working' }))).toBe('Check 3 working (1/5).')
  expect(said(await deckTool($, { action: 'check', n: 9, state: 'done' }))).toBe('Error: n is a check number from 1 to 5.')
  expect(said(await deckTool($, { action: 'check', n: 1, state: 'nope' }))).toBe('Error: state is todo, working or done.')
  // a task re-anchored without a prompt drops the checks
  await deckTool($, { action: 'task', text: 'other' })
  expect(said(await deckTool($, { action: 'check', n: 1, state: 'done' }))).toBe('Error: no checks: approve a /helm:prompt first.')
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

test('turns: the last asks newest first, with time, tokens and cost', () => {
  const rows = deck(data({ history: HIST }), 50, 0, 3.6e6).find(x => x.id === 'turns')!.body.map(l => l.map(s => s.t).join(''))
  expect(rows[0]).toMatch(/^#7 "fix the colours to match.*… +52s  14k  \$0\.31$/)
  expect(rows[1]).toMatch(/^#6 "what can we add" +8s 2\.0k  \$0\.04$/)
  expect(deck(data({ history: undefined }), 50, 0, 3.6e6).some(x => x.id === 'turns')).toBe(false)
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

test('usage: context trail and 5h braille chart', () => {
  const ser = { ctxSeries: [20, 30, 45, 59], fiveSeries: [0, 10, 20, 30, 42].map((pct, i) => ({ at: i * 60_000, pct })) }
  const rows = (w: number, x = {}) => deck(data({ ...ser, ...x }), w, 0, 3.6e6).find(s => s.id === 'usage')!.body.map(l => l.map(s => s.t).join(''))
  const B = /[⠁-⣿]/
  const u = rows(46)
  expect(u[0]).toMatch(/^context .*59%.*[⠁-⣿]/)
  expect(u[1]).toMatch(/^5h +42% +↻/)
  expect(u.slice(2, 5).every(r => r.length === 46)).toBe(true)
  expect(u.slice(2, 5).some(r => B.test(r))).toBe(true)
  expect(u.length).toBeLessThanOrEqual(8)
  expect(rows(46, { limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: 3 * 3600 }, { kind: 'seven_day', percentUsed: 23, resetsAt: 5 * 3600 }] }).length).toBeLessThanOrEqual(8)
  // exactly 2 context samples already draw a trail
  expect(rows(46, { ctxSeries: [20, 59] })[0]).toMatch(/[⠁-⣿]/)
  for (const r of u) expect([...r].length).toBeLessThanOrEqual(46)
  expect(u[0]!.match(/59% ⟲( +)[⠁-⣿]/)![1]!.length).toBeLessThanOrEqual(2)
  expect(rows(46, { limits: [{ kind: 'five_hour', percentUsed: 42 }] })[1]).not.toContain('↻')
  // narrow panes: the context bar keeps its 4-cell floor (the trail yields), and the value is not clipped away
  for (let w = 12; w <= 16; w++) {
    const c = rows(w)[0]!
    expect([...c].length).toBeLessThanOrEqual(w)
    expect([...c].filter(ch => ch === '▆').length).toBeGreaterThanOrEqual(4)
    if (w >= 13) expect(c).toContain('59%')
  }
  const n = rows(32)
  expect(n[1]).not.toContain('↻')
  // two chart rows at narrow widths; 0-42% only reaches the lower one
  expect(n.slice(2, 4).every(r => r.length === 32)).toBe(true)
  expect(n.slice(2, 4).filter(r => B.test(r)).length).toBe(1)
  for (const r of n) expect([...r].length).toBeLessThanOrEqual(32)
  // fewer than 2 samples: plain meters, no braille
  const few = rows(46, { ctxSeries: [59], fiveSeries: [{ at: 0, pct: 42 }] })
  expect(few.some(r => B.test(r))).toBe(false)
  expect(few.some(r => /^5h .*42%/.test(r))).toBe(true)
  // no 5h limit (API key): no 5h block
  expect(rows(46, { limits: [] }).some(r => r.startsWith('5h'))).toBe(false)
})

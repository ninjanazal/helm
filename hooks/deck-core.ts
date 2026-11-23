/**
 * Deck: pure parts (no `$`), so they are unit-tested. The deck is a list of sections (header, focus, usage,
 * agents, checks) drawn open: a coloured title and a rule, no boxes. Colours are theme names only. While a turn
 * runs the spinner turns and a light sweeps the rule of the sections where work flows; idle, nothing moves.
 */

import type { DeckAgent, DeckCheck, DeckTodo } from '../types'

export type Seg = { t: string; c?: string; b?: boolean; d?: boolean }
export type Line = Seg[]

export type FeedItem = { at: number; kind: 'find' | 'read' | 'edit' | 'run' | 'test' | 'topic' | 'note'; text: string; note?: string; tone?: 'good' | 'bad' | 'warn' | 'dim' }

export type DeckData = {
  task?: string
  taskAt?: number
  turns: number
  model?: string
  effort?: string
  branch?: string
  dirty?: number
  tests?: { ok: boolean; text: string; at: number }
  ctx?: { tokens?: number; window: number; percent?: number }
  limits: { kind: string; percentUsed: number; resetsAt?: string | number }[]
  compactions: number
  cost?: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  day?: number
  touched?: { path: string; edited: boolean }[]
  cur?: { seq: string; at: number; tok0: number; doing?: string; target?: string }
  history?: { n: number; seq: string; tok: number; ms: number; result: 'ok' | 'warn' | 'err' | 'none'; text: string; ask?: string; cost?: number }[]
  agents?: DeckAgent[]
  checks?: DeckCheck[]
  todos?: DeckTodo[]
  ctxParts?: { name: string; tokens: number }[]
  drift: Drift
  feed: FeedItem[]
  running: boolean
}

export type Drift = { score: number; ctx: number; topic: number; turns: number }

export const DRIFT_AT = 0.7
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

// ── numbers ───────────────────────────────────────────────

/** Session tokens as spent: in = fresh input (uncached + cache writes), out = output. Cache reads are
 *  re-sent context on every step, so they are left out here and only feed the cache %. */
export function tokenSplit(t: DeckData['tokens']): { in: number; out: number; total: number } {
  const i = t.input + t.cacheWrite
  return { in: i, out: t.output, total: i + t.output }
}

export function fmtTok(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`
  return String(Math.round(n))
}

export function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000))
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

function resetMs(r: string | number | undefined): number | undefined {
  if (r === undefined) return undefined
  const v = typeof r === 'number' ? (r < 1e12 ? r * 1000 : r) : Date.parse(r)
  return Number.isFinite(v) ? v : undefined
}

/** At the pace since `since`, when the window would hit 100%, or undefined if that is after its reset. */
export function paceToLimit(pct: number, since: number, resetAt: number | undefined, now: number): number | undefined {
  const spent = now - since
  if (pct <= 0 || spent < 60_000) return undefined
  const left = ((100 - pct) / pct) * spent
  if (resetAt !== undefined && now + left >= resetAt) return undefined
  return left
}

// ── drift ─────────────────────────────────────────────────

const STOP = new Set('the a an is are was be do does did where what which who how why when to of in on for and or it its this that with from by at as get i we you can should there any all now also just lets let me my our please so then than too very ok okay yes no not but if into out up down more some like make made use want need'.split(' '))

export function terms(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of text.toLowerCase().split(/[^a-z0-9_]+/)) if (w.length > 2 && !STOP.has(w)) out.add(w)
  return out
}

/** Share of `recent` terms not in the task's terms; 0 when either side is empty. */
export function topicShift(task: Set<string>, recent: Set<string>): number {
  if (task.size === 0 || recent.size === 0) return 0
  let miss = 0
  for (const w of recent) if (!task.has(w)) miss++
  return miss / recent.size
}

export function drift(ctxPct: number, topic: number, turns: number): Drift {
  const c = Math.min(1, Math.max(0, ctxPct / 100)) * 0.4
  const t = Math.min(1, Math.max(0, topic)) * 0.4
  const n = Math.min(1, turns / 60) * 0.2
  return { score: c + t + n, ctx: c, topic: t, turns: n }
}

// ── drawing helpers ───────────────────────────────────────

export const len = (l: Line) => l.reduce((a, s) => a + [...s.t].length, 0)

function padTo(l: Line, w: number): Line {
  const n = len(l)
  return n >= w ? clip(l, w) : [...l, { t: ' '.repeat(w - n) }]
}

function clip(l: Line, w: number): Line {
  const out: Line = []
  let left = w
  for (const s of l) {
    if (left <= 0) break
    const ch = [...s.t]
    if (ch.length <= left) { out.push(s); left -= ch.length } else { out.push({ ...s, t: ch.slice(0, Math.max(0, left - 1)).join('') + '…' }); left = 0 }
  }
  return out
}


/** A block bar drawn in eighths on a `░` track, with `┊` at the threshold mark. */
/**
 * A bar of `▆` cells: coloured when filled, dim for the track, the threshold mark in the warning colour.
 * `▆` leaves a gap above, so stacked bars stay separate rows (full blocks merge into one shape in the app).
 */
export function bar(p: number, w: number, c: string, mark?: number): Line {
  const full = Math.round(Math.max(0, Math.min(1, p)) * w)
  const m = mark === undefined ? -1 : Math.min(w - 1, Math.round(mark * w))
  const out: Line = []
  for (let i = 0; i < w; i++) {
    if (i === m && i >= full) out.push({ t: '▆', c: 'warning' })
    else if (i < full) out.push({ t: '▆', c })
    else out.push({ t: '▆', c: 'subtle' })
  }
  return merge(out)
}

const BRAILLE = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]]

/** A braille line chart, `h` rows of `w` cells, top row first: the newest of `values` at the right edge, scaled 0..max. */
export function brailleLine(values: number[], w: number, h: number, max = 100): string[] {
  const pw = w * 2, ph = h * 4
  const bits = new Array<number>(w * h).fill(0)
  const set = (x: number, y: number) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= pw || y >= ph) return
    bits[(y >> 2) * w + (x >> 1)] |= BRAILLE[x & 1][y & 3]
  }
  const yOf = (p: number) => ph - 1 - Math.round((Math.min(max, Math.max(0, p)) / max) * (ph - 1))
  const v = values.slice(-pw)
  const x0 = pw - v.length
  v.forEach((p, i) => {
    const y = yOf(p)
    if (!i) return set(x0, y)
    const px = x0 + i - 1, py = yOf(v[i - 1])
    const n = Math.max(1, Math.abs(y - py))
    for (let k = 0; k <= n; k++) set(px + k / n, py + ((y - py) * k) / n)
  })
  return Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => (bits[r * w + c] ? String.fromCharCode(0x2800 + bits[r * w + c]) : ' ')).join(''))
}

function merge(l: Line): Line {
  const out: Line = []
  for (const s of l) {
    const p = out[out.length - 1]
    if (p && p.c === s.c && p.d === s.d && p.b === s.b && p.inv === s.inv) p.t += s.t
    else out.push({ ...s })
  }
  return out
}

const level = (p: number) => (p >= 90 ? 'error' : p >= 70 ? 'warning' : 'success')

/** A light sweeping along a rule while running; a plain thin rule in the subtle colour when idle. */
export function rule(w: number, phase: number | undefined): Line {
  const pos = phase === undefined ? -9 : phase % (w + 6)
  const out: Line = []
  for (let i = 0; i < w; i++) out.push(Math.abs(i - pos) < 3 ? { t: '━', c: 'claude', b: true } : { t: '─', c: 'subtle' })
  return merge(out)
}

/** A section: `title` is drawn in the section's tone, `meta` (counts) dim after it. */
export type Section = { id: string; title: string; meta?: string; tone: string; body: Line[]; live: boolean }

/** Label column + bar + value, all rows aligned. */
const DRIFT_WARN = 0.5
const zone = (p: number) => (p >= DRIFT_AT ? 'error' : p >= DRIFT_WARN ? 'warning' : 'success')
export const driftWord = (p: number) => (p >= DRIFT_AT ? 'start fresh' : p >= DRIFT_WARN ? 'drifting' : 'on task')

/** The drift gauge: one row, the bar filled in the colour of its zone, and a word for the zone after it. */
export function driftGauge(p: number, w: number): Line[] {
  const narrow = w < 40
  const word = narrow ? (p >= DRIFT_AT ? 'fresh' : p >= DRIFT_WARN ? 'drift' : 'ok') : driftWord(p)
  return [meter('focus', p, w, zone(p), [{ t: word, c: zone(p), b: true }])]
}

/** Meters share one bar length: a fixed value column, so bars start and end together. Narrow panes shrink both columns. */
const VALUE_W = 14
const SHORT: Record<string, string> = { context: 'ctx', week: 'wk' }
function meter(label: string, p: number, w: number, c: string, value: Line, mark?: number, stack?: { p: number; c: string }[]): Line {
  const narrow = w < 40
  const lw = narrow ? 5 : 8
  const vw = narrow ? 11 : VALUE_W
  const name = narrow ? (SHORT[label] ?? label).slice(0, lw - 1) : label
  const bw = Math.max(4, w - lw - 1 - vw)
  return [{ t: name.padEnd(lw), d: true }, ...(stack ? stackBar(stack, bw) : bar(p, bw, c, mark)), { t: ' ' }, ...padTo(value, vw)]
}

/** A bar of parts side by side, each its share of the width in its own colour, on a subtle track. */
export function stackBar(parts: { p: number; c: string }[], w: number): Line {
  const out: Line = []
  let used = 0
  let acc = 0
  for (const x of parts) {
    acc += Math.max(0, x.p)
    const end = Math.min(w, Math.round(acc * w))
    const n = Math.max(x.p > 0 && end === used && used < w ? 1 : 0, end - used)
    if (n > 0) { out.push({ t: '▆'.repeat(n), c: x.c }); used += n }
  }
  if (used < w) out.push({ t: '▆'.repeat(w - used), c: 'subtle' })
  return merge(out)
}

/** The context categories' colours, largest first; the rest share the last. */
export const PART_TONES = ['claude', 'suggestion', 'success', 'warning']

/**
 * Claude's task list after one task-tool call: TodoWrite replaces it; TaskCreate adds an item (its id from the
 * result, else the next number); TaskUpdate changes one by id (deleted removes it).
 */
export function applyTodo(list: DeckTodo[], tool: string, input: Record<string, unknown>, result: string): DeckTodo[] {
  const st = (s: unknown): DeckTodo['state'] | undefined => (s === 'completed' ? 'done' : s === 'in_progress' ? 'working' : s === 'pending' ? 'todo' : undefined)
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    return (input.todos as Record<string, unknown>[]).map(t => ({ text: String(t.content ?? ''), state: st(t.status) ?? 'todo' })).filter(t => t.text)
  }
  if (tool === 'TaskCreate' && typeof input.subject === 'string') {
    const id = /#\s*(\d+)|\btask\s+(\d+)/i.exec(result)
    return [...list, { id: id ? (id[1] ?? id[2])! : String(list.length + 1), text: input.subject, state: 'todo' }]
  }
  if (tool === 'TaskUpdate' && input.taskId !== undefined) {
    const id = String(input.taskId)
    if (input.status === 'deleted') return list.filter(t => t.id !== id)
    return list.map(t => (t.id === id ? { ...t, state: st(input.status) ?? t.state, text: typeof input.subject === 'string' ? input.subject : t.text } : t))
  }
  return list
}

const clock = (ms: number) => (ms < 60000 ? `${Math.max(0, Math.round(ms / 1000))}s` : fmtDur(ms))
const dot: Seg = { t: ' · ', d: true }

/** Pack items onto rows no wider than `w`, joined by a dim dot, so nothing is cut mid-item while a row has room. */
function flow(items: Line[], w: number): Line[] {
  const rows: Line[] = []
  let cur: Line = []
  for (const it of items) {
    if (!it.length) continue
    if (cur.length && len(cur) + 3 + len(it) > w) { rows.push(cur); cur = [...it] }
    else cur = cur.length ? [...cur, dot, ...it] : [...it]
  }
  if (cur.length) rows.push(cur)
  return rows
}

/** One sub agent on one row: status, type · task, then tokens and clock; a finished one is one dim line. */
function agentRow(a: DeckAgent, w: number, frame: number, running: boolean, now: number): Line {
  const label: Line = [...(a.type ? [{ t: a.type, b: true }, { t: ' · ', d: true }] : []), { t: a.task || 'agent', d: true }]
  if (a.endedAt !== undefined) return [{ t: '✔', c: 'success' }, { t: ' ' }, { t: `${a.type ? a.type + ' · ' : ''}${a.task || 'agent'} · ${fmtTok(a.tokens)}`, d: true }]
  const icon: Seg = running ? { t: SPIN[frame % SPIN.length]!, c: 'claude', b: true } : { t: '○', c: 'subtle' }
  const stats: Line = [{ t: fmtTok(a.tokens), b: true }, { t: ' ' + clock(now - a.startedAt), d: true }]
  const room = Math.max(4, w - 2 - len(stats) - 2)
  return [icon, { t: ' ' }, ...padTo(clip(label, room), room), { t: '  ' }, ...stats]
}

const MAX_AGENT_ROWS = 4
const CHECK: Record<DeckCheck['state'], (spin: string | undefined) => Seg> = {
  done: () => ({ t: '✔', c: 'success' }),
  working: spin => ({ t: spin ?? '○', c: 'claude', b: true }),
  todo: () => ({ t: '○', c: 'subtle' }),
}

/**
 * The deck as sections: header (no title), focus, usage, agents (only with sub agents), checks (only with an
 * approved prompt). Colours are theme names only, so light and dark themes both read; nothing moves unless a
 * turn runs. `w` is the text width inside the pane.
 */
export function deck(d: DeckData, w: number, frame: number, now: number): Section[] {
  const out: Section[] = []
  const sec = (id: string, title: string, tone: string, body: Line[], live = false, meta?: string) => out.push({ id, title, meta, tone, body: body.map(l => clip(l, w)), live: live && d.running })
  const narrow = w < 40
  const spinner = d.running ? SPIN[frame % SPIN.length]! : undefined

  // header: topic, then time, turns, model, effort, branch, files, tests
  const spin: Seg = spinner ? { t: spinner, c: 'claude', b: true } : d.task ? { t: '✔', c: 'success' } : { t: '·', d: true }
  const items: Line[] = []
  if (d.taskAt !== undefined) items.push([{ t: fmtDur(now - d.taskAt) }])
  items.push([{ t: String(d.turns), b: true }, { t: d.turns === 1 ? ' turn' : ' turns', d: true }])
  if (d.model) items.push([{ t: d.model, c: 'claude', b: true }])
  if (d.effort) items.push([{ t: d.effort }])
  if (d.branch) items.push([{ t: `⎇ ${d.branch}` }, ...(d.dirty ? [{ t: ` ±${d.dirty}`, c: 'warning' }] : [])])
  if (d.touched?.length) {
    const edited = d.touched.filter(t => t.edited).length
    items.push([{ t: '✎ ', c: 'claude' }, { t: String(edited), b: true }, { t: ' edited', d: true }, ...(d.touched.length - edited ? [{ t: ` ${d.touched.length - edited} read`, d: true }] : [])])
  }
  if (d.tests) items.push([d.tests.ok ? { t: `✔ ${d.tests.text}`, c: 'success' } : { t: `✘ ${d.tests.text}`, c: 'error' }, { t: ` ${fmtDur(now - d.tests.at)} ago`, d: true }])
  sec('head', '', 'claude', [
    [spin, { t: ' ' }, d.task ? { t: d.task, b: true } : { t: 'your next prompt becomes the task', d: true }],
    ...flow(items, w),
  ])

  // focus: how far the session has drifted from the task
  const hi = d.drift.score >= DRIFT_AT
  const tone = hi ? 'error' : d.drift.score >= DRIFT_WARN ? 'warning' : 'success'
  sec('focus', `${hi ? '▲' : '◇'} FOCUS`, tone, [
    ...driftGauge(d.drift.score, w),
    ...(hi ? [[{ t: narrow ? '→ start fresh' : '→ start a fresh session  ·  /helm:prompt to start the next task', c: 'error', b: true }]] : []),
  ])

  // usage: context, limits, tokens, cost
  const body: Line[] = []
  if (d.ctx) {
    const p = d.ctx.percent ?? (d.ctx.tokens ? (100 * d.ctx.tokens) / d.ctx.window : 0)
    const parts = (d.ctxParts ?? []).filter(x => x.tokens > 0)
    const tone = (i: number) => PART_TONES[Math.min(i, PART_TONES.length - 1)]!
    const stack = parts.length ? parts.map((x, i) => ({ p: x.tokens / d.ctx!.window, c: tone(i) })) : undefined
    body.push(meter('context', p / 100, w, level(p), [{ t: `${Math.round(p)}%`, c: level(p), b: true }, ...(d.compactions ? [{ t: ' ' + '⟲'.repeat(Math.min(3, d.compactions)), c: 'suggestion' }] : [])], undefined, stack))
    // what fills it: one legend item per category, the small ones folded into "other"
    if (parts.length) {
      const top = parts.slice(0, PART_TONES.length - 1)
      const rest = parts.slice(PART_TONES.length - 1).reduce((n, x) => n + x.tokens, 0)
      const legend = [...top.map((x, i) => ({ name: x.name.toLowerCase(), tokens: x.tokens, c: tone(i) })), ...(rest ? [{ name: parts.length === PART_TONES.length ? parts[PART_TONES.length - 1]!.name.toLowerCase() : 'other', tokens: rest, c: tone(PART_TONES.length - 1) }] : [])]
      const pad = ' '.repeat(narrow ? 5 : 8)
      body.push(...flow(legend.map(x => [{ t: '■ ', c: x.c }, { t: x.name + ' ', d: true }, { t: fmtTok(x.tokens) }]), w - pad.length).map(l => [{ t: pad }, ...l]))
    }
  }
  const limit = (label: string, l: { percentUsed: number; resetsAt?: string | number }) => {
    const r = resetMs(l.resetsAt)
    body.push(meter(label, l.percentUsed / 100, w, level(l.percentUsed), [{ t: `${Math.round(l.percentUsed)}%`, c: level(l.percentUsed), b: true }, { t: r && r > now ? ` ↻${fmtDur(r - now)}` : '', d: true }]))
  }
  const five = d.limits.find(l => /five|5h/i.test(l.kind))
  if (five) limit('5h', five)
  const week = d.limits.find(l => /seven|week|7d/i.test(l.kind))
  if (week) limit('week', week)
  const tk = d.tokens
  const split = tokenSplit(tk)
  const cacheBase = tk.input + tk.cacheRead + tk.cacheWrite
  const parts: Line[] = []
  if (split.total > 0) parts.push([{ t: narrow ? 'tok ' : 'tokens ', d: true }, { t: fmtTok(split.total), b: true }, { t: '  ↑', d: true }, { t: fmtTok(split.in), b: true }, { t: ' ↓', d: true }, { t: fmtTok(split.out), b: true }])
  if (d.cost !== undefined) parts.push([{ t: `$${d.cost.toFixed(2)}`, b: true }])
  if (cacheBase > 0) parts.push([{ t: 'cache ', d: true }, { t: `${Math.round((100 * tk.cacheRead) / cacheBase)}%`, c: tk.cacheRead / cacheBase > 0.7 ? 'success' : 'warning' }])
  body.push(...flow(parts, w))
  if (body.length) sec('usage', '◷ USAGE', 'suggestion', body)

  // agents: only while the session has sub agents; running first, then the most recent finished
  const ag = d.agents ?? []
  if (ag.length) {
    const running = ag.filter(a => a.endedAt === undefined)
    const sorted = [...running, ...ag.filter(a => a.endedAt !== undefined).reverse()]
    const shown = sorted.slice(0, MAX_AGENT_ROWS)
    const rows = shown.map(a => agentRow(a, w, frame, d.running, now))
    if (sorted.length > shown.length) rows.push([{ t: `+${sorted.length - shown.length} more`, d: true }])
    const meta = [running.length ? `${running.length} running` : '', fmtTok(ag.reduce((n, a) => n + a.tokens, 0))].filter(Boolean).join(' · ')
    sec('agents', '⌁ AGENTS', 'claude', rows, running.length > 0, meta)
  }

  // todo: Claude's own task list, while it has one
  const td = d.todos ?? []
  if (td.length) {
    const done = td.filter(t => t.state === 'done').length
    const shown = td.length > 8 ? [...td.filter(t => t.state !== 'done'), ...td.filter(t => t.state === 'done')].slice(0, 8) : td
    const rows: Line[] = shown.map(t => [CHECK[t.state](spinner), { t: ' ' }, t.state === 'todo' ? { t: t.text, d: true } : t.state === 'done' ? { t: t.text, d: true } : { t: t.text, b: true }])
    if (td.length > shown.length) rows.push([{ t: `+${td.length - shown.length} more`, d: true }])
    sec('todo', '☰ TODO', done === td.length ? 'success' : 'claude', rows, td.some(t => t.state === 'working'), `${done} of ${td.length}`)
  }

  // turns: what each of the last asks took and cost, newest first
  const hist = (d.history ?? []).slice(-4).reverse()
  if (hist.length) {
    const rows = hist.map(h => {
      const stats: Line = [{ t: clock(h.ms), d: true }, { t: ' ' }, { t: fmtTok(h.tok).padStart(4) }, ...(h.cost !== undefined ? [{ t: ' ' }, { t: `$${h.cost.toFixed(2)}`.padStart(6), b: true }] : [])]
      const room = Math.max(4, w - len(stats) - 2 - String(h.n).length - 2)
      const ask: Line = h.ask ? [{ t: `"${h.ask}"` }] : [{ t: '(no prompt)', d: true }]
      return [{ t: `#${h.n} `, d: true }, ...padTo(clip(ask, room), room), { t: '  ' }, ...stats]
    })
    sec('turns', '↺ TURNS', 'subtle', rows)
  }

  // checks: the approved prompt's acceptance items, ticked by Claude as it verifies them
  const ck = d.checks ?? []
  if (ck.length) {
    const done = ck.filter(c => c.state === 'done').length
    const all = done === ck.length
    const row = (c: DeckCheck): Line => [CHECK[c.state](spinner), { t: ' ' }, c.state === 'todo' ? { t: c.text, d: true } : { t: c.text, b: c.state === 'working' }, ...(c.state === 'working' ? [{ t: '  ← working on', d: true }] : [])]
    sec('checks', '☑ CHECKS', all ? 'success' : 'suggestion', ck.map(row), ck.some(c => c.state === 'working'), `${done} of ${ck.length}`)
  }
  return out
}

/** The acceptance items of an approved prompt: `- [ ] text` (todo) or `- [x] text` (done) lines inside `<acceptance>`. */
export function parseChecks(prompt: string): DeckCheck[] {
  const m = /<acceptance>([\s\S]*?)<\/acceptance>/.exec(prompt)
  if (!m) return []
  const out: DeckCheck[] = []
  for (const line of m[1]!.split('\n')) {
    const x = /^\s*-\s*\[( |x|X)\]\s+(.+?)\s*$/.exec(line)
    if (!x) continue
    const text = /^`[^`]*`$/.test(x[2]!) ? x[2]!.slice(1, -1) : x[2]!
    out.push({ text, state: x[1] === ' ' ? 'todo' : 'done' })
  }
  return out
}

/**
 * The open layout: per titled section a coloured title and a rule (a light sweeps it only where work is
 * flowing, and only while a turn runs), then its body indented one column. The header has no title. No boxes.
 */
const TITLE_TONE: Record<string, string> = { claude: 'claude', success: 'success', warning: 'warning', error: 'error', suggestion: 'suggestion', subtle: 'subtle' }
export function layout(secs: Section[], w: number, frame: number, running: boolean): Line[] {
  const out: Line[] = []
  secs.forEach((sec, k) => {
    if (sec.title) {
      const [, ico = '', name = sec.title] = /^(\S+) (.*)$/.exec(sec.title) ?? []
      const head: Line = [{ t: ico, c: TITLE_TONE[sec.tone], b: true }, { t: ' ' + name.toLowerCase(), c: TITLE_TONE[sec.tone], b: true }, ...(sec.meta ? [{ t: ' · ' + sec.meta, d: true }] : []), { t: ' ' }]
      out.push([...head, ...rule(Math.max(4, w - len(head)), running && sec.live ? frame * 2 - k * 9 : undefined)])
    }
    for (const l of sec.body) out.push([{ t: ' ' }, ...l])
    out.push([])
  })
  return out.map(l => clip(l, w))
}

// ── sub agents ────────────────────────────────────────────

/** At most this many sub agents are kept; the oldest go first. */
export const AGENTS_KEPT = 6

/**
 * A sub agent's model step, added to its own card (created on its first step, with the task and type the engine
 * lists for it). Tokens are input + cache writes + output, as the main totals count them.
 */
export function agentStep(list: DeckAgent[], id: string, x: { model: string; tokens: number; now: number; task?: string; type?: string }): DeckAgent[] {
  const model = x.model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
  const i = list.findIndex(a => a.id === id)
  if (i < 0) return [...list, { id, task: x.task ?? '', type: x.type, model, tokens: x.tokens, steps: 1, startedAt: x.now }].slice(-AGENTS_KEPT)
  return list.map((a, k) => (k === i ? { ...a, model, tokens: a.tokens + x.tokens, steps: a.steps + 1, task: a.task || x.task || '', type: a.type ?? x.type } : a))
}

export type StepUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
type StepState = { tokens: DeckData['tokens']; agents?: DeckAgent[]; model?: string; effort?: string }

/**
 * One model step, routed: a sub agent's (it has `agentId`) goes to its own card only; the main loop's sets the
 * model and effort and adds to the session totals. The main totals never include a sub agent's tokens.
 */
export function applyStep<S extends StepState>(s: S, e: { agentId?: string; model: string; effort?: unknown }, u: StepUsage | undefined, now: number, info?: { task?: string; type?: string }): S {
  if (e.agentId) {
    const tokens = u ? u.input_tokens + u.cache_creation_input_tokens + u.output_tokens : 0
    return { ...s, agents: agentStep(s.agents ?? [], e.agentId, { model: e.model, tokens, now, ...info }) }
  }
  return {
    ...s,
    model: e.model.replace(/^claude-/, '').replace(/-\d{8}$/, ''),
    effort: e.effort === undefined ? s.effort : String(e.effort),
    tokens: u ? {
      input: s.tokens.input + u.input_tokens,
      output: s.tokens.output + u.output_tokens,
      cacheRead: s.tokens.cacheRead + u.cache_read_input_tokens,
      cacheWrite: s.tokens.cacheWrite + u.cache_creation_input_tokens,
    } : s.tokens,
  }
}

/** A sub agent's turn ended: its clock stops. */
export function agentDone(list: DeckAgent[], id: string, at: number): DeckAgent[] {
  return list.map(a => (a.id === id && a.endedAt === undefined ? { ...a, endedAt: at } : a))
}

/** How a turn ended, from what it did: tests decide; else whole-file reads or untested edits want a look. */
export function verdict(c: { seq: string; whole: number; edits: number; tests?: boolean }): { result: 'ok' | 'warn' | 'err' | 'none'; text: string } {
  if (c.tests === false) return { result: 'err', text: 'tests failed' }
  if (c.tests === true) return { result: 'ok', text: 'tests passed' }
  if (c.whole > 0) return { result: 'warn', text: `${c.whole} whole-file read${c.whole === 1 ? '' : 's'}` }
  if (c.edits > 0) return { result: 'warn', text: 'edited, not tested' }
  if (!c.seq) return { result: 'none', text: 'answer only' }
  return { result: 'ok', text: 'done' }
}

export const PANE_FRAME_MS = 120

/** Whether the deck opens: on unless stored off for the project. */
export function isDeckOn(stored: unknown): boolean {
  return stored !== false
}

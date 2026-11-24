/**
 * Deck: pure parts (no `$`), so they are unit-tested. The deck is a list of sections (header, focus, usage,
 * agents, todo) drawn open: a coloured title and a rule, no boxes. Colours are theme names only. While a turn
 * runs the spinner turns and a light sweeps the rule of the sections where work flows; idle, nothing moves.
 */

import type { DeckAgent, DeckCheck, DeckTodo } from '../types'

/** A run of text: `c` its colour, `bg` a fill (the text then draws in `inverseText`), `b` bold, `d` dim. Theme names only. */
export type Seg = { t: string; c?: string; bg?: string; b?: boolean; d?: boolean }
export type Line = Seg[]

export type FeedItem = { at: number; kind: 'find' | 'read' | 'edit' | 'run' | 'test' | 'topic' | 'note'; text: string; note?: string; tone?: 'good' | 'bad' | 'warn' | 'dim' }

export type DeckData = {
  task?: string
  taskAt?: number
  turns: number
  model?: string
  effort?: string
  /** helm's lean level, as stored (it applies from the next session or /clear). */
  /** The task's keywords and the last prompts' keywords, for the focus text. */
  taskTerms?: string[]
  recent?: string[][]
  lean?: 'off' | 'lite' | 'full'
  /** helm's workload mode, as stored (it applies from the next session or /clear). */
  workload?: 'off' | 'sometimes' | 'always'
  /** helm's testing level, as stored. */
  testing?: 'off' | 'light' | 'thorough'
  /** helm's advisor level, as stored. */
  advisor?: 'low' | 'mid' | 'high'
  /** The model the built-in advisor runs on (Claude Code's `advisorModel` setting). */
  advisorModel?: string
  /** Cumulative sub-agent tokens; with the main tokens it gives the delegated share. */
  delegated?: number
  branch?: string
  /** Working tree vs HEAD: changed files (tracked and untracked) and the tracked lines added and removed. */
  changes?: { files: number; added: number; removed: number }
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
  todos?: DeckTodo[]
  ctxSeries?: number[]
  fiveSeries?: FiveSample[]
  /** The current 5h window's reset time, ms. */
  fiveAt?: number
  drift: Drift
  feed: FeedItem[]
  running: boolean
  /** What the main session is doing now, for the task section's "now" row. */
  phase?: Phase
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
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

function resetMs(r: string | number | undefined): number | undefined {
  if (r === undefined) return undefined
  const v = typeof r === 'number' ? (r < 1e12 ? r * 1000 : r) : Date.parse(r)
  return Number.isFinite(v) ? v : undefined
}

export const SERIES_CAP = 120

/** The context % after each turn, newest last, at most SERIES_CAP; a non-finite pct adds nothing. */
export function addCtx(series: number[] | undefined, pct: number | undefined): number[] {
  const s = series ?? []
  return pct === undefined || !Number.isFinite(pct) ? s : [...s, pct].slice(-SERIES_CAP)
}

export type FiveSample = { at: number; pct: number }

/** The 5h usage, one sample a minute: a sample within a minute of the last updates its pct and keeps its minute; a reset time that moves forward by over 30 min (a new 5h window) starts the series over; jitter, a backward move or an absent one keeps it. */
/** The 5h chart needs about half an hour of samples (one a minute) that move by at least FIVE_CHART_SPREAD points; the meter always shows and the chart sits under it, scaled to its own range. */
export const FIVE_CHART_MIN = 30
export const FIVE_CHART_SPREAD = 8
const NEW_WINDOW_MS = 30 * 60_000

export function addFive(series: FiveSample[] | undefined, windowAt: number | undefined, pct: number | undefined, resetsAt: string | number | undefined, at: number): { fiveSeries: FiveSample[]; fiveAt?: number } {
  const r = resetMs(resetsAt)
  const fresh = r !== undefined && (windowAt === undefined || r - windowAt > NEW_WINDOW_MS)
  const fiveAt = r ?? windowAt
  const base = fresh ? [] : (series ?? [])
  if (pct === undefined || !Number.isFinite(pct)) return { fiveSeries: base, fiveAt }
  const last = base.at(-1)
  const next = last && at - last.at < 60_000 ? [...base.slice(0, -1), { at: last.at, pct }] : [...base, { at, pct }]
  return { fiveSeries: next.slice(-SERIES_CAP), fiveAt }
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

/** haiku < sonnet < opus < fable, by substring; an unknown name has no rank. */
export const modelRank = (name?: string): number | undefined => {
  const i = ['haiku', 'sonnet', 'opus', 'fable'].findIndex(f => (name ?? '').toLowerCase().includes(f))
  return i < 0 ? undefined : i
}

export const len = (l: Line) => l.reduce((a, s) => a + [...s.t].length, 0)

/**
 * Text in `w` cells: as is when it fits; else, while a turn runs, a carousel that scrolls one cell every other
 * frame; else cut with `…`. Idle never moves.
 */
export function marquee(text: string, w: number, frame: number, moving: boolean): string {
  const ch = [...text]
  if (ch.length <= w) return text
  if (!moving || w < 4) return ch.slice(0, Math.max(0, w - 1)).join('') + '…'
  const loop = [...ch, ' ', ' ', '·', ' ', ' ']
  const at = (frame >> 1) % loop.length
  return [...loop.slice(at), ...loop.slice(0, at)].slice(0, w).join('')
}

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


/** A bar of `▰` cells on a `▱` track: coloured when filled, dim for the track, the threshold mark in the warning colour. */
export function bar(p: number, w: number, c: string, mark?: number): Line {
  const full = Math.round(Math.max(0, Math.min(1, p)) * w)
  const m = mark === undefined ? -1 : Math.min(w - 1, Math.round(mark * w))
  const out: Line = []
  for (let i = 0; i < w; i++) {
    if (i === m && i >= full) out.push({ t: '▰', c: 'warning' })
    else if (i < full) out.push({ t: '▰', c })
    else out.push({ t: '▱', c: 'subtle' })
  }
  return merge(out)
}

const BRAILLE = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]]

/** A braille line chart, `h` rows of `w` cells, top row first: the newest of `values` at the right edge, scaled min..max (0..100 by default). */
export function brailleLine(values: number[], w: number, h: number, max = 100, min = 0): string[] {
  const pw = w * 2, ph = h * 4
  const bits = new Array<number>(w * h).fill(0)
  const set = (x: number, y: number) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= pw || y >= ph) return
    bits[(y >> 2) * w + (x >> 1)] |= BRAILLE[x & 1][y & 3]
  }
  const yOf = (p: number) => ph - 1 - Math.round(((Math.min(max, Math.max(min, p)) - min) / (max - min || 1)) * (ph - 1))
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
    if (p && p.c === s.c && p.d === s.d && p.b === s.b && p.bg === s.bg) p.t += s.t
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

/** The words the task is anchored on, and the recent words that are not part of it. */
const keywords = (words: string[] | undefined, n: number) => (words ?? []).slice(0, n)
const strayWords = (d: Pick<DeckData, 'taskTerms' | 'recent'>, n: number) => {
  const task = new Set(d.taskTerms ?? [])
  return [...new Set((d.recent ?? []).flat())].filter(w => !task.has(w)).slice(0, n)
}

/** Word-wrap `text` to rows of at most `w` cells, at most `max` rows; what does not fit is cut with `…`. */
export function wrapText(text: string, w: number, max: number): string[] {
  const rows: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (cur && [...cur].length + 1 + [...word].length > w) { rows.push(cur); cur = word } else cur = cur ? `${cur} ${word}` : word
  }
  if (cur) rows.push(cur)
  const out = rows.slice(0, max).map(r => ([...r].length > w ? [...r].slice(0, Math.max(0, w - 1)).join('') + '…' : r))
  if (rows.length > max) out[max - 1] = [...out[max - 1]!.replace(/…$/, '')].slice(0, Math.max(0, w - 1)).join('') + '…'
  return out
}

/**
 * Sentences on what the session is focused on (the task's own keywords) and, once the bar passes the warning
 * mark, why it drifts: every factor at 25% or more of its cap, strongest first, with the detail that shows it.
 * Works for any task, not only code.
 */
export function focusNote(d: Pick<DeckData, 'taskTerms' | 'recent' | 'drift' | 'turns' | 'task' | 'cur'>, w: number): Line[] {
  const dr = d.drift
  const rows: Line[] = []
  if (d.task) for (const r of wrapText(d.task, w, 2)) rows.push([{ t: r, b: true }])
  if (d.cur?.doing) rows.push([{ t: wrapText(`${d.cur.doing} ${d.cur.target ?? ''}`.trim(), w, 1)[0] ?? '', d: true }])
  if (dr.score < DRIFT_WARN) return rows
  const stray = strayWords(d, 3)
  const factors = [
    { share: dr.ctx / 0.4, text: `the context is ${Math.round((dr.ctx / 0.4) * 100)}% full` },
    { share: dr.topic / 0.4, text: stray.length ? `recent prompts are about ${stray.join(', ')}, not the task` : 'recent prompts differ from the task' },
    { share: dr.turns / 0.2, text: `${d.turns} turns on this task` },
  ].sort((a, b) => b.share - a.share)
  const parts = factors.filter(f => f.share >= 0.25).map(f => f.text)
  const why = `${dr.score >= DRIFT_AT ? 'Start fresh' : 'Drifting'}: ${(parts.length ? parts : [factors[0]!.text]).join('; ')}.`
  const c = dr.score >= DRIFT_AT ? 'error' : 'warning'
  for (const r of wrapText(why, w, 3)) rows.push([{ t: r, c }])
  return rows
}

/** Meters share one bar length: a fixed value column, so bars start and end together. Narrow panes shrink both columns. */
const VALUE_W = 14
const SHORT: Record<string, string> = { context: 'ctx', week: 'wk' }
function meter(label: string, p: number, w: number, c: string, value: Line, mark?: number, trail?: string): Line {
  const narrow = w < 40
  const lw = narrow ? 5 : 8
  const vw = narrow ? 11 : VALUE_W
  const name = narrow ? (SHORT[label] ?? label).slice(0, lw - 1) : label
  if (trail) {
    // value unpadded, the trail right beside it; the bar takes the slack but keeps 4 cells, so the trail is capped to fit
    const room = w - lw - 4 - 1 - len(value) - 1
    const tr = trail.trimStart()
    const t = room > 0 ? tr.slice(-room) : ''
    if (t.length >= 1) return [{ t: name.padEnd(lw), d: true }, ...bar(p, w - lw - 1 - len(value) - 1 - t.length, c, mark), { t: ' ' }, ...value, { t: ' ' }, { t: t, c }]
  }
  const bw = Math.max(4, w - lw - 1 - vw)
  return [{ t: name.padEnd(lw), d: true }, ...bar(p, bw, c, mark), { t: ' ' }, ...padTo(value, vw)]
}

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
function flow(items: Line[], w: number, sep?: string): Line[] {
  const rows: Line[] = []
  let cur: Line = []
  for (const it of items) {
    if (!it.length) continue
    const gap: Seg = sep === undefined ? dot : { t: sep }
    if (cur.length && len(cur) + gap.t.length + len(it) > w) { rows.push(cur); cur = [...it] }
    else cur = cur.length ? [...cur, gap, ...it] : [...it]
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
 * The deck as sections: header (no title), focus, usage, agents (only with sub agents), todo (only with a
 * task list). Colours are theme names only, so light and dark themes both read; nothing moves unless a
 * turn runs. `w` is the text width inside the pane.
 */
export function deck(d: DeckData, w: number, frame: number, now: number): Section[] {
  const out: Section[] = []
  const sec = (id: string, title: string, tone: string, body: Line[], live = false, meta?: string) => out.push({ id, title, meta, tone, body: body.map(l => clip(l, w)), live: live && d.running })
  const narrow = w < 40
  const spinner = d.running ? SPIN[frame % SPIN.length]! : undefined

  // task: the goal (the live state is shown at the bottom), then model and effort on a line, the mode chips in a centred 2x2 grid below it, then the session's facts, a blank row before the facts
  const mv = d.running
  const goal: Line = [d.task ? (d.running ? { t: '◎ ', c: 'claude', b: true } : { t: '✔ ', c: 'success' }) : { t: '· ', d: true },
    d.task ? { t: marquee(d.task, w - 2, frame, mv), b: true } : { t: 'your next prompt becomes the task', d: true }]
  const ph = d.phase ?? { kind: 'idle' as const }
  // model and effort on a line; lean, workload, testing and advisor in a grid; a chip marks the stored choice
  const modelRow: Line = []
  if (d.model) modelRow.push({ t: ` ${d.model} `, bg: 'claude', b: true })
  if (d.effort) {
    const n = EFFORT[d.effort]
    if (modelRow.length) modelRow.push({ t: ' ' })
    modelRow.push(...(n ? [{ t: '▰'.repeat(n), c: 'suggestion' }, { t: '▱'.repeat(4 - n), c: 'subtle' }, { t: ' ' + d.effort, c: 'suggestion', b: true }] : [{ t: d.effort, c: 'suggestion', b: true }]))
  }
  // a stored choice as a bar like effort's: filled cells grow with the level, then its name
  const choice = <T extends string>(label: string, all: readonly T[], cur: T): Line => {
    const n = all.indexOf(cur)
    return [{ t: label + ' ', d: true }, { t: '▰'.repeat(n), c: 'success' }, { t: '▱'.repeat(all.length - 1 - n), c: 'subtle' }, { t: ' ' + cur, c: 'success', b: true }]
  }
  const settings: Line[] = []
  if (modelRow.length) settings.push([{ t: ' '.repeat(Math.max(0, (w - len(modelRow)) >> 1)) }, ...modelRow], [])
  const modes: Line[] = []
  if (d.lean) modes.push(choice('lean', ['off', 'lite', 'full'], d.lean))
  if (d.workload) {
    const chip = choice('workload', ['off', 'sometimes', 'always'], d.workload)
    const dl = d.delegated ?? 0, main = d.tokens.input + d.tokens.cacheWrite + d.tokens.output
    if (dl > 0 && dl + main > 0) chip.push({ t: ` ${Math.round((100 * dl) / (main + dl))}%${narrow ? '' : ' delegated'}`, d: true, b: true })
    modes.push(chip)
  }
  if (d.testing) modes.push(choice('testing', ['off', 'light', 'thorough'], d.testing))
  if (d.advisor) {
    const chip = choice('advisor', ['low', 'mid', 'high'], d.advisor)
    if (d.advisorModel) {
      const name = d.advisorModel.replace(/^claude-/, '').replace(/-\d{8}$/, '')
      const a = modelRank(d.advisorModel), m = modelRank(d.model)
      chip.push({ t: ' ' }, { t: name, b: true })
      if (a !== undefined && m !== undefined) chip.push(a < m ? { t: narrow ? ' ⚠' : ' ⚠ weaker', c: 'warning', b: true } : a === m ? { t: ' =', d: true } : { t: '' })
    }
    modes.push(chip)
  }
  // centred 2x2 grid, filled row by row: lean | workload, testing | advisor; one column when the block is wider than w
  const colW = (c: number, n: number) => Math.max(0, ...modes.filter((_, i) => i % n === c).map(len))
  const cols = modes.length > 1 && colW(0, 2) + 2 + colW(1, 2) <= w ? 2 : 1
  const col1 = colW(0, cols)
  const col2 = cols === 2 ? colW(1, 2) : 0
  const gridPad = ' '.repeat(Math.max(0, (w - (col1 + (col2 ? 2 + col2 : 0))) >> 1))
  for (let i = 0; i < modes.length; i += cols) {
    const row = modes.slice(i, i + cols)
    settings.push([{ t: gridPad }, ...(row.length > 1 ? [...padTo(row[0]!, col1), { t: '  ' }, ...row[1]!] : row[0]!)])
  }
  const items: Line[] = []
  if (d.taskAt !== undefined) items.push([{ t: fmtDur(now - d.taskAt) }])
  items.push([{ t: String(d.turns), b: true }, { t: d.turns === 1 ? ' turn' : ' turns', d: true }])
  if (d.branch) items.push([{ t: `⎇ ${d.branch}` }])
  if (d.changes && d.changes.files > 0) items.push([{ t: String(d.changes.files), b: true }, { t: d.changes.files === 1 ? ' file ' : ' files ', d: true }, { t: `+${d.changes.added}`, c: 'success' }, { t: ' ' }, { t: `−${d.changes.removed}`, c: 'error' }])
  if (d.touched?.length) {
    const edited = d.touched.filter(t => t.edited).length
    items.push([{ t: '✎ ', c: 'claude' }, { t: String(edited), b: true }, { t: ' edited', d: true }, ...(d.touched.length - edited ? [{ t: ` ${d.touched.length - edited} read`, d: true }] : [])])
  }
  sec('head', '▣ TASK', 'claude', [goal, ...settings, ...(modes.length ? [[]] : []), ...flow(items, w)], ph.kind !== 'idle')

  // focus: how far the session has drifted from the task
  const hi = d.drift.score >= DRIFT_AT
  const tone = hi ? 'error' : d.drift.score >= DRIFT_WARN ? 'warning' : 'success'
  sec('focus', `${hi ? '▲' : '◇'} FOCUS`, tone, [
    ...driftGauge(d.drift.score, w),
    ...focusNote(d, w),
    ...(hi ? [[{ t: narrow ? '→ start fresh' : '→ start a fresh session  ·  /helm:prompt to start the next task', c: 'error', b: true }]] : []),
  ])

  // usage: context, the 5h meter and its chart, the week meter, then cost and tokens
  const body: Line[] = []
  if (d.ctx) {
    const p = d.ctx.percent ?? (d.ctx.tokens ? (100 * d.ctx.tokens) / d.ctx.window : 0)
    const cs = d.ctxSeries ?? []
    body.push(meter('context', p / 100, w, level(p), [{ t: `${Math.round(p)}%`, c: level(p), b: true }, ...(d.compactions ? [{ t: ' ' + '⟲'.repeat(Math.min(3, d.compactions)), c: 'suggestion' }] : [])]))
  }
  const limit = (label: string, l: { percentUsed: number; resetsAt?: string | number }) => {
    const r = resetMs(l.resetsAt)
    body.push(meter(label, l.percentUsed / 100, w, level(l.percentUsed), [{ t: `${Math.round(l.percentUsed)}%`, c: level(l.percentUsed), b: true }, { t: r && r > now ? ` ↻${fmtDur(r - now)}` : '', d: true }]))
  }
  const five = d.limits.find(l => /five|5h/i.test(l.kind))
  const fs = d.fiveSeries ?? []
  if (five) limit('5h', five)
  if (five && fs.length >= FIVE_CHART_MIN) {
    const ps = fs.map(x => x.pct), lo = Math.min(...ps), hi = Math.max(...ps)
    if (hi - lo >= FIVE_CHART_SPREAD) for (const row of brailleLine(ps, w, narrow ? 2 : 3, hi, lo)) body.push([{ t: row, c: level(five.percentUsed) }])
  }
  const week = d.limits.find(l => /seven|week|7d/i.test(l.kind))
  if (week) limit('week', week)
  const tk = tokenSplit(d.tokens)
  const tail = [d.cost !== undefined ? `$${d.cost.toFixed(2)}` : '', tk.total > 0 ? [`in ${fmtTok(tk.in)}`, `out ${fmtTok(tk.out)}`].join(narrow ? ' ' : ' · ') : ''].filter(Boolean)
  if (tail.length) body.push([{ t: tail.join(' · '), d: true }])
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


  return out
}

/**
 * The title-tab layout: per section a tab filled in its tone, its meta dim after it, then a rule (a light sweeps it
 * only where work is flowing, and only while a turn runs), then its body indented one column. No side borders.
 */
const TITLE_TONE: Record<string, string> = { claude: 'claude', success: 'success', warning: 'warning', error: 'error', suggestion: 'suggestion', subtle: 'subtle' }
export function layout(secs: Section[], w: number, frame: number, running: boolean): Line[] {
  const out: Line[] = []
  secs.forEach((sec, k) => {
    if (sec.title) {
      const [, ico = '', name = sec.title] = /^(\S+) (.*)$/.exec(sec.title) ?? []
      const head: Line = [{ t: ` ${ico} ${name.toLowerCase()} `, bg: TITLE_TONE[sec.tone], b: true }, ...(sec.meta ? [{ t: ' ' + sec.meta, d: true }] : []), { t: ' ' }]
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
type StepState = { tokens: DeckData['tokens']; agents?: DeckAgent[]; model?: string; effort?: string; delegated?: number }

/**
 * One model step, routed: a sub agent's (it has `agentId`) goes to its own card only; the main loop's sets the
 * model and effort and adds to the session totals. The main totals never include a sub agent's tokens.
 */
export function applyStep<S extends StepState>(s: S, e: { agentId?: string; model: string; effort?: unknown }, u: StepUsage | undefined, now: number, info?: { task?: string; type?: string }): S {
  if (e.agentId) {
    const tokens = u ? u.input_tokens + u.cache_creation_input_tokens + u.output_tokens : 0
    return { ...s, delegated: (s.delegated ?? 0) + tokens, agents: agentStep(s.agents ?? [], e.agentId, { model: e.model, tokens, now, ...info }) }
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

// ── pipeline: you → model → tools, drawn in the pane's free rows ──

export const TEST_RE = /\b(make (test|check)|npm (run )?test|pnpm test|yarn test|bun test|cargo test|pytest|go test|claude plugin test)\b/

/** What the session is doing: the model writing, a tool running, a dialog waiting on the person, or nothing. */
export type Phase = { kind: 'thinking' } | { kind: 'tool'; verb: string; target: string } | { kind: 'waiting' } | { kind: 'idle' }

const GLYPH: Record<string, string> = { reading: '≡', editing: '✎', searching: '⌕', running: '>_', testing: '✔' }

/** The verb and target a tool call shows while it runs, from its name and input. */
export function toolPhase(tool: string, input: Record<string, unknown>): Phase {
  const base = (p: unknown) => String(p ?? '').split('/').slice(-2).join('/')
  if (tool === 'Read') return { kind: 'tool', verb: 'reading', target: base(input.file_path) }
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return { kind: 'tool', verb: 'editing', target: base(input.file_path ?? input.notebook_path) }
  if (tool === 'Grep' || tool === 'Glob') return { kind: 'tool', verb: 'searching', target: String(input.pattern ?? '') }
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '')
    const m = TEST_RE.exec(cmd)
    return m ? { kind: 'tool', verb: 'testing', target: m[0] } : { kind: 'tool', verb: 'running', target: cmd.split('\n')[0]! }
  }
  return { kind: 'tool', verb: 'using', target: tool.replace(/^mcp__/, '').replace(/__/g, ' ') }
}

/** The pipeline's height in rows. */
export const PIPE_ROWS = 3
const PIPE_W = 24
const EFFORT: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 4 }
const PHASE_TONE = { thinking: 'claude', tool: 'suggestion', waiting: 'warning', idle: 'subtle' } as const

/**
 * Three rows, centred: a bar in three thirds (you, model, tools) where the third that has the ball is filled in the
 * phase's colour with its name inside, a blank row, then a label with a spinner. Thinking fills model, a tool fills
 * tools (named by its glyph and verb), waiting fills you with a blinking `?`. Idle is dim and still: it reads no
 * frame. None when it does not fit.
 */
export function pipeline(p: Phase, frame: number, w: number, rows: number, turnTok = 0): Line[] {
  if (rows < PIPE_ROWS || w < PIPE_W) return []
  const k = p.kind
  const n = Math.min(14, Math.floor((w - 2) / 3))
  const tone = PHASE_TONE[k]
  const at = k === 'waiting' ? 0 : k === 'thinking' ? 1 : k === 'tool' ? 2 : -1
  const names = [k === 'waiting' && (frame >> 2) % 2 ? '?' : 'you', 'model', p.kind === 'tool' ? `${GLYPH[p.verb] ?? '·'} ${p.verb}` : 'tools']
  const cell = (s: string) => { const t = [...s].slice(0, n); const l = (n - t.length) >> 1; return ' '.repeat(l) + t.join('') + ' '.repeat(n - t.length - l) }
  const third = (i: number): Seg => (i === at ? { t: cell(names[i]!), bg: tone, b: true } : { t: '▱'.repeat(n), c: 'subtle' })
  const barRow: Line = [third(0), { t: ' ' }, third(1), { t: ' ' }, third(2)]
  const spin = k === 'idle' ? '○' : SPIN[frame % SPIN.length]!
  const label: Line =
    p.kind === 'thinking' ? [{ t: 'thinking', c: 'claude', b: true }, ...(turnTok > 0 ? [{ t: ` · ${fmtTok(turnTok)} this turn`, d: true }] : [])]
    : p.kind === 'tool' ? [{ t: p.verb, c: 'suggestion', b: true }, { t: ' ' + marquee(p.target, Math.max(4, w - 3 - p.verb.length), frame, true) }]
    : p.kind === 'waiting' ? [{ t: 'waiting on you', c: 'warning', b: true }]
    : [{ t: 'idle', c: 'subtle' }, { t: ' · your next prompt', d: true }]
  const centre = (l: Line): Line => { const c = clip(l, w); const pad = (w - len(c)) >> 1; return pad > 0 ? [{ t: ' '.repeat(pad) }, ...c] : c }
  return [centre(barRow), [], centre([{ t: spin + ' ', c: tone }, ...label])]
}

const FEED_ICON: Record<FeedItem['kind'], string> = { find: '⌕', read: '≡', edit: '✎', run: '›', test: '✔', topic: '↯', note: '·' }
/** The live list's age column: `12s`, `4m`, `1h`. */
const AGE_W = 4
const FEED_TONE: Record<string, string> = { good: 'success', bad: 'error', warn: 'warning', dim: 'subtle' }

/**
 * The live list for the free rows, as a timeline: a `live` tab, then the age, a `│` spine and what happened, newest
 * first: running sub agents (`now`), then the feed (finds, reads, edits, runs, tests, notes). Long text scrolls as a carousel while running.
 * None under 3 rows or when there is nothing to list.
 */
export function live(d: Pick<DeckData, 'feed' | 'agents' | 'running'>, w: number, rows: number, frame: number, now: number): Line[] {
  if (rows < 3) return []
  const out: Line[] = []
  for (const a of (d.agents ?? []).filter(a => a.endedAt === undefined)) out.push([{ t: 'now'.padStart(AGE_W), c: 'claude' }, { t: ' │ ', c: 'subtle' }, { t: '⌁ ', c: 'claude', b: true }, { t: marquee(`${a.type ?? 'agent'} · ${a.task}`, Math.max(4, w - AGE_W - 6), frame, d.running), c: 'claude' }])
  for (const f of [...d.feed].reverse()) {
    const age = fmtDur(Math.max(0, now - f.at)).split(' ')[0]!
    const text = f.note ? `${f.text} ${f.note}` : f.text
    out.push([{ t: age.padStart(AGE_W), c: 'subtle' }, { t: ' │ ', c: 'subtle' }, { t: FEED_ICON[f.kind] + ' ', c: f.tone ? FEED_TONE[f.tone] : 'suggestion' }, { t: marquee(text, Math.max(4, w - AGE_W - 6), frame, d.running), d: true }])
  }
  if (!out.length) return []
  const tab: Line = [{ t: ' ● live ', bg: d.running ? 'claude' : 'subtle', b: true }, { t: ' ' }, { t: '─'.repeat(Math.max(0, w - 9)), c: 'subtle' }]
  return [tab, ...out.slice(0, rows - 2).map(l => [{ t: ' ' }, ...l]), []].map(l => clip(l, w))
}

/** Whether the deck opens: on unless stored off for the project. */
export function isDeckOn(stored: unknown): boolean {
  return stored !== false
}

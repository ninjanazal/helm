/**
 * Deck: pure parts (no `$`), so they are unit-tested. The deck is a list of sections; the pane draws each as a
 * native rounded Box (clean in the terminal and the desktop app) with an inverse title chip. While a turn runs a
 * highlight walks from box to box, the spinner turns and a light sweeps the live rule; idle, nothing moves.
 */

export type Seg = { t: string; c?: string; b?: boolean; d?: boolean; inv?: boolean }
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
  atlas?: { files: number; symbols?: number; queries: number; returned: number; avoided: number; on: boolean; state?: string; pending?: number; changed?: number; added?: number; removed?: number; indexedAt?: number; code_files?: number; code_with_symbols?: number; text_files?: number; calls?: number; resolved?: number; lines?: number; db_bytes?: number; langs?: [string, number][] }
  sessionAvoided?: number
  agents?: { name: string; branch: string; ahead: number; dirty: number }[]
  team?: { name: string; model: string; effort: string; status: string; note?: string; startedAt: number }[]
  touched?: { path: string; edited: boolean }[]
  cur?: { seq: string; at: number; tok0: number; doing?: string; target?: string }
  history?: { n: number; seq: string; tok: number; ms: number; result: 'ok' | 'warn' | 'err' | 'none'; text: string }[]
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

function merge(l: Line): Line {
  const out: Line = []
  for (const s of l) {
    const p = out[out.length - 1]
    if (p && p.c === s.c && p.d === s.d && p.b === s.b && p.inv === s.inv) p.t += s.t
    else out.push({ ...s })
  }
  return out
}

const level = (p: number) => (p >= 90 ? 'error' : p >= 70 ? 'warning' : 'suggestion')

/** A light sweeping along a rule while running; a plain dim rule when idle. */
export function rule(w: number, phase: number | undefined): Line {
  const pos = phase === undefined ? -9 : phase % (w + 6)
  const out: Line = []
  for (let i = 0; i < w; i++) out.push(Math.abs(i - pos) < 3 ? { t: '━', c: 'claude', b: true } : { t: '─', d: true })
  return merge(out)
}

export type Section = { id: string; title: string; tone: string; body: Line[]; lit: boolean }

/** Label column + bar + value, all rows aligned. */
const DRIFT_WARN = 0.5
const zone = (p: number) => (p >= DRIFT_AT ? 'error' : p >= DRIFT_WARN ? 'warning' : 'success')
export const driftWord = (p: number) => (p >= DRIFT_AT ? 'start fresh' : p >= DRIFT_WARN ? 'drifting' : 'on task')

/**
 * The drift gauge: filled cells take the colour of the zone they sit in (green, then amber from 0.50, red from
 * 0.70), so the bar shows how far into each zone it is; a word says what that means, a scale marks the zones.
 */
export function driftGauge(p: number, w: number): Line[] {
  const VW = 17
  const bw = Math.max(10, w - 9 - VW)
  const full = Math.round(Math.max(0, Math.min(1, p)) * bw)
  const cells: Line = [{ t: 'focus'.padEnd(8), d: true }]
  for (let i = 0; i < bw; i++) cells.push(i < full ? { t: '▆', c: zone((i + 0.5) / bw) } : { t: '▆', c: 'subtle' })
  cells.push({ t: ' ' }, ...padTo([{ t: p.toFixed(2), c: zone(p), b: true }, { t: ' ' + driftWord(p), c: zone(p) }], VW))
  const scale = Array<string>(bw).fill(' ')
  const put = (at: number, txt: string) => [...txt].forEach((ch, k) => { const x = Math.round(at * bw) + k; if (x < bw) scale[x] = ch })
  put(0, 'on task')
  put(DRIFT_WARN, '│drifting')
  put(DRIFT_AT, '│fresh')
  const sc: Line = [{ t: ' '.repeat(8) }]
  scale.forEach((ch, i) => sc.push({ t: ch, c: zone(i / bw), d: ch === '│' }))
  return [merge(cells), merge(sc)]
}

/** Every meter has the same bar length: a fixed value column of VALUE_W, so bars start and end together. */
const VALUE_W = 14
function meter(label: string, p: number, w: number, c: string, value: Line, mark?: number): Line {
  return [{ t: label.padEnd(8), d: true }, ...bar(p, Math.max(6, w - 8 - 1 - VALUE_W), c, mark), { t: ' ' }, ...padTo(value, VALUE_W)]
}

/** The deck as sections. `w` is the text width inside a box. */
/** helm agents in `git worktree list --porcelain` output: worktrees on a helm/* branch, in a folder other than the first (the main tree). */
export function parseWorktrees(out: string): { name: string; path: string; branch: string }[] {
  return out.split('\n\n').slice(1).flatMap(block => {
    const path = /^worktree (.+)$/m.exec(block)?.[1]
    const branch = /^branch refs\/heads\/(helm\/.+)$/m.exec(block)?.[1]
    return path && branch ? [{ name: branch.slice(5), path, branch }] : []
  })
}

/** Team members and helm worktrees by name: members first (launch order), then worktrees no member claims. */
export function teamRows(d: Pick<DeckData, 'team' | 'agents'>) {
  const wt = new Map((d.agents ?? []).map(a => [a.name, a]))
  const rows = (d.team ?? []).map(m => ({ ...m, ahead: wt.get(m.name)?.ahead, dirty: wt.get(m.name)?.dirty }))
  for (const a of d.agents ?? []) if (!rows.some(r => r.name === a.name)) rows.push({ name: a.name, model: '', effort: '', status: '', startedAt: undefined as unknown as number, ahead: a.ahead, dirty: a.dirty })
  return rows
}

export function deck(d: DeckData, w: number, frame: number, now: number): Section[] {
  const out: Section[] = []
  const order = ['task', 'drift', 'session', 'saved', 'live']
  const litId = d.running ? order[Math.floor(frame / 6) % order.length] : undefined
  const sec = (id: string, title: string, tone: string, body: Line[]) => out.push({ id, title, tone, body: body.map(l => clip(l, w)), lit: id === litId })

  // task
  const spin: Seg = d.running ? { t: SPIN[frame % SPIN.length]!, c: 'claude', b: true } : d.task ? { t: '✔', c: 'success' } : { t: '·', d: true }
  const meta = [d.taskAt ? fmtDur(now - d.taskAt) : '', `${d.turns} turn${d.turns === 1 ? '' : 's'}`, [d.model, d.effort].filter(Boolean).join(' · ')].filter(Boolean)
  const line2: Line = [{ t: meta.join('  ·  '), d: true }]
  if (d.branch) line2.push({ t: `  ·  ⎇ ${d.branch}`, d: true }, ...(d.dirty ? [{ t: ` ±${d.dirty}`, c: 'warning' }] : []))
  const line3: Line = []
  if (d.tests) line3.push(d.tests.ok ? { t: `✔ ${d.tests.text}`, c: 'success' } : { t: `✘ ${d.tests.text}`, c: 'error' }, { t: `  ${fmtDur(now - d.tests.at)} ago`, d: true })
  sec('task', '◆ TASK', 'claude', [
    [spin, { t: ' ' }, d.task ? { t: d.task, b: true } : { t: 'your next prompt becomes the task', d: true }],
    line2,
    ...(line3.length ? [line3] : []),
  ])

  // team: the agents this session launched (team.json) joined with their worktrees, one line each
  const team = teamRows(d)
  if (team.length) {
    const tone: Record<string, string> = { working: 'claude', blocked: 'warning', done: 'success' }
    out.push({ id: 'team', title: '⎇ TEAM', tone: team.some(r => r.status === 'blocked') ? 'warning' : 'suggestion', lit: team.some(r => r.status === 'blocked' || r.status === 'done'), body: team.map((r): Line => clip([
      { t: r.name, b: true },
      ...(r.model ? [{ t: `  ${r.model}·${r.effort}`, d: true }] : []),
      ...(r.status ? [{ t: `  ${r.status}`, ...(tone[r.status] ? { c: tone[r.status] } : { d: true }), b: r.status === 'blocked' }] : []),
      ...(r.startedAt !== undefined ? [{ t: `  ${fmtDur(now - r.startedAt)}`, d: true }] : []),
      ...(r.ahead ? [{ t: `  +${r.ahead}`, c: 'success' }] : []),
      ...(r.dirty ? [{ t: ` ±${r.dirty}`, c: 'warning' }] : []),
      ...(r.note ? [{ t: `  ${r.note}`, d: true }] : []),
    ], w)) })
  }

  // drift
  const hi = d.drift.score >= DRIFT_AT
  const tone = hi ? 'error' : d.drift.score >= 0.5 ? 'warning' : 'success'
  sec('drift', hi ? '▲ DRIFT' : '◇ DRIFT', tone, [
    ...driftGauge(d.drift.score, w),
    [{ t: 'context ', d: true }, { t: d.drift.ctx.toFixed(2) }, { t: '   topic ', d: true }, { t: d.drift.topic.toFixed(2) }, { t: '   turns ', d: true }, { t: d.drift.turns.toFixed(2) }],
    hi ? [{ t: '→ start a fresh session  ·  /helm:deck task to re-anchor', c: 'error', b: true }] : [{ t: `fresh session suggested at ${DRIFT_AT.toFixed(2)}`, d: true }],
  ])

  // session
  const body: Line[] = []
  if (d.ctx) {
    const p = d.ctx.percent ?? (d.ctx.tokens ? (100 * d.ctx.tokens) / d.ctx.window : 0)
    body.push(meter('context', p / 100, w, level(p), [{ t: `${Math.round(p)}%`, c: level(p), b: true }, ...(d.compactions ? [{ t: ' ' + '⟲'.repeat(Math.min(3, d.compactions)), c: 'suggestion' }] : [])]))
  }
  const five = d.limits.find(l => /five|5h/i.test(l.kind))
  if (five) {
    const r = resetMs(five.resetsAt)
    body.push(meter('5h', five.percentUsed / 100, w, level(five.percentUsed), [{ t: `${Math.round(five.percentUsed)}%`, c: level(five.percentUsed), b: true }, { t: r && r > now ? ` ↻ ${fmtDur(r - now)}` : '', d: true }]))
  }
  const week = d.limits.find(l => /seven|week|7d/i.test(l.kind))
  if (week) body.push(meter('week', week.percentUsed / 100, w, level(week.percentUsed), [{ t: `${Math.round(week.percentUsed)}%`, b: true }]))
  const tk = d.tokens
  const split = tokenSplit(tk)
  const total = split.total
  const figures: Line = []
  const fig = (label: string, value: string, c?: string) => figures.push(...(figures.length ? [{ t: '   ', d: true }] : []), { t: label + ' ', d: true }, { t: value, c, b: true })
  if (d.cost !== undefined) fig('cost', `$${d.cost.toFixed(2)}`)
  const cacheBase = tk.input + tk.cacheRead + tk.cacheWrite
  if (cacheBase > 0) fig('cache', `${Math.round((100 * tk.cacheRead) / cacheBase)}%`, tk.cacheRead / cacheBase > 0.7 ? 'success' : 'warning')
  if (figures.length || total > 0) body.push([])
  if (total > 0) body.push([{ t: 'tokens ', d: true }, { t: fmtTok(total), b: true }, { t: '   in ', d: true }, { t: fmtTok(split.in), b: true }, { t: '   out ', d: true }, { t: fmtTok(split.out), b: true }])
  if (figures.length) body.push(figures)
  if (body.length) sec('session', '◷ SESSION', 'suggestion', body)

  // saved
  if (d.atlas) {
    const avoided = d.sessionAvoided ?? 0
    sec('saved', '↓ SAVED BY ATLAS', 'success', [
      [{ t: fmtTok(avoided), c: 'success', b: true }, { t: ' tokens this session', d: true }, ...(total > 0 && avoided ? [{ t: `  ·  ${Math.round((100 * avoided) / (total + avoided))}% less`, c: 'success' }] : [])],
      [{ t: `${fmtTok(d.atlas.avoided)} all time  ·  ${d.atlas.queries} lookups  ·  ${d.atlas.files} files indexed`, d: true }],
    ])
  }

  // atlas: index state, size and coverage, then the files this session touched as a small tree
  if (d.atlas || d.touched?.length) {
    const byDir = new Map<string, { name: string; edited: boolean }[]>()
    for (const t of (d.touched ?? []).slice(-12)) {
      const k = t.path.lastIndexOf('/')
      const dir = k < 0 ? './' : t.path.slice(0, k + 1)
      const list = byDir.get(dir) ?? []
      const name = t.path.slice(k + 1)
      const had = list.find(x => x.name === name)
      if (had) had.edited ||= t.edited
      else list.push({ name, edited: t.edited })
      byDir.set(dir, list)
    }
    const map: Line[] = []
    if (d.atlas) map.push(atlasState(d.atlas, now), ...atlasDetail(d.atlas, now), ...atlasCoverage(d.atlas, w))
    if (d.atlas && d.touched?.length) map.push([])
    for (const [dir, files] of [...byDir].slice(-4)) {
      map.push([{ t: dir, c: 'suggestion', b: true }])
      files.slice(-4).forEach((f, i, a) => map.push([{ t: i === a.length - 1 ? '└ ' : '├ ', d: true }, { t: f.name, c: f.edited ? 'claude' : undefined, d: !f.edited }, ...(f.edited ? [{ t: ' ✎', c: 'claude' }] : [])]))
    }
    sec('map', '⌘ ATLAS', d.atlas?.state === 'stale' || d.atlas?.state === 'missing' ? 'warning' : 'suggestion', map)
  }

  // live: what the current turn is doing, its tool mix, and how recent turns ended
  const TOOL: Record<string, [string, string]> = { r: ['read', 'suggestion'], e: ['edit', 'claude'], f: ['find', 'success'], t: ['test', 'warning'], x: ['run', 'subtle'] }
  const RES: Record<string, [string, string]> = { ok: ['✔', 'success'], warn: ['⚠', 'warning'], err: ['✘', 'error'], none: ['·', 'subtle'] }
  const hist = d.history ?? []
  const last = hist[hist.length - 1]
  const live: Line[] = []
  const cur = d.cur
  if (d.running && cur) live.push([{ t: SPIN[frame % SPIN.length]!, c: 'claude', b: true }, { t: ' ' }, { t: cur.doing ?? 'thinking', c: 'claude', b: true }, ...(cur.target ? [{ t: ' ' + cur.target, b: true }] : [])])
  else if (last) live.push([{ t: '✔', c: 'success', b: true }, { t: ' idle', d: true }, { t: ` · turn ${last.n} finished`, d: true }])
  else live.push([{ t: 'waiting for the first turn', d: true }])
  const seq = d.running ? cur?.seq ?? '' : last?.seq ?? cur?.seq ?? ''
  const tok = d.running && cur ? total - cur.tok0 : last?.tok ?? 0
  const ms = d.running && cur ? now - cur.at : last?.ms ?? 0
  const counts = Object.keys(TOOL).map(k => [k, [...seq].filter(x => x === k).length] as const).filter(x => x[1] > 0)
  const bw = Math.max(10, w - 14)
  const mix: Line = []
  if (!seq) mix.push({ t: '▆'.repeat(bw), c: 'subtle' })
  else {
    let used = 0
    counts.forEach(([k, n], i) => {
      const cw = i === counts.length - 1 ? bw - used : Math.max(1, Math.round((n / seq.length) * bw))
      used += cw
      mix.push({ t: '▆'.repeat(Math.max(0, cw)), c: TOOL[k]![1] })
    })
  }
  if (seq || d.running) {
    live.push([], [...mix, { t: '  ' }, { t: fmtTok(Math.max(0, tok)), b: true }, { t: ' ' + (ms < 60000 ? `${Math.round(ms / 1000)}s` : fmtDur(ms)), d: true }])
    if (counts.length) live.push(counts.flatMap(([k, n], i) => [...(i ? [{ t: '  ' }] : []), { t: '■', c: TOOL[k]![1] }, { t: ` ${TOOL[k]![0]} ${n}`, d: true }]))
    else live.push([{ t: 'no tools yet this turn', d: true }])
  }
  if (hist.length) {
    const chips: Line = [{ t: 'last turns  ', d: true }]
    for (const h of hist.slice(-6)) chips.push({ t: ` ${RES[h.result]![0]} `, c: RES[h.result]![1], inv: true, b: true }, { t: ' ' })
    if (d.running) chips.push({ t: ` ${SPIN[frame % SPIN.length]} `, c: 'claude', inv: true, b: true })
    live.push([], chips)
    for (const h of hist.slice(-3).reverse()) live.push([{ t: `  #${h.n} `, b: true }, { t: `${RES[h.result]![0]} ${h.text}`, c: RES[h.result]![1] }, { t: ` · ${fmtTok(h.tok)}`, d: true }])
  }
  sec('live', '⇣ LIVE', 'subtle', live)
  return out
}

/**
 * The open layout: per section a coloured title, then a rule a light sweeps across while a turn runs (each
 * section's light offset so they ripple down), then its body indented one column. No boxes.
 */
const TITLE_TONE: Record<string, string> = { claude: 'claude', success: 'success', warning: 'warning', error: 'error', suggestion: 'suggestion', subtle: 'subtle' }
export function layout(secs: Section[], w: number, frame: number, running: boolean): Line[] {
  const out: Line[] = []
  secs.forEach((sec, k) => {
    const [, ico = '', name = sec.title] = /^(\S+) (.*)$/.exec(sec.title) ?? []
    // The section being updated gets a pulsing dot in place of its icon while a turn runs.
    const live = running && sec.lit
    const dot: Seg = live ? { t: frame % 6 < 3 ? '●' : '○', c: 'claude', b: true } : { t: ico, c: TITLE_TONE[sec.tone], b: true }
    const head: Line = [dot, { t: ' ' + name.toLowerCase(), c: live ? 'claude' : TITLE_TONE[sec.tone], b: true }, { t: ' ' }]
    out.push([...head, ...rule(Math.max(4, w - len(head)), running ? frame * 2 - k * 9 : undefined)])
    for (const l of sec.body) out.push([{ t: ' ' }, ...l])
    out.push([])
  })
  out.push([{ t: ' ' }, ...FOOTER])
  return out.map(l => clip(l, w))
}

/** fresh: index size; stale: how many files changed and that the next lookup reindexes; missing: how to build it. */
export function atlasState(a: NonNullable<DeckData['atlas']>, now = 0): Line {
  if (a.state === 'missing') return [{ t: ' ⚠ NO INDEX ', c: 'warning', inv: true, b: true }, { t: ' atlas has not indexed this repo', c: 'warning' }]
  if (a.state === 'stale' && a.pending) return [{ t: ' ⚠ NEEDS REFRESH ', c: 'warning', inv: true, b: true }, { t: ` ${a.pending} file${a.pending === 1 ? '' : 's'} out of date`, c: 'warning', b: true }]
  const age = a.indexedAt && now ? ` · indexed ${fmtDur(now - a.indexedAt)} ago` : ''
  return [{ t: '● ', c: 'success' }, { t: 'up to date', c: 'success' }, { t: age || ` · ${a.files} files`, d: true }]
}

/** The lines under a stale/missing state: what changed and exactly what to run. */
const LANG_TONE = ['suggestion', 'claude', 'success', 'warning', 'error', 'subtle']
const fmtBytes = (b: number) => (b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} kB` : `${b} B`)

/** Size, coverage and the language split of the index. Lines appear only for the figures atlas reported. */
export function atlasCoverage(a: NonNullable<DeckData['atlas']>, w: number): Line[] {
  const out: Line[] = []
  const size = [`${a.files} files`, a.lines ? `${fmtTok(a.lines)} lines` : '', a.symbols ? `${a.symbols} symbols` : '', a.db_bytes ? fmtBytes(a.db_bytes) : ''].filter(Boolean)
  out.push([{ t: size.join(' · '), d: true }])
  if (a.code_files) {
    const p = (a.code_with_symbols ?? 0) / a.code_files
    out.push(meter('parsed', p, w, p >= 0.9 ? 'success' : 'warning', [{ t: `${Math.round(p * 100)}%`, b: true }, { t: ` ${a.code_with_symbols}/${a.code_files}`, d: true }]))
  }
  if (a.calls) {
    const p = (a.resolved ?? 0) / a.calls
    out.push(meter('linked', p, w, 'suggestion', [{ t: `${Math.round(p * 100)}%`, b: true }, { t: ' of calls', d: true }]))
  }
  if (a.langs?.length) {
    const total = a.langs.reduce((x, l) => x + l[1], 0)
    const bw = Math.max(10, w - 9 - 14)
    const mix: Line = [{ t: 'langs'.padEnd(8), d: true }]
    let used = 0
    a.langs.forEach(([, n], i) => {
      const cw = i === a.langs!.length - 1 ? bw - used : Math.max(1, Math.round((n / total) * bw))
      used += cw
      mix.push({ t: '▆'.repeat(Math.max(0, cw)), c: LANG_TONE[i % LANG_TONE.length] })
    })
    out.push(mix)
    out.push([{ t: ' '.repeat(8) }, ...a.langs.slice(0, 4).flatMap(([l, n], i) => [...(i ? [{ t: '  ' }] : []), { t: '■', c: LANG_TONE[i] }, { t: ` ${l} ${n}`, d: true }])])
  }
  return out
}

export function atlasDetail(a: NonNullable<DeckData['atlas']>, now = 0): Line[] {
  if (a.state === 'missing') return [[{ t: '→ run ', d: true }, { t: 'make index', c: 'warning', b: true }, { t: '  (or any atlas lookup builds it)', d: true }]]
  if (a.state !== 'stale' || !a.pending) return []
  const parts = [a.changed ? `${a.changed} changed` : '', a.added ? `${a.added} new` : '', a.removed ? `${a.removed} deleted` : ''].filter(Boolean).join(' · ')
  const age = a.indexedAt && now ? `last indexed ${fmtDur(now - a.indexedAt)} ago` : ''
  return [
    [{ t: [parts, age].filter(Boolean).join('  ·  '), d: true }],
    [{ t: '→ run ', d: true }, { t: 'make index', c: 'warning', b: true }, { t: '  or it refreshes on the next atlas lookup', d: true }],
  ]
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

export const FOOTER: Line = [{ t: '/helm:deck task <text>  ·  /helm:deck reset  ·  /helm:prompt', d: true }]
export const PANE_FRAME_MS = 120

/** Whether the deck opens: on unless stored off for the project. Agent sessions (/helm:agent tabs) follow the same setting. */
export function isDeckOn(stored: unknown): boolean {
  return stored !== false
}

/** The goal line of .claude/helm/task.md (`# <goal>`), which anchors an agent session's deck. */
export function taskGoal(text: string | undefined): string | undefined {
  const m = /^# (.+)$/m.exec(text ?? '')
  return m?.[1]?.trim() || undefined
}

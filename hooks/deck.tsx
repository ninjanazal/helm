import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { DRIFT_AT, PANE_FRAME_MS, addCtx, addFive, agentDone, applyStep, applyTodo, deck, drift, isDeckOn, layout, terms, tokenSplit, topicShift, verdict } from './deck-core'
import type { DeckData, FeedItem, StepUsage } from './deck-core'
import type { DeckCheck, DeckDone, DeckState } from '../types'

/**
 * The deck pane: the session's health beside the chat. Every figure comes from the engine (session.measure,
 * $.session.usage, turn.step usage, session.compact, tool.call) or git; nothing is invented.
 * It animates only while a turn runs.
 */

const PANE = 'helm-deck'
const blank = (): DeckState => ({ turns: 0, compactions: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, feed: [], recent: [], taskTerms: [] })
const state_ = atom({ plugin: 'helm', key: 'deck' } as const, blank(), { shape: 'deck-1' })
const frame = atom({ plugin: 'helm', key: 'deckFrame' } as const, 0)

let running = false
let tickGen = 0
/** Off (/helm:switch off): no auto-open, no reopen after /clear, no polling. */
let deckIsOn = true
/** helm as a whole is on: lean mode follows the deck's switch. */
export const helmIsOn = () => deckIsOn
let deckKey: string | undefined

/** Per-project store key for the on/off choice, pinned to the launch directory. */
async function onKey($: EngineInterface): Promise<string> {
  if (!deckKey) deckKey = `deckOn:${(await $.session.cwd().catch(() => '')) || 'default'}`
  return deckKey
}

function set($: EngineInterface, fn: (s: DeckState) => DeckState) {
  return update($, state_, fn)
}
const quiet = async (fn: () => Promise<unknown>) => { try { await fn() } catch { /* display only */ } }

function addFeed(s: DeckState, f: Omit<FeedItem, 'at'>, at: number): DeckState {
  return { ...s, feed: [...s.feed, { ...f, at }].slice(-20) }
}

const TEST_RE = /\b(make (test|check)|npm (run )?test|pnpm test|yarn test|bun test|cargo test|pytest|go test|claude plugin test)\b/

let polls = 0
async function poll($: EngineInterface) {
  const cwd = await $.session.cwd().catch(() => undefined)
  // what fills the context: the /context summary (local estimates), every 30s rather than every poll
  if (polls++ % 6 === 0) {
    await quiet(async () => {
      const b = (await $.session.usage({ breakdown: 'summary' })).context.breakdown
      if (!b) return
      const parts = b.categories.filter(c => c.kind === 'used' && c.tokens > 0).map(c => ({ name: c.name, tokens: c.tokens })).sort((x, y) => y.tokens - x.tokens)
      await set($, s => ({ ...s, ctxParts: parts }))
    })
  }
  const opts = cwd ? { cwd, timeoutMs: 3000 } : { timeoutMs: 3000 }
  await quiet(async () => {
    const u = await $.session.usage()
    await set($, s => ({ ...s, ctx: u.context, limits: (u.rateLimits ?? []).map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })), cost: u.cost?.usd, startedAt: u.startedAt }))
  })
  await quiet(async () => {
    const r = await $.process.run(['git', 'status', '--porcelain', '-b'], opts)
    if (r.exitCode !== 0) return
    const lines = String(r.stdout).split('\n').filter(Boolean)
    const branch = lines[0]?.replace(/^## /, '').split('...')[0]
    await set($, s => ({ ...s, branch, dirty: lines.length - 1 }))
  })
}

const ctxPct = (s: DeckState) => s.ctx?.percent ?? (s.ctx?.tokens ? (100 * s.ctx.tokens) / s.ctx.window : 0)

function view(s: DeckState): DeckData {
  const pct = ctxPct(s)
  const recent = new Set(s.recent.flat())
  return {
    ...s,
    limits: s.limits ?? [],
    drift: drift(pct, topicShift(new Set(s.taskTerms), recent), s.turns),
    running,
  }
}

export const registerDeck: Register = on => {

  on('turn.start', async ($, e, next) => {
    if (!(e as { agentId?: string }).agentId) {
      running = true
      const now = await $.clock.now()
      await quiet(() => set($, s => ({ ...s, curDone: false, ask: undefined, cur: { ask: s.ask, cost0: s.cost, seq: '', at: now, tok0: totalTok(s), whole: 0, edits: 0 } })))
    }
    return next(e)
  })




  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      const now = await $.clock.now()
      await quiet(() => set($, s => addFeed({ ...s, compactions: s.compactions + 1 }, { kind: 'note', text: `context compacted (${e.trigger})`, tone: 'warn' }, now)))
    }
    return r
  })


  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, state_)
    const f = await read($, frame)
    const cols = e.props.bodyColumns
    const w = Math.max(24, cols - 2)
    const lines = layout(deck(view(s), w - 1, f, await $.clock.now()), w, f, running)
    return (
      <Box flexDirection="column" width={cols} paddingX={1}>
        {lines.map((l, i) => (
          <Text key={`d${i}`} wrap="truncate-end">
            {l.length ? l.map((x, j) => <Text key={`d${i}s${j}`} color={x.c} weight={x.b ? 'bold' : undefined} dimColor={x.d} >{x.t}</Text>) : ' '}
          </Text>
        ))}
      </Box>
    )
  })
}

// ── called from register.tsx's own hooks (the engine allows one unmatched hook per event per plugin) ──

export async function deckStart($: EngineInterface) {
  let stored: unknown
  await quiet(async () => { stored = await $.store.get(await onKey($)) })
  deckIsOn = isDeckOn(stored)
  // /clear and /new fire session.start again: only the newest registration's timers do work.
  const gen = ++tickGen
  $.clock.every(PANE_FRAME_MS, () => void (gen === tickGen && deckIsOn && running && quiet(() => update($, frame, f => f + 1))))
  $.clock.every(5000, () => void (gen === tickGen && deckIsOn && quiet(() => poll($))))
  // /clear's reset closes panes after session.start returns, so an open right after next(e) can be undone:
  // reopen a few times once the session has settled (opening an open pane is a no-op).
  let reopens = 0
  $.clock.every(600, () => void (gen === tickGen && reopens++ < 4 && deckOpen($)))
  if (deckIsOn) void poll($)
}

/** Opens the deck once the session has settled: opened before next(e), /clear's reset closes it again. */
export function deckOpen($: EngineInterface) {
  if (!deckIsOn) return
  void quiet(async () => {
    const r = await $.ui.open({ id: PANE, title: 'Deck' })
    if (r?.isPlaced) reopenPending = false
  })
}

/** Set by /clear until the deck is drawn again; the next prompt retries if the timer could not. */
let reopenPending = false

/**
 * /clear ends the session (session.end, reason 'clear') and no session.start follows, so deckStart's reopen
 * never runs for it. Reopen from here, now and a few times once the cleared session has settled.
 */
export function deckCleared($: EngineInterface) {
  if (!deckIsOn) return
  reopenPending = true
  const gen = tickGen
  let n = 0
  deckOpen($)
  $.clock.every(600, () => void (gen === tickGen && reopenPending && n++ < 8 && deckOpen($)))
}

export async function deckPrompt($: EngineInterface, e: { text: string; isMeta?: true; command?: unknown }) {
  if (reopenPending) deckOpen($)
  await quiet(async () => {
    if (e.isMeta) return
    // the next turn's receipt names what was asked: the first line, commands included
    const ask = e.text.trim().split('\n')[0]!.replace(/\s+/g, ' ').slice(0, 60)
    await set($, s => ({ ...s, ask }))
    if (e.command || e.text.trim().startsWith('/')) return
    const now = await $.clock.now()
    const t = [...terms(e.text)]
    await set($, s => {
      if (!s.task) return { ...s, task: e.text.trim().split('\n')[0]!.slice(0, 80), taskAt: now, taskTerms: t, recent: [] }
      const recent = [...s.recent, t].slice(-3)
      const before = topicShift(new Set(s.taskTerms), new Set(s.recent.flat()))
      const after = topicShift(new Set(s.taskTerms), new Set(recent.flat()))
      const s2 = { ...s, recent }
      return after - before > 0.25 && after > 0.6 ? addFeed(s2, { kind: 'topic', text: e.text.trim().slice(0, 40), tone: 'warn' }, now) : s2
    })
  })
}

const totalTok = (s: DeckState) => tokenSplit(s.tokens).total

export async function deckTurnDone($: EngineInterface, e: { agentId?: string }) {
  if (e.agentId) {
    const at = await $.clock.now()
    await quiet(() => set($, s => ({ ...s, agents: agentDone(s.agents ?? [], e.agentId!, at) })))
    return
  }
  running = false
  const now = await $.clock.now()
  // the cost now, so the turn's share is its own (the 5s poll may lag)
  const cost = await $.session.usage().then(u => u.cost?.usd).catch(() => undefined)
  await quiet(() => set($, s => {
    const n = s.turns + 1
    if (!s.cur) return { ...s, turns: n, cost: cost ?? s.cost, ctxSeries: addCtx(s.ctxSeries, ctxPct(s)) }
    const spent = cost !== undefined && s.cur.cost0 !== undefined ? Math.max(0, cost - s.cur.cost0) : undefined
    const done: DeckDone = { n, seq: s.cur.seq, tok: totalTok(s) - s.cur.tok0, ms: now - s.cur.at, ...verdict(s.cur), ask: s.cur.ask, cost: spent }
    return { ...s, turns: n, cost: cost ?? s.cost, curDone: true, history: [...(s.history ?? []), done].slice(-8), ctxSeries: addCtx(s.ctxSeries, ctxPct(s)) }
  }))
  await quiet(() => update($, frame, f => f + 1))
}

/** A sub agent's step: counted on its own card, never in the main-session totals (see applyStep). */
async function agentStep($: EngineInterface, e: { agentId?: string; model: string }, u: StepUsage | undefined) {
  const now = await $.clock.now()
  // ask the engine for its task until the card has one (the list may not hold a just-spawned agent yet)
  const known = ((await read($, state_)).agents ?? []).some(a => a.id === e.agentId && a.task)
  const info = known ? undefined : await $.agent.list().then(l => l.find(a => a.id === e.agentId)).catch(() => undefined)
  await set($, s => applyStep(s, e, u, now, info && { task: info.description, type: info.type }))
}

export async function deckStep($: EngineInterface, e: { agentId?: string; model: string; effort?: unknown }, u: StepUsage | undefined) {
  if (e.agentId) return quiet(() => agentStep($, e, u))
  await quiet(async () => {
    const now = await $.clock.now()
    await set($, s => applyStep(s, e, u, now))
  })
}

export async function deckMeasure($: EngineInterface, e: { context: DeckState['ctx']; rateLimits?: unknown }) {
  const rl = Array.isArray(e.rateLimits) ? (e.rateLimits as { kind: string; percentUsed: number; resetsAt?: string }[]) : []
  const at = await $.clock.now()
  await quiet(() => set($, s => {
    const l = rl.find(r => /five|5h/i.test(r.kind))
    return { ...s, ctx: e.context, limits: rl.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })), ...addFive(s.fiveSeries, s.fiveAt, l?.percentUsed, l?.resetsAt, at) }
  }))
}

export async function deckTool($: EngineInterface, e: { tool: string; agentId?: string }, r: unknown) {
  await quiet(async () => {
    if ((e as { agentId?: string }).agentId) return
    const now = await $.clock.now()
    const a = e as unknown as Record<string, unknown>
    const input = (a.input ?? a) as Record<string, unknown>
    const err = !!(r as { isError?: boolean }).isError
    const base = (p: unknown) => String(p ?? '').split('/').slice(-2).join('/')
    let f: Omit<FeedItem, 'at'> | undefined
    const tool = e.tool
    if (tool === 'Read') {
      const ranged = input.offset !== undefined || input.limit !== undefined
      f = { kind: 'read', text: base(input.file_path), note: ranged ? 'range' : 'whole file', tone: ranged ? 'dim' : 'warn' }
    } else if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
      f = { kind: 'edit', text: base(input.file_path ?? input.notebook_path), note: err ? 'failed' : undefined, tone: err ? 'bad' : undefined }
    } else if (tool === 'Grep' || tool === 'Glob') {
      f = { kind: 'find', text: `${tool.toLowerCase()} ${String(input.pattern ?? '')}`.slice(0, 40), tone: 'dim' }
    } else if (tool === 'Bash') {
      const cmd = String(input.command ?? '')
      if (TEST_RE.test(cmd)) {
        const m = TEST_RE.exec(cmd)![0]
        await set($, s => ({ ...s, tests: { ok: !err, text: m, at: now } }))
        f = { kind: 'test', text: m, note: err ? 'failed' : 'passed', tone: err ? 'bad' : 'good' }
      } else f = { kind: 'run', text: cmd.split('\n')[0]!.slice(0, 40), note: err ? 'exit≠0' : undefined, tone: err ? 'bad' : undefined }
    } else if (tool === 'TodoWrite' || tool === 'TaskCreate' || tool === 'TaskUpdate') {
      if (!err) await set($, s => ({ ...s, todos: applyTodo(s.todos ?? [], tool, input, JSON.stringify(r)) }))
    } else if (tool === 'Agent' || tool === 'Task') {
      f = { kind: 'note', text: `agent: ${String(input.description ?? '')}`.slice(0, 40) }
    }
    const fp = String(input.file_path ?? input.notebook_path ?? '')
    if (fp && (tool === 'Read' || tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit')) {
      const cwd = (await $.session.cwd().catch(() => '')) ?? ''
      const rel = cwd && fp.startsWith(cwd + '/') ? fp.slice(cwd.length + 1) : fp.split('/').slice(-3).join('/')
      const edited = tool !== 'Read' && !err
      await set($, s => {
        const prev = s.touched ?? []
        const was = prev.find(x => x.path === rel)?.edited ?? false
        return { ...s, touched: [...prev.filter(x => x.path !== rel), { path: rel, edited: edited || was }].slice(-30) }
      })
    }
    if (f) await set($, s => addFeed(s, f!, now))
    if (f && f.kind !== 'topic' && f.kind !== 'note') {
      // A tool call means a turn is running, even if its turn.start was missed (e.g. a reload mid-turn).
      if (!running) running = true
      await set($, s => (s.cur && !s.curDone ? s : { ...s, curDone: false, cur: { seq: '', at: now, tok0: totalTok(s), whole: 0, edits: 0 } }))
      const k = f.kind
      const letter = { find: 'f', read: 'r', edit: 'e', test: 't', run: 'x' }[k]
      const verb = { find: 'searching', read: 'reading', edit: 'editing', test: 'testing', run: 'running' }[k]
      await set($, s => (s.cur ? {
        ...s,
        cur: {
          ...s.cur,
          seq: (s.cur.seq + letter).slice(-200),
          doing: verb,
          target: f!.text,
          whole: s.cur.whole + (k === 'read' && f!.note === 'whole file' ? 1 : 0),
          edits: s.cur.edits + (k === 'edit' && !err ? 1 : 0),
          tests: k === 'test' ? !err : s.cur.tests,
        },
      } : s))
    }
  })
}

// ── the helm deck tool's actions ──

/** Turns the deck on or off for this project (remembered) and opens or closes the pane. */
export async function deckSet($: EngineInterface, isOn: boolean): Promise<string> {
  deckIsOn = isOn
  await quiet(async () => $.store.set(await onKey($), isOn))
  if (isOn) {
    await quiet(async () => { await $.ui.open({ id: PANE, title: 'Deck' }) })
    void poll($)
    return 'Deck on.'
  }
  reopenPending = false
  await quiet(async () => { await $.ui.close({ id: PANE }) })
  return 'Deck off.'
}

/** Opens the pane now; an off deck is turned on. */
export async function deckOpenNow($: EngineInterface): Promise<string> {
  if (!deckIsOn) await deckSet($, true)
  else {
    await quiet(async () => { await $.ui.open({ id: PANE, title: 'Deck' }) })
    void poll($)
  }
  return 'Deck opened.'
}

/** Re-anchors the task: drift and turn counts start again from it. */
export async function deckTask($: EngineInterface, text: string): Promise<string> {
  const now = await $.clock.now()
  await set($, s => ({ ...s, task: text.slice(0, 80), taskAt: now, taskTerms: [...terms(text)], recent: [], turns: 0, checks: undefined }))
  return `Deck task set: ${text}`
}

/** Loads the approved prompt's acceptance items as the deck's checks (set_task calls it after deckTask). */
export async function deckChecks($: EngineInterface, checks: DeckCheck[]): Promise<void> {
  await set($, s => ({ ...s, checks: checks.length ? checks : undefined }))
}

/** Marks check `n` (1-based) todo, working or done. Answers what changed, or an error for a bad n or state. */
export async function deckCheck($: EngineInterface, n: unknown, state: unknown): Promise<{ text: string; isError?: true }> {
  const list = (await read($, state_)).checks ?? []
  if (!list.length) return { text: 'Error: no checks: approve a /helm:prompt first.', isError: true }
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > list.length) return { text: `Error: n is a check number from 1 to ${list.length}.`, isError: true }
  if (state !== 'todo' && state !== 'working' && state !== 'done') return { text: 'Error: state is todo, working or done.', isError: true }
  const next = list.map((c, i) => (i === n - 1 ? { ...c, state } : state === 'working' && c.state === 'working' ? { ...c, state: 'todo' as const } : c))
  await set($, s => ({ ...s, checks: next }))
  return { text: `Check ${n} ${state} (${next.filter(c => c.state === 'done').length}/${next.length}).` }
}

export async function deckReset($: EngineInterface): Promise<string> {
  await set($, s => ({ ...blank(), ctx: s.ctx, limits: s.limits, fiveSeries: s.fiveSeries, fiveAt: s.fiveAt, cost: s.cost, startedAt: s.startedAt }))
  return 'Deck reset.'
}

export { DRIFT_AT }

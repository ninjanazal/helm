import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { DRIFT_AT, PANE_FRAME_MS, PIPE_ROWS, TEST_RE, addCtx, addFive, addSkill, skillCommand, keepLimits, agentDone, applyStep, applyTodo, deck, drift, isDeckOn, layout, live, pipeline, terms, tokenSplit, toolPhase, topicShift, verdict } from './deck-core'
import type { DeckData, FeedItem, Phase, StepUsage } from './deck-core'
import type { DeckDone, DeckState } from '../types'
import { readLevel } from './lean'
import { readMode } from './workload'
import { readLevel as readTesting } from './testing'
import { readAdvisor, readAdvisorModel } from './advisor'

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
/** What the main session is doing, for the pipeline; waiting is read at draw time from the pane's props. */
let phase: Phase = { kind: 'idle' }
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

async function poll($: EngineInterface) {
  const cwd = await $.session.cwd().catch(() => undefined)
  const opts = cwd ? { cwd, timeoutMs: 3000 } : { timeoutMs: 3000 }
  await quiet(async () => {
    const u = await $.session.usage()
    const now = await $.clock.now()
    await set($, s => ({ ...s, ctx: u.context, limits: keepLimits(s.limits, (u.rateLimits ?? []).map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })), now), cost: u.cost?.usd, startedAt: u.startedAt }))
  })
  await quiet(async () => {
    const lean = await readLevel($)
    await set($, s => (s.lean === lean ? s : { ...s, lean }))
  })
  await quiet(async () => {
    const workload = await readMode($)
    await set($, s => (s.workload === workload ? s : { ...s, workload }))
  })
  await quiet(async () => {
    const testing = await readTesting($)
    await set($, s => (s.testing === testing ? s : { ...s, testing }))
  })
  await quiet(async () => {
    const advisor = await readAdvisor($)
    await set($, s => (s.advisor === advisor ? s : { ...s, advisor }))
  })
  await quiet(async () => {
    const advisorModel = await readAdvisorModel($)
    await set($, s => (s.advisorModel === advisorModel ? s : { ...s, advisorModel }))
  })
  await quiet(async () => {
    const r = await $.process.run(['git', 'status', '--porcelain', '-b'], opts)
    if (r.exitCode !== 0) return
    const lines = String(r.stdout).split('\n').filter(Boolean)
    const branch = lines[0]?.replace(/^## /, '').split('...')[0]
    let added = 0, removed = 0
    const n = await $.process.run(['git', 'diff', '--numstat', 'HEAD'], opts).catch(() => undefined)
    if (n && n.exitCode === 0) for (const l of String(n.stdout).split('\n')) {
      const [a, r] = l.split('\t')  // binary files show '-': counted as a file, no lines
      added += Number(a) || 0
      removed += Number(r) || 0
    }
    const changes = { files: lines.length - 1, added, removed }
    await set($, s => ({ ...s, branch, changes: s.changes && s.changes.files === changes.files && s.changes.added === added && s.changes.removed === removed ? s.changes : changes }))
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
      phase = { kind: 'thinking' }
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
    const now = await $.clock.now()
    const p: Phase = running && e.props.isPromptCovered ? { kind: 'waiting' } : running ? phase : { kind: 'idle' }
    const v = { ...view(s), phase: p }
    const lines = layout(deck(v, w - 1, f, now), w, f, running)
    // the live list and the pipeline only in a docked pane's free rows: inline, the frame fits the tree, so no row is free
    const free = e.props.placement === 'dock' ? (e.props.scroll?.bodyRows ?? 0) - lines.length : 0
    const pipe = pipeline(p, f, w - 1, free, s.cur && !s.curDone ? totalTok(s) - s.cur.tok0 : 0)
    const list = live(v, w, free - pipe.length, f, now)
    lines.push(...list)
    if (pipe.length) lines.push(...Array.from({ length: free - list.length - PIPE_ROWS }, () => []), ...pipe.map(l => [{ t: ' ' }, ...l]))
    return (
      <Box flexDirection="column" width={cols} paddingX={1}>
        {lines.map((l, i) => (
          <Text key={`d${i}`} wrap="truncate-end">
            {l.length ? l.map((x, j) => <Text key={`d${i}s${j}`} color={x.bg ? 'inverseText' : x.c} backgroundColor={x.bg} weight={x.b ? 'bold' : undefined} dimColor={x.d} >{x.t}</Text>) : ' '}
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
    const now = await $.clock.now()
    const cmd = e.text.trim()
    await set($, s => {
      const name = skillCommand(cmd, (s.skills ?? []).map(k => k.name))
      return { ...s, skillsSince: now, ...(name ? { skills: addSkill(s.skills, { name, at: now, via: 'command' }) } : {}) }
    })
    if (e.command || cmd.startsWith('/')) return
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
  phase = { kind: 'idle' }
  const now = await $.clock.now()
  // the cost now, so the turn's share is its own (the 5s poll may lag)
  const cost = await $.session.usage().then(u => u.cost?.usd).catch(() => undefined)
  await quiet(() => set($, s => {
    const n = s.turns + 1
    if (!s.cur) return { ...s, turns: n, cost: cost ?? s.cost, ctxSeries: addCtx(s.ctxSeries, s.ctx ? ctxPct(s) : undefined) }
    const spent = cost !== undefined && s.cur.cost0 !== undefined ? Math.max(0, cost - s.cur.cost0) : undefined
    const done: DeckDone = { n, seq: s.cur.seq, tok: totalTok(s) - s.cur.tok0, ms: now - s.cur.at, ...verdict(s.cur), ask: s.cur.ask, cost: spent }
    return { ...s, turns: n, cost: cost ?? s.cost, curDone: true, history: [...(s.history ?? []), done].slice(-8), ctxSeries: addCtx(s.ctxSeries, s.ctx ? ctxPct(s) : undefined) }
  }))
  await quiet(() => update($, frame, f => f + 1))
}

/** A sub agent's step: counted on its own card, never in the main-session totals (see applyStep). */
async function agentStep($: EngineInterface, e: { agentId?: string; model: string; effort?: unknown }, u: StepUsage | undefined) {
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
    return { ...s, ctx: e.context, limits: keepLimits(s.limits, rl.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })), at), ...addFive(s.fiveSeries, s.fiveAt, l?.percentUsed, l?.resetsAt, at) }
  }))
}

/** A main-session tool call is about to run: the pipeline shows it until it returns. */
export function deckToolStart(e: { tool: string; agentId?: string }) {
  if (e.agentId) return
  const a = e as unknown as Record<string, unknown>
  phase = toolPhase(e.tool, (a.input ?? a) as Record<string, unknown>)
}

export async function deckTool($: EngineInterface, e: { tool: string; agentId?: string }, r: unknown) {
  if (!e.agentId && phase.kind === 'tool') phase = { kind: 'thinking' }
  await quiet(async () => {
    if ((e as { agentId?: string }).agentId) return
    const now = await $.clock.now()
    const a = e as unknown as Record<string, unknown>
    const input = (a.input ?? a) as Record<string, unknown>
    const err = !!(r as { isError?: boolean }).isError
    if (e.tool === 'Skill' && typeof input.skill === 'string' && input.skill) await set($, s => ({ ...s, skills: addSkill(s.skills, { name: String(input.skill), at: now, via: 'tool' }) }))
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
  await set($, s => ({ ...s, task: text.slice(0, 80), taskAt: now, taskTerms: [...terms(text)], recent: [], turns: 0 }))
  return `Deck task set: ${text}`
}

export async function deckReset($: EngineInterface): Promise<string> {
  await set($, s => ({ ...blank(), ctx: s.ctx, limits: s.limits, fiveSeries: s.fiveSeries, fiveAt: s.fiveAt, skills: s.skills, skillsSince: s.skillsSince, cost: s.cost, startedAt: s.startedAt }))
  return 'Deck reset.'
}

export { DRIFT_AT }

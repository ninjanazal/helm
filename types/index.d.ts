/** What the deck pane keeps. Everything in it was measured; nothing is estimated except cost (the engine's). */
export type DeckTurn = { ask?: string; cost0?: number; seq: string; at: number; tok0: number; doing?: string; target?: string; whole: number; edits: number; tests?: boolean }
export type DeckDone = { n: number; seq: string; tok: number; ms: number; result: 'ok' | 'warn' | 'err' | 'none'; text: string; ask?: string; cost?: number }

/** A sub agent the session started: its own steps and tokens (input + cache writes + output), kept apart from the main totals. */
export type DeckAgent = { id: string; task: string; type?: string; model?: string; tokens: number; steps: number; startedAt: number; endedAt?: number }

/** A task-list item's text and state. */
export type DeckCheck = { text: string; state: 'todo' | 'working' | 'done' }

/** One item of Claude's task list; `id` is the task tool's id, when it has one. */
export type DeckTodo = DeckCheck & { id?: string }

export type DeckState = {
  task?: string
  taskAt?: number
  taskTerms: string[]
  recent: string[][]
  turns: number
  model?: string
  effort?: string
  /** helm's lean level, as stored. */
  lean?: 'off' | 'lite' | 'full'
  /** The model the built-in advisor runs on (Claude Code's `advisorModel` setting). */
  advisorModel?: string
  /** Cumulative sub-agent tokens (input + cache writes + output), kept even when old agent cards are dropped. */
  delegated?: number
  branch?: string
  dirty?: number
  tests?: { ok: boolean; text: string; at: number }
  ctx?: { tokens?: number; window: number; percent?: number }
  limits?: { kind: string; percentUsed: number; resetsAt?: string | number }[]
  compactions: number
  cost?: number
  startedAt?: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  /** The turn in progress (or the last one): its calls in order as letters r e f t x, and what it is doing. */
  cur?: DeckTurn
  /** The `cur` turn finished: the next tool call (or turn.start) opens a new one. */
  curDone?: boolean
  /** Finished turns, newest last, at most 8. */
  history?: DeckDone[]
  /** Files this session read or edited, newest last (repo-relative). */
  touched?: { path: string; edited: boolean }[]
  /** Sub agents, newest last, at most 6. */
  agents?: DeckAgent[]
  /** Claude's own task list (TodoWrite, or TaskCreate/TaskUpdate), as it last wrote it. */
  todos?: DeckTodo[]
  /** The context % after each turn, newest last, at most 120. */
  ctxSeries?: number[]
  /** The 5h usage, a sample a minute, reset with its window. */
  fiveSeries?: { at: number; pct: number }[]
  /** The current 5h window's reset time, ms. */
  fiveAt?: number
  /** The prompt that starts the next turn, first line. */
  ask?: string
  feed: { at: number; kind: 'find' | 'read' | 'edit' | 'run' | 'test' | 'topic' | 'note'; text: string; note?: string; tone?: 'good' | 'bad' | 'warn' | 'dim' }[]
}


declare module 'claude-code' {
  interface PluginState {
    'helm': {
      /** The deck pane's figures. */
      deck: Shaped<DeckState>
      /** The deck's animation frame; advances only while a turn runs. */
      deckFrame: number
    }
  }
}

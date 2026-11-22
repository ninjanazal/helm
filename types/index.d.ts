/** What the deck pane keeps. Everything in it was measured; nothing is estimated except cost (the engine's). */
export type DeckTurn = { seq: string; at: number; tok0: number; doing?: string; target?: string; whole: number; edits: number; tests?: boolean }
export type DeckDone = { n: number; seq: string; tok: number; ms: number; result: 'ok' | 'warn' | 'err' | 'none'; text: string }

export type DeckState = {
  task?: string
  taskAt?: number
  taskTerms: string[]
  recent: string[][]
  turns: number
  model?: string
  effort?: string
  branch?: string
  dirty?: number
  tests?: { ok: boolean; text: string; at: number }
  ctx?: { tokens?: number; window: number; percent?: number }
  limits?: { kind: string; percentUsed: number; resetsAt?: string | number }[]
  compactions: number
  cost?: number
  startedAt?: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  atlas?: { files: number; symbols?: number; queries: number; returned: number; avoided: number; on: boolean; state?: string; pending?: number; changed?: number; added?: number; removed?: number; indexedAt?: number; code_files?: number; code_with_symbols?: number; text_files?: number; calls?: number; resolved?: number; lines?: number; db_bytes?: number; langs?: [string, number][] }
  sessionAvoided?: number
  /** helm agents' worktrees: name, branch, commits ahead of the main tree, uncommitted files. */
  agents?: { name: string; branch: string; ahead: number; dirty: number }[]
  /** helm agents working in their own worktrees (branch helm/<name>): commits ahead of this tree, uncommitted files. */
  agents?: { name: string; branch: string; ahead: number; dirty: number }[]
  /** The turn in progress (or the last one): its calls in order as letters r e f t x, and what it is doing. */
  cur?: DeckTurn
  /** The `cur` turn finished: the next tool call (or turn.start) opens a new one. */
  curDone?: boolean
  /** Finished turns, newest last, at most 8. */
  history?: DeckDone[]
  /** Files this session read or edited, newest last (repo-relative). */
  touched?: { path: string; edited: boolean }[]
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

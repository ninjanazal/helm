export type Member = {
  name: string
  role: string
  emoji: string
  model: string
  effort: string
  description: string
  prompt: string
  tools?: string[]
  isLead?: boolean
  color?: string
  /** The member's brief: what it is for, what it does, how, what it must not do, and when it is done. */
  purpose?: string
  responsibilities?: string
  approach?: string
  boundaries?: string
  doneWhen?: string
  /** Contract (spec .dev/member-spec.md), all optional so old teams load. read members may run in parallel; one writer per scope. */
  kind?: 'read' | 'write' | 'verify'
  /** procedural: numbered steps behind a plan; principled: guidance only (open-ended judgement). */
  specificity?: 'procedural' | 'principled'
  /** Globs relative to the project root. scope.write is enforced: edits outside it are refused. */
  scope?: { read?: string[]; write?: string[] }
  /** The shape of the report's "result". */
  output?: string
  procedure?: string[]
  acceptance?: Acceptance[]
  stop?: { tokens?: number; turns?: number; noProgress?: number; fixAttempts?: number }
  /** progress: long-lived, keeps a progress file and resumes from it. */
  state?: 'none' | 'progress'
  /** Git actions it may take (denied by default). */
  allow?: ('commit' | 'push')[]
  /** Handle of the member it answers to. Missing means the lead. Never set on the lead. */
  reportsTo?: string
  /** Handles that receive its finished work, in order. May include the lead. Missing or [] means none. */
  handsTo?: string[]
}

/** One member in the reportsTo tree, depth-first. Siblings keep team.json order. */
export type ChainRow = {
  name: string
  /** The lead is 0. */
  depth: number
  /** Box-drawing guide before the emoji, e.g. "│  ├─ ". '' for the lead. 3 cols per level. */
  prefix: string
  /** Already validated, may be []. */
  handsTo: string[]
}

export type MemberStatus = 'idle' | 'working' | 'waiting' | 'human' | 'done' | 'failed'

export type Live = {
  agentId?: string
  status: MemberStatus
  activity?: string
  startedAt?: number
  steps: number
  recent: string[]
  answer?: string
  endedAt?: number
  /** The job it was given, and a one-line summary of what it is doing now. */
  task?: string
  summary?: string
  /** Why it needs help or the human: the BLOCKED: line or its question. */
  reason?: string
  summaryAt?: number
  summaryFor?: number
  /** What it really runs on, as its last model request said. */
  model?: string
  effort?: string
  effortSeen?: boolean
  /** Latest request's input tokens (uncached + cache read + cache write), output tokens summed over the task. */
  ctx?: number
  out?: number
  /** The latest request stopped on max_tokens. */
  hitMax?: boolean
  /** The queued task this member is running, so only its own end finishes it. */
  queueId?: number
  /** Polls to ignore an idle/completed report after a finished member was sent a new message. */
  graceLeft?: number
  /** What raised the needs-help flag: the finished answer, a mid-run SendMessage, or a permission prompt. */
  flagSource?: 'answer' | 'message' | 'permission'
  /** For a permission flag: the pending call's tool_use_id (when the engine gave one) and tool name. */
  flagCall?: string
  flagTool?: string
  /** The runtime's exit for the last finished task, and the acceptance checks behind it. */
  exit?: ExitReason
  checks?: string
}

/** One line of the event log. */
export type LogEntry = { ts: number; who: string; kind: 'spawn' | 'done' | 'edit' | 'error' | 'handoff' | 'note'; text: string }

/** The running or last lead turn: what the receipt line sums up. */
export type Receipt = { startedAt: number; endedAt?: number; agents: string[]; edits: number; errors: number }

export type Tab = 'overview' | 'chain' | 'chat' | 'files' | 'queue'

/** A queued task: sent to its member (or any idle one) when that member is free. */
export type QueueItem = {
  id: number
  /** A member name, or 'any'. */
  to: string
  text: string
  status: 'queued' | 'running' | 'done' | 'failed'
  addedAt: number
  /** The member it went to. */
  member?: string
  startedAt?: number
  endedAt?: number
  /** Where the work came from; missing means 'queue'. */
  source?: 'queue' | 'spawn' | 'route'
  /** Who gave it: 'you' or a member name. */
  from?: string
  agentId?: string
}

export type Layout = 'auto' | 'compact' | 'wide' | 'mini'

export type Msg = { id: number; ts: number; from: string; to: string; text: string }

export type Team = {
  name: string
  members: Member[]
  file?: string
  /** Handle of the member that gets the person's untargeted prompts. Not the lead. Missing means the main session handles them. */
  main?: string
}

/** A team the picker offers: where it lives and how big it is. */
export type TeamEntry = { name: string; file: string; members: number }

/** A file in the team's shared folder, and who last wrote it. */
export type TeamFile = { name: string; size: number; updatedAt: number; author?: string; note?: string }

/** The add/edit form: the member being written, and the name it had before an edit. */
export type Draft = { member: Member; original?: string; isMain?: boolean; error?: string; tab?: 'job' | 'brief' | 'tools' }

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
      team: Shaped<Team | null>
      live: Shaped<Record<string, Live>>
      channel: Shaped<Msg[]>
      view: string
      expanded: string | null
      openMsgs: number[]
      now: number
      isPanePlaced: boolean
      draft: Shaped<Draft | null>
      teamMtime: number
      isCompact: boolean
      teamList: Shaped<TeamEntry[]>
      isPicking: boolean
      moving: string | null
      isHelpOpen: boolean
      newTeamName: string
      files: Shaped<TeamFile[]>
      /** null: files hidden; '': the list; a name: that file. */
      filesView: string | null
      fileText: string
      log: Shaped<LogEntry[]>
      receipt: Shaped<Receipt | null>
      layout: Layout
      isLogOpen: boolean
      isPastel: boolean
      tab: Tab
      queue: Shaped<QueueItem[]>
      /** The next queue task id: never reused. */
      queueNext: number
      bodyOffset: number
      chatAnchor: number
      /** The session's context window and fill. */
      ctx: { tokens?: number; window: number; percent?: number } | null
      /** Rate-limit windows (five_hour, seven_day), percent used only. */
      limits: { kind: string; percentUsed: number; resetsAt?: string | number }[]
      /** The deck pane's figures. */
      deck: Shaped<DeckState>
      /** The deck's animation frame; advances only while a turn runs. */
      deckFrame: number
    }
  }
}

/** A yes/no check on a member's finished work. command, paths_exist and report run in the runtime; criterion is for a verify member. */
export type Acceptance =
  | { check: 'command'; run: string; timeoutMs?: number; maxFailures?: number }
  | { check: 'paths_exist' }
  | { check: 'report' }
  | { check: 'criterion'; text: string }

/** Why a member stopped. Set by the runtime from the report and the checks, never by prose alone. */
export type ExitReason = 'accepted' | 'failed_checks' | 'no_progress' | 'blocked' | 'budget' | 'guardrail' | 'error'

/** A member's final ```json report, parsed. */
export type Report = {
  exit: ExitReason
  summary: string
  result?: unknown
  files: string[]
  commands: string[]
  openQuestions: string[]
  nextStep: string
}

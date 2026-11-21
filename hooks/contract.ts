import type { Acceptance, ExitReason, Member, Report, Team } from '../types'

/**
 * Member contracts (spec: .dev/member-spec.md). A member is a job, not a persona: what it is for,
 * what it may touch, what it must return, how the runtime checks it, and when it stops.
 * Every function here is pure apart from `runAcceptance`, which takes its command runner.
 */

export const EXITS: ExitReason[] = ['accepted', 'failed_checks', 'no_progress', 'blocked', 'budget', 'guardrail', 'error']

export const DEFAULT_STOP = { tokens: 60000, turns: 25, noProgress: 2, fixAttempts: 2 }

/** Persona and hype words: they change style, not accuracy (spec E1, E12). */
const PERSONA_RE = /\b(you are an?|world[- ]class|expert|senior|junior|rockstar|ninja|guru|veteran|seasoned|10x|best in class|critical to my career)\b/i

const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']

/** Bash commands no member may run unless its contract allows them. */
const DENY: { re: RegExp; why: string; allow?: 'commit' | 'push' }[] = [
  { re: /\bgit\s+push\b/, why: 'git push', allow: 'push' },
  { re: /\bgit\s+(commit|merge|rebase|reset\s+--hard|tag)\b/, why: 'git history change', allow: 'commit' },
  { re: /\bgit\s+(stash|clean|checkout\s+(--\s|\.)|restore|rm\b|reset\b)/, why: 'git working-tree change (stash, clean, checkout, restore, rm, reset)' },
  { re: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/, why: 'recursive force delete' },
  { re: /\bsudo\b/, why: 'sudo' },
  { re: /\b(npm|pnpm|yarn)\s+(i|install|add)\b[^|;&]*\s-g\b|\bpip3?\s+install\b(?![^|;&]*--target)|\bapt(-get)?\s+install\b|\bbrew\s+install\b/, why: 'system-wide install' },
  { re: /\b(curl|wget)\b[^|;&]*\|\s*(sh|bash|zsh)\b/, why: 'pipe to shell' },
]

const lines = (text?: string) =>
  (text ?? '').split('\n').map(x => x.trim().replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '')).filter(Boolean)

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean) : typeof v === 'string' ? lines(v) : [])

/** Reads the contract fields of a raw member (from team.json or save_team) into a clean shape. */
export function contractOf(r: Record<string, unknown>): Partial<Member> {
  const out: Partial<Member> = {}
  if (r.kind === 'read' || r.kind === 'write' || r.kind === 'verify') out.kind = r.kind
  if (r.specificity === 'procedural' || r.specificity === 'principled') out.specificity = r.specificity
  if (r.scope && typeof r.scope === 'object') {
    const s = r.scope as Record<string, unknown>
    out.scope = { ...(s.read !== undefined ? { read: arr(s.read) } : {}), ...(s.write !== undefined ? { write: arr(s.write) } : {}) }
  }
  if (typeof r.output === 'string' && r.output.trim()) out.output = r.output.trim()
  const proc = arr(r.procedure)
  if (proc.length) out.procedure = proc
  if (Array.isArray(r.acceptance)) {
    const acc = (r.acceptance as unknown[]).map(toAcceptance).filter((a): a is Acceptance => a !== undefined)
    if (acc.length) out.acceptance = acc
  }
  if (r.stop && typeof r.stop === 'object') {
    const s = r.stop as Record<string, unknown>
    const n = (v: unknown) => (typeof v === 'number' && v > 0 ? Math.floor(v) : undefined)
    const stop = { tokens: n(s.tokens), turns: n(s.turns), noProgress: n(s.noProgress), fixAttempts: n(s.fixAttempts) }
    out.stop = Object.fromEntries(Object.entries(stop).filter(([, v]) => v !== undefined))
  }
  if (r.state === 'none' || r.state === 'progress') out.state = r.state
  const allow = arr(r.allow).filter(a => a === 'commit' || a === 'push') as ('commit' | 'push')[]
  if (allow.length) out.allow = allow
  return out
}

function toAcceptance(v: unknown): Acceptance | undefined {
  if (typeof v === 'string' && v.trim()) return { check: 'criterion', text: v.trim() }
  if (!v || typeof v !== 'object') return undefined
  const a = v as Record<string, unknown>
  const timeoutMs = typeof a.timeoutMs === 'number' ? Math.min(Math.max(a.timeoutMs, 1000), 600_000) : undefined
  if (a.check === 'command' && typeof a.run === 'string' && a.run.trim()) {
    return { check: 'command', run: a.run.trim(), ...(timeoutMs ? { timeoutMs } : {}), ...(typeof a.maxFailures === 'number' ? { maxFailures: a.maxFailures } : {}) }
  }
  if (a.check === 'paths_exist') return { check: 'paths_exist' }
  if (a.check === 'report') return { check: 'report' }
  if (a.check === 'criterion' && typeof a.text === 'string' && a.text.trim()) return { check: 'criterion', text: a.text.trim() }
  return undefined
}

/** What a member's contract is missing or gets wrong. Warnings, not errors: old teams still load. */
export function lintMember(m: Member): string[] {
  if (m.isLead) return []
  const w: string[] = []
  const who = m.name
  if (!m.purpose) w.push(`${who}: no purpose (one line: what it is for)`)
  if (!m.kind) w.push(`${who}: no kind (read, write or verify)`)
  if (!m.output) w.push(`${who}: no output format`)
  if (!m.acceptance?.length && !m.doneWhen) w.push(`${who}: no acceptance checks`)
  const text = [m.purpose, m.approach, m.prompt, ...(m.procedure ?? [])].filter(Boolean).join('\n')
  const hit = text.match(PERSONA_RE)
  if (hit) w.push(`${who}: persona wording "${hit[0]}" (personas don't improve accuracy; describe the job)`)
  if (m.kind === 'read' && (m.scope?.write?.length || m.tools?.some(t => WRITE_TOOLS.includes(t)))) w.push(`${who}: kind read but it can write`)
  if (m.kind === 'write' && !m.scope?.write?.length) w.push(`${who}: kind write without scope.write (it may edit anything)`)
  return w
}

/** Writers whose write scopes overlap: they must not run at once (spec E5). */
export function overlappingWriters(t: Team): [string, string][] {
  const ws = t.members.filter(m => m.kind === 'write')
  const out: [string, string][] = []
  for (let i = 0; i < ws.length; i++) {
    for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i]?.scope?.write ?? ['**']
      const b = ws[j]?.scope?.write ?? ['**']
      if (a.some(x => b.some(y => globsOverlap(x, y)))) out.push([ws[i]?.name ?? '', ws[j]?.name ?? ''])
    }
  }
  return out
}

function globsOverlap(a: string, b: string): boolean {
  const base = (g: string) => g.split(/[*?[{]/)[0] ?? ''
  const x = base(a)
  const y = base(b)
  return x.startsWith(y) || y.startsWith(x)
}

// ── prompt ────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const tag = (name: string, body: string, indent = '  ') => (body.trim() ? `${indent}<${name}>\n${body.split('\n').map(l => `${indent}  ${l}`).join('\n')}\n${indent}</${name}>` : '')

const KIND_TEXT: Record<string, string> = {
  read: 'Read-only: you never edit files. Other read members may run beside you.',
  write: 'You are the only writer for your scope while you run. Keep changes to the scope and the task.',
  verify: 'You check another member\'s work against the acceptance checks. You never edit files; you report pass or fail with evidence.',
}

export function stopOf(m: Member) {
  return { ...DEFAULT_STOP, ...(m.stop ?? {}) }
}

/**
 * The member's system prompt, static parts first so the prefix caches (spec E13):
 * contract (per member), then team protocol (per team). The task and context come in the spawn prompt.
 */
export function contractPrompt(m: Member, protocol: string): string {
  const stop = stopOf(m)
  const identity = `${m.name}: ${m.purpose || m.description}`
  const steps = m.procedure?.length ? m.procedure : lines(m.approach)
  const procedure = steps.length
    ? m.specificity === 'principled'
      ? steps.map(s => `- ${s}`).join('\n')
      : ['First write a short plan (inputs, steps), then follow it.', ...steps.map((s, i) => `${i + 1}. ${s}`)].join('\n')
    : ''
  const scope = [
    m.kind ? KIND_TEXT[m.kind] : '',
    m.scope?.write ? `Write scope: ${m.scope.write.length ? m.scope.write.join(', ') : 'none'}. Edits outside it are refused.` : '',
    m.scope?.read?.length ? `Read scope: ${m.scope.read.join(', ')}.` : '',
    m.tools?.length ? `Tools: ${m.tools.join(', ')}.` : '',
    ...lines(m.boundaries),
    m.allow?.includes('commit') ? '' : 'Never commit, merge or rewrite git history.',
    m.allow?.includes('push') ? '' : 'Never push.',
  ].filter(Boolean).join('\n')
  const acceptance = [
    ...(m.acceptance ?? []).map(a =>
      a.check === 'command' ? `- The runtime runs \`${a.run}\`: it must pass${a.maxFailures !== undefined ? ` (at most ${a.maxFailures} failures)` : ''}.`
      : a.check === 'paths_exist' ? '- Every path you cite must exist.'
      : a.check === 'report' ? '- Your report must follow the report format.'
      : `- ${a.text}`),
    ...lines(m.doneWhen).map(x => `- ${x}`),
  ]
  const accText = acceptance.length ? `${acceptance.join('\n')}\nThese are checked after you finish. Saying you are done does not make it done; evidence does.` : ''
  const stopText = [
    'Stop at the first of these and report, naming the exit:',
    '- accepted: every check above holds, with evidence.',
    '- blocked: you need a decision, a permission or missing information. Ask ONE concrete question with options. Report early rather than guess.',
    `- failed_checks: the same check still fails after ${stop.fixAttempts} fix attempts.`,
    `- no_progress: ${stop.noProgress} turns in a row with no new evidence (same error, same diff, same call).`,
    `- budget: about ${stop.turns} turns or ${Math.round(stop.tokens / 1000)}k tokens used.`,
    '- guardrail: an action you need was refused.',
    '- error: a tool or the environment failed.',
  ].join('\n')
  const report = [
    'End with exactly one fenced ```json block:',
    '{"exit": "<exit>", "summary": "<≤5 lines>", "result": <your output>, "evidence": {"files": ["path:lines"], "commands": ["cmd → result"]}, "open_questions": [], "next_step": "<one line>"}',
    m.output ? `"result" format: ${m.output}` : '',
    'Cite path:lines for every claim about code, quoting the line when it matters.',
  ].filter(Boolean).join('\n')
  const contract = [
    tag('identity', esc(identity)),
    tag('procedure', esc(procedure)),
    tag('boundaries', esc(scope)),
    tag('acceptance', esc(accText)),
    tag('stop_and_report', esc(stopText)),
    tag('report_format', esc(report)),
    m.prompt?.trim() ? tag('notes', esc(m.prompt.trim())) : '',
  ].filter(Boolean).join('\n')
  return `<contract>\n${contract}\n</contract>\n\n<team_protocol>\n${protocol.trim()}\n</team_protocol>\n`
}

// ── report and guardrails ─────────────────────────────────────────────────

/** The member's final report: the last ```json block with an "exit", else the legacy BLOCKED:/NEEDS-HUMAN: lines. */
export function parseReport(text: string): Report | undefined {
  // A fence can appear inside the JSON's own strings, so try each opening fence against every later closing one.
  const blocks: string[] = []
  for (const open of text.matchAll(/```json[ \t]*\n/g)) {
    const from = (open.index ?? 0) + open[0].length
    for (let at = text.indexOf('```', from); at >= 0; at = text.indexOf('```', at + 3)) blocks.push(text.slice(from, at))
  }
  for (const b of blocks.reverse()) {
    try {
      const o = JSON.parse(b) as Record<string, unknown>
      if (typeof o.exit === 'string' && (EXITS as string[]).includes(o.exit)) {
        const ev = (o.evidence ?? {}) as Record<string, unknown>
        return {
          exit: o.exit as ExitReason,
          summary: typeof o.summary === 'string' ? o.summary : '',
          result: o.result,
          files: arr(ev.files),
          commands: arr(ev.commands),
          openQuestions: arr(o.open_questions),
          nextStep: typeof o.next_step === 'string' ? o.next_step : '',
        }
      }
    } catch {
      // not JSON: try the next block
    }
  }
  const ask = text.match(/^(?:BLOCKED|NEEDS-HUMAN):\s*(.+)$/m)
  if (ask) return { exit: 'blocked', summary: ask[1]?.trim() ?? '', files: [], commands: [], openQuestions: [ask[1]?.trim() ?? ''], nextStep: '' }
  return undefined
}

/** Glob match for scopes: `**` any depth, `*` within a segment, `?` one char. Paths relative to root. */
export function globMatch(glob: string, path: string): boolean {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'
      i += glob[i + 2] === '/' ? 2 : 1
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`).test(path)
}

/** Why a member's tool call must be refused, or undefined to let the normal permission flow decide. */
export function guardCall(m: Member, tool: string, input: unknown, root: string): string | undefined {
  if (m.isLead) return undefined
  const args = (input ?? {}) as Record<string, unknown>
  if (WRITE_TOOLS.includes(tool)) {
    if (m.kind === 'read' || m.kind === 'verify') return `${m.name} is a ${m.kind} member: it never edits files`
    const write = m.scope?.write
    if (write) {
      const raw = String(args.file_path ?? args.notebook_path ?? args.path ?? '')
      const rel = raw.startsWith(`${root}/`) ? raw.slice(root.length + 1) : raw
      if (!write.some(g => globMatch(g, rel))) return `${rel || 'that path'} is outside ${m.name}'s write scope (${write.join(', ') || 'none'})`
    }
  }
  if (tool === 'Bash') {
    const cmd = String(args.command ?? '')
    for (const d of DENY) if (d.re.test(cmd) && !(d.allow && m.allow?.includes(d.allow))) return `${d.why} is not allowed for ${m.name}`
  }
  return undefined
}

// ── acceptance ────────────────────────────────────────────────────────────

export type CheckResult = { check: string; isPassed: boolean; detail: string }
export type Runner = (cmd: string, timeoutMs: number) => Promise<{ exitCode: number; stdout: string; stderr: string }>
export type Exists = (path: string) => Promise<boolean>

/** Failure count from common test runner summaries (bun/claude plugin test "N fail", jest "N failed", pytest "N failed"). */
export function failuresIn(out: string): number | undefined {
  const m = out.match(/(\d+)\s+(?:fail|failed|failing)\b/i)
  return m ? Number(m[1]) : undefined
}

/**
 * Runs the deterministic checks of a contract against a report. `criterion` checks are for a verify member, not
 * the runtime, so they are skipped here. The runtime's verdict, not the member's, sets the exit.
 */
export async function runAcceptance(m: Member, report: Report | undefined, run: Runner, exists: Exists): Promise<CheckResult[]> {
  const out: CheckResult[] = []
  for (const a of m.acceptance ?? []) {
    if (a.check === 'report') out.push({ check: 'report', isPassed: report !== undefined, detail: report ? `exit ${report.exit}` : 'no ```json report with an exit' })
    else if (a.check === 'paths_exist') {
      const paths = [...new Set((report?.files ?? []).map(f => f.replace(/:[\d,\s-]+$/, '')).filter(Boolean))]
      const missing: string[] = []
      for (const p of paths) if (!(await exists(p))) missing.push(p)
      out.push({ check: 'paths_exist', isPassed: missing.length === 0, detail: missing.length ? `missing: ${missing.slice(0, 5).join(', ')}` : `${paths.length} paths ok` })
    } else if (a.check === 'command') {
      try {
        const r = await run(a.run, a.timeoutMs ?? 300_000)
        const all = `${r.stdout}\n${r.stderr}`
        const fails = failuresIn(all)
        const isPassed = a.maxFailures !== undefined && fails !== undefined ? fails <= a.maxFailures : r.exitCode === 0
        out.push({ check: `command: ${a.run}`, isPassed, detail: `exit ${r.exitCode}${fails !== undefined ? `, ${fails} failures` : ''}` })
      } catch (err) {
        out.push({ check: `command: ${a.run}`, isPassed: false, detail: `could not run: ${String(err).slice(0, 120)}` })
      }
    }
  }
  return out
}

/** The runtime's exit for a finished member: a claimed `accepted` that fails a check becomes `failed_checks`. */
export function decideExit(report: Report | undefined, checks: CheckResult[]): ExitReason | undefined {
  const isFailed = checks.some(c => !c.isPassed)
  if (!report) return checks.length ? (isFailed ? 'failed_checks' : undefined) : undefined
  if (report.exit === 'accepted' && isFailed) return 'failed_checks'
  return report.exit
}

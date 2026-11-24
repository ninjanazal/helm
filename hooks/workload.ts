import type { EngineInterface } from 'claude-code'
import { readLevel as readLean } from './lean'

/**
 * Workload: a short system-prompt section that tells the host when to hand work to cheaper-model sub agents.
 * off: the host does everything. sometimes: only mechanical or independent units. always: the host plans and
 * reviews, sub agents implement. The mode resolves as: project file .claude/helm/workload, else the stored
 * choice, else 'sometimes'.
 */

export type Mode = 'off' | 'sometimes' | 'always'
export const MODES: readonly Mode[] = ['off', 'sometimes', 'always']
export const DEFAULT_MODE: Mode = 'sometimes'
export const WORKLOAD_FILE = '.claude/helm/workload'
export const WORKLOAD_ID = 'helm:workload'

export const asMode = (v: unknown): Mode | undefined => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (MODES as readonly string[]).includes(s) ? (s as Mode) : undefined
}

const LEAN_LINE = 'Lean: answer first, no recap, smallest complete change, keep checks and exact code, one line on anything skipped.'

/** The section text for a mode, or undefined when workload is off. `lean` adds the lean line to the unit brief. */
export function workloadText(mode: Mode, lean = true): string | undefined {
  if (mode === 'off') return undefined
  const when = mode === 'always'
    ? 'Delegate all implementation: spawn every implementation unit with the Agent tool, one agent per unit, and do not edit files yourself except to fix a unit that failed its check twice. You keep planning, decisions, review and the final verification.'
    : 'Delegate only units that are mechanical or independent: 3+ units on disjoint files, each with its own deterministic check. Do small, coupled or judgement-heavy work yourself.'
  const rules = [
    'Delegate only after the plan is settled and you are confident in it; until then work inline.',
    when,
    'Spawn each unit with the Agent tool and set `model`: haiku for mechanical edits (rename, move, boilerplate, tests from a spec), sonnet for units that need reading and judging code. A unit must cost less than you: a cheaper model, or your own model with `effort` set lower (low for mechanical, medium for judging). Never give a unit your own model at your own effort.',
    'Write each brief so a cheaper model needs no judgement: the exact files and symbols, the change to make (code or a precise description), and the command that proves it. If you cannot be that precise, do the unit yourself.',
    `Brief each unit with only its goal, files and check${lean ? `, starting with "${LEAN_LINE}" (sub agents do not inherit this prompt)` : ''}.`,
    'Units never share a file; independent units run in parallel.',
    'Review every result against its check. A unit that fails its check twice comes back to you; do not retry it blindly.',
  ]
  return ['# Workload', 'Spend the cheaper model where it is enough.', ...rules.map(r => `- ${r}`),
    'The person can say "stop delegating" to turn this off.'].join('\n')
}

const storeKey = 'workload'

export async function readMode($: EngineInterface): Promise<Mode> {
  try {
    const root = (await $.session.cwd().catch(() => undefined)) ?? '.'
    const f = asMode(await $.fs.read(`${root}/${WORKLOAD_FILE}`).catch(() => undefined))
    if (f) return f
  } catch { /* fall through */ }
  try { return asMode(await $.store.get(storeKey)) ?? DEFAULT_MODE } catch { return DEFAULT_MODE }
}

/** The section for this session: mode and lean level resolved, or undefined. */
export async function workloadSection($: EngineInterface): Promise<string | undefined> {
  return workloadText(await readMode($), (await readLean($)) !== 'off')
}

/** The /helm:workload action: report, or set the stored mode. */
export async function workloadSet($: EngineInterface, arg: unknown): Promise<string> {
  const want = asMode(arg)
  const cur = await readMode($)
  if (!want) return `Workload is ${cur}. Use off, sometimes or always.`
  await $.store.set(storeKey, want)
  return `Workload ${want}. Applies from the next session, /clear or compaction (the system prompt is cached).`
}

import type { EngineInterface } from 'claude-code'

/**
 * Lean mode: a short system-prompt section that makes the model write less (answer first, no recap, the smallest
 * complete change) without cutting checks, security or exact payloads. On by default, off when the person says so.
 * The level resolves as: project file .claude/helm/lean, else the stored choice, else 'full'.
 */

export type Level = 'off' | 'lite' | 'full'
export const LEVELS: readonly Level[] = ['off', 'lite', 'full']
export const DEFAULT_LEVEL: Level = 'full'
export const LEAN_FILE = '.claude/helm/lean'
export const LEAN_ID = 'helm:lean'

export const asLevel = (v: unknown): Level | undefined => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (LEVELS as readonly string[]).includes(s) ? (s as Level) : undefined
}

const RULES = [
  'Answer first: the result or the fix, then at most one line of reason. No greeting, no "let me", no recap of the request or of what you just did.',
  'Do the smallest complete change: reuse what the repo already has before writing new code; add no feature, option or dependency nobody asked for.',
  'Never trade away correctness: keep validation, error handling, security, tests that guard risky logic, and every negation and number exact.',
  'Code, commands, paths and error text stay verbatim.',
  'Read narrowly: grep or read a range, not whole files, unless the whole file is the task.',
  'End with one line only when something was skipped, unchecked or risky.',
]

/** The section text for a level, or undefined when lean is off. */
export function leanText(level: Level): string | undefined {
  if (level === 'off') return undefined
  const rules = level === 'lite' ? RULES.slice(0, 3) : RULES
  return ['# Lean mode', 'Spend few tokens, keep the result right.', ...rules.map(r => `- ${r}`),
    'The person can say "stop lean" or "normal mode" to turn this off.'].join('\n')
}

const storeKey = 'lean'

export async function readLevel($: EngineInterface): Promise<Level> {
  try {
    const root = (await $.session.cwd().catch(() => undefined)) ?? '.'
    const f = asLevel(await $.fs.read(`${root}/${LEAN_FILE}`).catch(() => undefined))
    if (f) return f
  } catch { /* fall through */ }
  try { return asLevel(await $.store.get(storeKey)) ?? DEFAULT_LEVEL } catch { return DEFAULT_LEVEL }
}

/** The /helm:lean action: report, or set the stored level. */
export async function leanSet($: EngineInterface, arg: unknown): Promise<string> {
  const want = asLevel(arg)
  const cur = await readLevel($)
  if (!want) return `Lean is ${cur}. Use on, off, lite or full.`
  await $.store.set(storeKey, want)
  return `Lean ${want === 'off' ? 'off' : `on (${want})`}. Applies from the next session, /clear or compaction (the system prompt is cached).`
}

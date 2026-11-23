import type { EngineInterface } from 'claude-code'

/**
 * Advisor: a short system-prompt section that says how often to consult the built-in `advisor` tool,
 * with planning as the main trigger. Levels only add triggers: low is the harness default plus a call on the
 * drafted plan, mid adds more, high adds the most. It is guidance only; helm cannot make the advisor fire.
 * The level resolves as: project file .claude/helm/advisor, else the stored choice, else 'mid'.
 */

export type AdvisorLevel = 'low' | 'mid' | 'high'
export const ADVISOR_LEVELS: readonly AdvisorLevel[] = ['low', 'mid', 'high']
export const DEFAULT_ADVISOR: AdvisorLevel = 'mid'
export const ADVISOR_FILE = '.claude/helm/advisor'
export const ADVISOR_ID = 'helm:advisor'

export const asAdvisor = (v: unknown): AdvisorLevel | undefined => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (ADVISOR_LEVELS as readonly string[]).includes(s) ? (s as AdvisorLevel) : undefined
}

const LOW = [
  'When you have drafted a plan or design, call the advisor on it before you present it or start building.',
]
const MID = [
  ...LOW,
  'Call it again when a plan changes in a way that alters scope, files or approach.',
  'Call it before declaring multi-step work done.',
]
const HIGH = [
  ...MID,
  'Call it right after orientation, before brainstorming or writing a plan, so the approach is checked before it takes shape.',
  'Call it on every revision of a plan, when the approach changes, and when results do not fit.',
]
const RULES: Record<AdvisorLevel, string[]> = { low: LOW, mid: MID, high: HIGH }

/** The section text for a level. It adds to the advisor guidance already in the system prompt, never replaces it. */
export function advisorText(level: AdvisorLevel): string {
  return ['# Advisor planning',
    'If you have the built-in `advisor` tool (it takes no parameters), these calls are in addition to its default ones. This is not `mcp__helm__advisor`, which only sets a level and never reaches the reviewer.',
    ...RULES[level].map(r => `- ${r}`),
    'Planning is the main trigger. The person can say "stop advisor" to drop these extra calls.'].join('\n')
}

const storeKey = 'advisor'

export async function readAdvisor($: EngineInterface): Promise<AdvisorLevel> {
  try {
    const root = (await $.session.cwd().catch(() => undefined)) ?? '.'
    const f = asAdvisor(await $.fs.read(`${root}/${ADVISOR_FILE}`).catch(() => undefined))
    if (f) return f
  } catch { /* fall through */ }
  try { return asAdvisor(await $.store.get(storeKey)) ?? DEFAULT_ADVISOR } catch { return DEFAULT_ADVISOR }
}

/** The section for this session. */
export async function advisorSection($: EngineInterface): Promise<string> {
  return advisorText(await readAdvisor($))
}

/** The /helm:advisor action: report, or set the stored level. */
export async function advisorSet($: EngineInterface, arg: unknown): Promise<string> {
  const want = asAdvisor(arg)
  const cur = await readAdvisor($)
  if (!want) return `Advisor level is ${cur}. Use low, mid or high.`
  await $.store.set(storeKey, want)
  return `Advisor level ${want}. Applies from the next session, /clear or compaction (the system prompt is cached).`
}

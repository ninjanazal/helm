import type { EngineInterface } from 'claude-code'

/**
 * Testing: a short system-prompt section that sets how much testing the host writes and runs.
 * off: no tests unless asked. light: only tests that guard risky logic. thorough: test-first, edge cases,
 * a regression test per bug, the full suite before done. The level resolves as: project file
 * .claude/helm/testing, else the stored choice, else 'light'.
 */

export type Level = 'off' | 'light' | 'thorough'
export const LEVELS: readonly Level[] = ['off', 'light', 'thorough']
export const DEFAULT_LEVEL: Level = 'light'
export const TESTING_FILE = '.claude/helm/testing'
export const TESTING_ID = 'helm:testing'

export const asLevel = (v: unknown): Level | undefined => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (LEVELS as readonly string[]).includes(s) ? (s as Level) : undefined
}

const RULES: Record<Level, string[]> = {
  off: [
    'Write no tests unless the person asks for them.',
    'Still run the existing checks a change could break.',
  ],
  light: [
    'Add a test only where it guards risky logic: validation, parsing, state, security, money, a fixed bug.',
    'Skip tests for trivial or declarative code.',
    'Run the checks a change could break before declaring done.',
  ],
  thorough: [
    'Write the failing test first for new behavior, then the code.',
    'Cover edge cases and error paths; add a regression test for every bug you fix.',
    'Run the full test suite before declaring done and report its result.',
  ],
}

/** The section text for a level. */
export function testingText(level: Level): string {
  return ['# Testing', ...RULES[level].map(r => `- ${r}`),
    'The person can say "stop testing" to turn this off or "more tests" to raise it.'].join('\n')
}

const storeKey = 'testing'

export async function readLevel($: EngineInterface): Promise<Level> {
  try {
    const root = (await $.session.cwd().catch(() => undefined)) ?? '.'
    const f = asLevel(await $.fs.read(`${root}/${TESTING_FILE}`).catch(() => undefined))
    if (f) return f
  } catch { /* fall through */ }
  try { return asLevel(await $.store.get(storeKey)) ?? DEFAULT_LEVEL } catch { return DEFAULT_LEVEL }
}

/** The section for this session. */
export async function testingSection($: EngineInterface): Promise<string> {
  return testingText(await readLevel($))
}

/** The /helm:testing action: report, or set the stored level. */
export async function testingSet($: EngineInterface, arg: unknown): Promise<string> {
  const want = asLevel(arg)
  const cur = await readLevel($)
  if (!want) return `Testing is ${cur}. Use off, light or thorough.`
  await $.store.set(storeKey, want)
  return `Testing ${want}. Applies from the next session, /clear or compaction (the system prompt is cached).`
}

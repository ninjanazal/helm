import type { EngineInterface } from 'claude-code'

/**
 * herdr adapter, TUI only. herdr already reports the lead pane's own Claude lifecycle (its installed
 * `herdr:claude` hook plus the OSC title), so helm never calls `report-agent` for that pane.
 * Without herdr (no HERDR_PANE_ID / HERDR_BIN_PATH) detectHerdr returns null and callers do nothing.
 */

export type Herdr = { bin: string; pane: string }

let found: Herdr | null | undefined

export async function detectHerdr($: EngineInterface): Promise<Herdr | null> {
  if (found !== undefined) return found
  try {
    const pane = (await $.env.get('HERDR_PANE_ID'))?.trim()
    const bin = (await $.env.get('HERDR_BIN_PATH'))?.trim()
    found = pane && bin ? { bin, pane } : null
  } catch {
    found = null
  }
  return found
}

/** For tests: forget the detection, or preset it (the test's own `$` has no env). */
export function resetHerdr(preset?: Herdr | null) {
  found = preset
}

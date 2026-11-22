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

/** argv to open a pane right of `h.pane` in `cwd`, marked as a helm agent session, without stealing focus. */
export function splitArgv(h: Herdr, cwd: string, name: string): string[] {
  return [h.bin, 'pane', 'split', h.pane, '--direction', 'right', '--cwd', cwd, '--env', `HELM_AGENT=${name}`, '--no-focus']
}

/** POSIX single-quoting: safe for any text. */
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/**
 * argv to start the agent's Claude session in `pane`. herdr types `run`'s words into the pane's shell joined by
 * spaces, unquoted, so the command goes as one string with the prompt shell-quoted (names are [a-z0-9-] only).
 */
export function runArgv(h: Herdr, pane: string, name: string, prompt: string): string[] {
  return [h.bin, 'pane', 'run', pane, `claude --agent ${shq(name)} ${shq(prompt)}`]
}

/** The new pane's id from herdr's JSON reply: the first `pane_id` under `result`. */
export function paneIdFrom(stdout: string): string | undefined {
  let j: unknown
  try {
    j = JSON.parse(stdout)
  } catch {
    return undefined
  }
  const find = (v: unknown): string | undefined => {
    if (!v || typeof v !== 'object') return undefined
    const o = v as Record<string, unknown>
    if (typeof o.pane_id === 'string') return o.pane_id
    for (const x of Object.values(o)) {
      const hit = find(x)
      if (hit) return hit
    }
    return undefined
  }
  return find((j as { result?: unknown })?.result)
}

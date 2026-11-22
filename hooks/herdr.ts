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

/**
 * argv to open a new tab labelled `name` in this pane's workspace (pane ids are `<workspace>:<pane>`), in `cwd`,
 * marked as a helm agent session (and with its launching session's address as HELM_PARENT, when known), without stealing focus.
 */
export function tabArgv(h: Herdr, cwd: string, name: string, parent?: string): string[] {
  const ws = h.pane.split(':')[0]!
  const env = ['--env', `HELM_AGENT=${name}`, ...(parent ? ['--env', `HELM_PARENT=${parent}`] : [])]
  return [h.bin, 'tab', 'create', '--workspace', ws, '--cwd', cwd, '--label', name, ...env, '--no-focus']
}

/** POSIX single-quoting: safe for any text. */
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/**
 * argv to start the agent's Claude session in `pane`. herdr types `run`'s words into the pane's shell joined by
 * spaces, unquoted, so the command goes as one string with the prompt shell-quoted (names are [a-z0-9-] only).
 * `over` is a per-launch model/effort; each flag is added only when set.
 */
export function runArgv(h: Herdr, pane: string, name: string, prompt: string, over: { model?: string; effort?: string } = {}): string[] {
  const flags = `${over.model ? ` --model ${shq(over.model)}` : ''}${over.effort ? ` --effort ${shq(over.effort)}` : ''}`
  return [h.bin, 'pane', 'run', pane, `claude --agent ${shq(name)}${flags} ${shq(prompt)}`]
}

/** The new pane's id from herdr's JSON reply (a tab's root pane): the first `pane_id` under `result`. */
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

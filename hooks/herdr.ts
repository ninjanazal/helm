import type { EngineInterface } from 'claude-code'
import type { Live } from '../types'

/**
 * herdr adapter, TUI only. herdr already reports the lead pane's own Claude lifecycle (its installed
 * `herdr:claude` hook plus the OSC title), so helm never calls `report-agent` for that pane. It
 * only sets display-only metadata on it, a short summary of the crew, e.g. "claude · 2 working · 1 blocked".
 * Without herdr (no HERDR_PANE_ID / HERDR_BIN_PATH) every call here is a no-op.
 */

export type Herdr = { bin: string; pane: string }

const SOURCE = 'helm'
/** The summary expires on its own if this session dies without clearing it. */
const TTL_MS = 30 * 60_000
/** Re-send an unchanged summary before its TTL runs out. */
const REFRESH_MS = 20 * 60_000

let found: Herdr | null | undefined
let lastText: string | undefined
let lastAt = 0

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

/** Crew summary from real member state only; undefined when nothing is running or waiting. */
export function crewSummary(all: Record<string, Live>, exclude: string[] = ['lead']): string | undefined {
  let working = 0
  let blocked = 0
  for (const [name, one] of Object.entries(all)) {
    if (exclude.includes(name)) continue
    if (one.status === 'working' && !one.flagSource) working += 1
    else if (one.status === 'waiting' || one.status === 'human' || (one.status === 'working' && one.flagSource)) blocked += 1
  }
  const parts = [working ? `${working} working` : '', blocked ? `${blocked} blocked` : ''].filter(Boolean)
  return parts.length ? `claude · ${parts.join(' · ')}` : undefined
}

/**
 * argv for `herdr pane report-metadata`. herdr 0.9.5 only parses the options when the pane id comes
 * first, although its help puts it last.
 */
export function metadataArgv(h: Herdr, text: string | undefined, seq: number): string[] {
  const head = [h.bin, 'pane', 'report-metadata', h.pane, '--source', SOURCE, '--seq', String(seq)]
  return text === undefined ? [...head, '--clear-display-agent'] : [...head, '--display-agent', text, '--ttl-ms', String(TTL_MS)]
}

/** Push the crew summary to herdr if it changed (or is due a refresh). Never throws. */
export type Run = (argv: string[]) => Promise<unknown>

export async function syncHerdr($: EngineInterface, all: Record<string, Live>, run: Run = argv => $.process.run(argv, { timeoutMs: 3000 })): Promise<void> {
  const h = await detectHerdr($)
  if (!h) return
  const text = crewSummary(all)
  const now = Date.now()
  if (text === lastText && (text === undefined || now - lastAt < REFRESH_MS)) return
  lastText = text
  lastAt = now
  try {
    // seq must increase or herdr drops the report; ns-like time keeps it rising across reloads.
    const r = (await run(metadataArgv(h, text, now * 1000))) as { exitCode?: number; stderr?: string; stdout?: string } | undefined
    if (r && typeof r.exitCode === 'number' && r.exitCode !== 0) lastError = `herdr exit ${r.exitCode}: ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`
    else lastError = undefined
  } catch (err) {
    // herdr gone or slow: the summary is display-only, the TTL clears it. Keep the reason for the log.
    lastError = `herdr call failed: ${String(err).slice(0, 200)}`
  }
}

let lastError: string | undefined
/** Why the last herdr call failed, if it did. */
export function herdrError(): string | undefined {
  return lastError
}

/** For tests: forget the detection, or preset it (the test's own `$` has no env). */
export function resetHerdr(preset?: Herdr | null) {
  found = preset
  lastText = undefined
  lastAt = 0
}

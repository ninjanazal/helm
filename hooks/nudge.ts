/**
 * Atlas nudge: the first code search of a session (Grep, or grep/rg/git grep in Bash) is answered with a hint
 * to use atlas instead. One per session, then every search runs: a deny per search would cost a round trip
 * each time a regex search is really needed. Subagents are left alone (they may not have the atlas tools).
 */

import type { EngineInterface } from 'claude-code'
import { atlasBin } from './atlas'

export type Nudge = { available: boolean; spent: boolean }

export const newNudge = (available: boolean): Nudge => ({ available, spent: false })

// grep / rg / git grep as a command of its own: at the start, or after && || ; — not after a pipe.
const SEARCH_RE = /(?:^|&&|\|\||;)\s*(?:git\s+grep|grep|rg|ag)\b/

export const NUDGE_TEXT =
  'helm hint (not a user denial): this repo has an atlas index. It returns ranked path:lines for code and docs, ' +
  'so you can Read only those ranges. Load it once with ToolSearch, query ' +
  '"select:mcp__atlas__find,mcp__atlas__symbol,mcp__atlas__outline,mcp__atlas__neighbors", then use ' +
  'find (search by words), symbol (where a name is defined), neighbors (callers and callees), ' +
  'outline (symbols of one file). This hint is shown once: any further search, Grep or grep, runs normally; ' +
  'use it for exhaustive literal or regex matches.'

/** The deny text for this call, or undefined to let it run. Updates the session state. */
export function atlasNudge(n: Nudge, e: Record<string, unknown>): string | undefined {
  if (!n.available || n.spent || e.agentId) return undefined
  const tool = String(e.tool ?? '')
  if (tool.startsWith('mcp__atlas__')) {
    n.spent = true
    return undefined
  }
  const input = (e.input ?? e) as Record<string, unknown>
  const search = tool === 'Grep' || (tool === 'Bash' && SEARCH_RE.test(String(input.command ?? '')))
  if (!search) return undefined
  n.spent = true
  return NUDGE_TEXT
}

/** Checked once per session: an atlas binary and an index for this project. */
export async function atlasReady($: EngineInterface): Promise<boolean> {
  const cwd = await $.session.cwd().catch(() => undefined)
  if (!cwd) return false
  const indexed = await $.fs.list(`${cwd}/.atlas`).then(l => l.some(f => f.name === 'graph.db'), () => false)
  return indexed && !!(await atlasBin($, cwd).catch(() => undefined))
}

let session = newNudge(false)

/** Arm the nudge for a new session (session.start, or /clear). */
export async function nudgeArm($: EngineInterface): Promise<void> {
  session = newNudge(await atlasReady($).catch(() => false))
}

/** The hint for this tool call in the current session, or undefined to let it run. */
export const nudgeCheck = (e: object) => atlasNudge(session, e as Record<string, unknown>)

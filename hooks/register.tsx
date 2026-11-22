import { deckCleared, deckMeasure, deckOpen, deckPrompt, deckStart, deckStep, deckTool, deckTurnDone, registerDeck } from './deck'
import type { Register } from 'claude-code'
import { leanText, readLevel, LEAN_ID } from './lean'
import { handleHelmTool, registerHelmTools, toolArgs } from './tools'

/**
 * helm's event wiring. The engine allows one unmatched hook per event per plugin, so the deck's handlers are
 * called from here rather than registered on their own. Every hook falls through to next(e) on error: helm is
 * display and tooling only and must never break a turn.
 */
export const register: Register = (on, options) => {
  registerDeck(on, options)

  on('session.measure', async ($, e, next) => {
    await deckMeasure($, e as never)
    return next(e)
  }).catch(($, e, next) => next(e))

  // /clear fires session.end (reason 'clear') and no session.start after it: the deck is reopened from here.
  on('session.end', async ($, e, next) => {
    const r = await next(e)
    if (e.reason === 'clear') deckCleared($)
    return r
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    await deckStart($)
    await registerHelmTools($).catch(() => {})
    const r = await next(e)
    deckOpen($)
    return r
  }).catch(($, e, next) => next(e))

  // Lean mode: one session-scope section appended to the system prompt. Falls through on any error.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const text = leanText(await readLevel($))
    if (!text) return r
    return { sections: [...r.sections.filter(s => s.id !== LEAN_ID), { id: LEAN_ID, text, scope: 'session' as const }] }
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    await deckPrompt($, e)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    await deckStep($, e, res?.usage ?? undefined)
    return res
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool.startsWith('mcp__helm__')) {
      const mine = await handleHelmTool($, e.tool, toolArgs(e))
      if (mine !== undefined) return mine as never
    }
    const res = await next(e)
    await deckTool($, e, res)
    return res
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const res = await next(e)
    await deckTurnDone($, e as { agentId?: string })
    return res
  }).catch(($, e, next) => next(e))
}

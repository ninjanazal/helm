import { helmIsOn, deckCleared, deckMeasure, deckOpen, deckPrompt, deckStart, deckStep, deckTool, deckToolStart, deckTurnDone, registerDeck } from './deck'
import type { Register } from 'claude-code'
import { leanText, readLevel, LEAN_ID } from './lean'
import { WORKLOAD_ID, workloadSection } from './workload'
import { ADVISOR_ID, advisorSection } from './advisor'
import { PIPELINE_ID, pipelineSection } from './pipeline'
import { TESTING_ID, testingSection } from './testing'
import { handleHelmTool, registerHelmTools, toolArgs } from './tools'

const HELM_SECTIONS = new Set([LEAN_ID, WORKLOAD_ID, TESTING_ID, ADVISOR_ID, PIPELINE_ID])

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

  // Lean mode, workload and testing: one session-scope section each appended to the system prompt. Falls through on any error.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!helmIsOn()) return r
    const lean = leanText(await readLevel($))
    const workload = await workloadSection($)
    const testing = await testingSection($)
    const advisor = await advisorSection($)
    const pipeline = await pipelineSection($)
    const sections = r.sections.filter(s => !HELM_SECTIONS.has(s.id))
    if (lean) sections.push({ id: LEAN_ID, text: lean, scope: 'session' as const })
    if (workload) sections.push({ id: WORKLOAD_ID, text: workload, scope: 'session' as const })
    sections.push({ id: TESTING_ID, text: testing, scope: 'session' as const })
    sections.push({ id: ADVISOR_ID, text: advisor, scope: 'session' as const })
    sections.push({ id: PIPELINE_ID, text: pipeline, scope: 'session' as const })
    return { sections }
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
    deckToolStart(e)
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

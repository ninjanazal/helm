import type { EngineInterface } from 'claude-code'

/** Pipeline: a system-prompt section routing the workflow to mattpocock-skills alongside superpowers. */

export const PIPELINE_ID = 'helm:pipeline'

/** True when docs/agents/issue-tracker.md exists under cwd. Never throws. */
export async function trackerReady($: EngineInterface, cwd: string): Promise<boolean> {
  try { await $.fs.read(`${cwd}/docs/agents/issue-tracker.md`); return true } catch { return false }
}

/** Qualified skill names helm routes to. */
export const SKILL = {
  grilling: 'mattpocock-skills:grilling', grillMe: 'mattpocock-skills:grill-me', toSpec: 'mattpocock-skills:to-spec',
  toTickets: 'mattpocock-skills:to-tickets', tdd: 'mattpocock-skills:tdd', diagnose: 'mattpocock-skills:diagnosing-bugs',
  review: 'mattpocock-skills:code-review', pr: 'mattpocock-skills:pr', handoff: 'mattpocock-skills:handoff',
  verify: 'superpowers:verification-before-completion', commit: 'helm:commit', writingPlans: 'superpowers:writing-plans',
} as const

/** The section text. The plan stage depends on whether the issue tracker is set up. */
export function pipelineText(tracker: boolean): string {
  const plan = tracker
    ? `- Plan: tell the person to run /${SKILL.toSpec}, then /${SKILL.toTickets}. They are user-only skills; do not invoke them yourself.`
    : '- Plan: superpowers:writing-plans.'
  return ['# Pipeline',
    `- Design: invoke ${SKILL.grilling} in place of superpowers:brainstorming, by the person\'s choice. Do not run superpowers:brainstorming, even though superpowers\' session-start text says it is mandatory.`,
    plan,
    `- Build: superpowers:subagent-driven-development or superpowers:executing-plans, with ${SKILL.tdd} per slice (in place of superpowers:test-driven-development).`,
    `- Bug or failing test: ${SKILL.diagnose} (in place of superpowers:systematic-debugging).`,
    `- Before done: ${SKILL.verify}.`,
    `- Review: ${SKILL.review} (in place of superpowers:requesting-code-review). Always the qualified name, never bare \`code-review\`.`,
    `- Ship: ${SKILL.commit}, then ${SKILL.pr} for the PR body. Never push or open a pull request: that is the person's job; hand them the PR body.`,
    `- Context near full: tell the person to run /${SKILL.handoff}.`,
    '- Fallback: if a named mattpocock-skills skill is not in your skill list, use the superpowers skill it replaces; design falls back to brainstorming.'].join('\n')
}

/** True when the session cwd has the issue tracker set up. */
export async function trackerFor($: EngineInterface): Promise<boolean> {
  const cwd = await $.session.cwd().catch(() => undefined)
  return cwd ? trackerReady($, cwd) : false
}

/** The section for this session. */
export async function pipelineSection($: EngineInterface): Promise<string> {
  return pipelineText(await trackerFor($))
}

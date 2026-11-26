/** Auto skills: the deck's "auto" suggestions, as a per-turn note telling the model to invoke them. */

export type SkillSuggestion = { name: string; why: string; auto: boolean }

/** One line per auto suggestion; '' when there are none. */
export function autoSkillText(s: SkillSuggestion[]): string {
  const auto = s.filter(x => x.auto)
  if (!auto.length) return ''
  return ['# Helm auto skills', ...auto.map(x => `Invoke ${x.name} now via the Skill tool: ${x.why}.`)].join('\n')
}

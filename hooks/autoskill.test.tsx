import { expect, test } from 'claude-code/testing'
import { autoSkillText } from './autoskill'

test('autoskill: text names only auto skills, empty when none are auto', () => {
  const t = autoSkillText([
    { name: 'a:one', why: 'because', auto: true },
    { name: 'b:two', why: 'manual', auto: false },
  ])
  expect(t).toContain('Invoke a:one now via the Skill tool: because.')
  expect(t).not.toContain('b:two')
  expect(autoSkillText([{ name: 'b:two', why: 'manual', auto: false }])).toBe('')
  expect(autoSkillText([])).toBe('')
})

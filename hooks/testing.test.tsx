import { expect, test } from 'claude-code/testing'
import { asLevel, testingText } from './testing'

test('testing: levels parse, every level has distinct text, off says no tests, thorough says test-first and full suite', () => {
  expect(asLevel(' Thorough\n')).toBe('thorough')
  expect(asLevel('on')).toBe(undefined)
  expect(asLevel(undefined)).toBe(undefined)
  const t = (['off', 'light', 'thorough'] as const).map(testingText)
  expect(new Set(t).size).toBe(3)
  t.forEach(s => expect(s.startsWith('# Testing')).toBe(true))
  expect(testingText('off')).toContain('Write no tests unless')
  expect(testingText('thorough')).toContain('failing test first')
  expect(testingText('thorough')).toContain('full test suite')
})

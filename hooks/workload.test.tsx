import { expect, test } from 'claude-code/testing'
import { asMode, workloadText } from './workload'

test('workload: modes parse, off has no text, always differs from sometimes, haiku and sonnet are named', () => {
  expect(asMode(' Always\n')).toBe('always')
  expect(asMode('on')).toBe(undefined)
  expect(asMode(undefined)).toBe(undefined)
  expect(workloadText('off')).toBe(undefined)
  expect(workloadText('always')).not.toBe(workloadText('sometimes'))
  expect(workloadText('sometimes')).toContain('haiku')
  expect(workloadText('sometimes')).toContain('sonnet')
  expect(workloadText('always')).toContain('Delegate all implementation')
  expect(workloadText('always', false)).not.toContain('Lean:')
  expect(workloadText('always', true)).toContain('Lean:')
})

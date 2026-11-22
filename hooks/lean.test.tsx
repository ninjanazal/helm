import { expect, test } from 'claude-code/testing'
import { asLevel, leanText } from './lean'

test('lean: levels parse, off has no text, lite is shorter than full', () => {
  expect(asLevel(' Full\n')).toBe('full')
  expect(asLevel('on')).toBe(undefined)
  expect(asLevel(undefined)).toBe(undefined)
  expect(leanText('off')).toBe(undefined)
  expect(leanText('lite')!.length).toBeLessThan(leanText('full')!.length)
  expect(leanText('full')).toContain('stop lean')
})

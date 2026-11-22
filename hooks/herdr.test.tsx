import { expect, test } from 'claude-code/testing'
import { detectHerdr, resetHerdr } from './herdr'

test('detect is null outside herdr and returns a preset inside', async $ => {
  resetHerdr(null)
  expect(await detectHerdr($)).toBe(null)
  resetHerdr({ bin: '/bin/herdr', pane: 'w:p1' })
  expect(await detectHerdr($)).toEqual({ bin: '/bin/herdr', pane: 'w:p1' })
  resetHerdr()
})

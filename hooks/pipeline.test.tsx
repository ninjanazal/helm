import { expect, test } from 'claude-code/testing'
import { pipelineText, trackerFor, trackerReady } from './pipeline'

test('pipeline: tracker picks to-spec or writing-plans, design always routes to grilling, trackerReady needs the file', async () => {
  const on = pipelineText(true)
  const off = pipelineText(false)
  expect(on).toContain('to-spec')
  expect(on).toContain('to-tickets')
  expect(on).not.toContain('writing-plans')
  expect(off).toContain('writing-plans')
  expect(off).not.toContain('to-spec')
  for (const t of [on, off]) {
    expect(t).toContain('mattpocock-skills:grilling')
    expect(t).toContain('in place of superpowers:brainstorming')
    expect(t).toContain('Never push or open a pull request')
  }
  const fake = (files: string[]) => ({ fs: { read: async (p: string) => { if (!files.includes(p)) throw new Error('ENOENT'); return '' } } }) as never
  expect(await trackerReady(fake([]), '/p')).toBe(false)
  expect(await trackerReady(fake(['/p/docs/agents/issue-tracker.md']), '/p')).toBe(true)
  expect(await trackerFor({ session: { cwd: async () => { throw new Error('x') } } } as never)).toBe(false)
})

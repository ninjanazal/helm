import { expect, test } from 'claude-code/testing'
import { crewSummary, metadataArgv, resetHerdr, syncHerdr } from './herdr'
import type { Live } from '../types'

const one = (status: Live['status'], extra: Partial<Live> = {}): Live => ({ status, steps: 0, recent: [], ...extra })

test('crew summary counts only real working and blocked members, never the lead', () => {
  expect(crewSummary({})).toBe(undefined)
  expect(crewSummary({ a: one('idle'), b: one('done'), c: one('failed') })).toBe(undefined)
  expect(crewSummary({ lead: one('working'), a: one('working') })).toBe('claude · 1 working')
  expect(crewSummary({ a: one('working'), b: one('waiting'), c: one('human'), d: one('working', { flagSource: 'permission' }) }))
    .toBe('claude · 1 working · 3 blocked')
})

test('metadata argv puts the pane id first and clears when there is nothing to show', () => {
  const h = { bin: '/bin/herdr', pane: 'w:p1' }
  expect(metadataArgv(h, 'claude · 1 working', 5)).toEqual(['/bin/herdr', 'pane', 'report-metadata', 'w:p1', '--source', 'helm', '--seq', '5', '--display-agent', 'claude · 1 working', '--ttl-ms', '1800000'])
  expect(metadataArgv(h, undefined, 6)).toEqual(['/bin/herdr', 'pane', 'report-metadata', 'w:p1', '--source', 'helm', '--seq', '6', '--clear-display-agent'])
})

function stubRun(env: Record<string, string>) {
  const runs: string[][] = []
  resetHerdr(env.HERDR_PANE_ID && env.HERDR_BIN_PATH ? { bin: env.HERDR_BIN_PATH, pane: env.HERDR_PANE_ID } : null)
  const run = async (argv: string[]) => { runs.push(argv) }
  return { runs, run }
}

test('sync is a no-op outside herdr', async $ => {
  const { runs, run } = stubRun({})
  await syncHerdr($, { a: one('working') }, run)
  expect(runs.length).toBe(0)
})

test('sync runs herdr only on change, clears when idle, with a rising seq', async $ => {
  const { runs, run } = stubRun({ HERDR_PANE_ID: 'w:p1', HERDR_BIN_PATH: '/bin/herdr' })
  await syncHerdr($, { a: one('working') }, run)
  await syncHerdr($, { a: one('working') }, run)
  expect(runs.length).toBe(1)
  await syncHerdr($, { a: one('done') }, run)
  expect(runs.length).toBe(2)
  expect(runs[1]?.at(-1)).toBe('--clear-display-agent')
  expect(Number(runs[1]?.[7])).toBeGreaterThanOrEqual(Number(runs[0]?.[7]))
})


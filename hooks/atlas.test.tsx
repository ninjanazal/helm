import { expect, test } from 'claude-code/testing'
import { atlasReport, atlasTool } from './atlas'

// Real `atlas status --json` / `atlas stats --json` output from this repo.
const STATS = { avoided: 2674, calls: 5561, code_files: 16, code_with_symbols: 16, db_bytes: 2654208, edges: 5608, files: 28, indexed_at: 1795302969, langs: [['tsx', 6], ['rust', 6]], lines: 9235, queries: 1, resolved: 1604, returned: 39, source_bytes: 476301, symbols: 394, text_files: 12 }
const STALE = { added: 3, changed: 7, indexed_at: 1795302969, removed: 6, state: 'stale' }
const FRESH = { added: 0, changed: 0, indexed_at: 1795302969, removed: 0, state: 'fresh' }
const MISSING = { added: 0, changed: 0, indexed_at: null, removed: 0, state: 'missing' }

test('report: fresh index shows counts and no refresh hint', () => {
  const r = atlasReport(FRESH, STATS)
  expect(r).toContain('fresh')
  expect(r).toContain('28 files')
  expect(r).toContain('394 symbols')
  expect(r).not.toContain('/helm:atlas refresh')
})

test('report: stale index shows what changed and the refresh hint', () => {
  const r = atlasReport(STALE, STATS)
  expect(r).toContain('stale')
  expect(r).toContain('7 changed, 3 new, 6 deleted')
  expect(r).toContain('/helm:atlas refresh')
})

test('report: no index, or unreadable status, says not indexed', () => {
  expect(atlasReport(MISSING, undefined)).toContain('not indexed')
  expect(atlasReport(MISSING, undefined)).toContain('/helm:atlas refresh')
  expect(atlasReport('garbage', undefined)).toContain('not indexed')
})

test('tool without an atlas binary says how to install it', async $ => {
  const r = await atlasTool($, 'status', '/proj', async () => undefined)
  expect(r.text).toContain('make setup')
  expect(r.isError).toBe(false)
})

test('tool status runs status and stats; refresh indexes the project root first', async $ => {
  const runs: string[][] = []
  const run = async (argv: string[]) => {
    runs.push(argv)
    const out = argv[1] === 'status' ? FRESH : argv[1] === 'stats' ? STATS : 'indexed 28 files in 0.4s'
    return { exitCode: 0, stdout: typeof out === 'string' ? out : JSON.stringify(out), stderr: '' }
  }
  const s = await atlasTool($, 'status', '/proj', async () => '/bin/atlas', run)
  expect(s.text).toContain('fresh')
  expect(runs.some(a => a[1] === 'index')).toBe(false)
  runs.length = 0
  const r = await atlasTool($, 'refresh', '/proj', async () => '/bin/atlas', run)
  expect(runs[0]).toEqual(['/bin/atlas', 'index', '--root', '/proj'])
  expect(r.text).toContain('indexed 28 files')
  expect(r.text).toContain('fresh')
})

test('tool refresh failure is an error with the reason', async $ => {
  const r = await atlasTool($, 'refresh', '/proj', async () => '/bin/atlas', async () => ({ exitCode: 2, stdout: '', stderr: 'database is locked' }))
  expect(r.isError).toBe(true)
  expect(r.text).toContain('database is locked')
})

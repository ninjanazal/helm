import { expect, test } from 'claude-code/testing'
import { normHeader, parseCsv, tableTool, tablesSection } from './tables'

const D = '/p/.claude/helm/tables'
const fake = (files: Record<string, string>, list: unknown = 'throw') => ({
  session: { cwd: async () => '/p' },
  fs: {
    read: async (p: string) => { if (!(p in files)) throw new Error('ENOENT'); return files[p] },
    list: async () => { if (list === 'throw') throw new Error('ENOENT'); return list },
  },
}) as never
const people = { [`${D}/people.csv`]: 'name,city\n"Doe, Jane",Porto\nBob,Lisboa\n' }

test('csv: quotes, commas, newlines, escapes, CRLF, BOM', () => {
  expect(parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi"""\r\n"l1\nl2",z\r\n'))
    .toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['l1\nl2', 'z']])
})
test('csv: ragged rows padded/trimmed', () => {
  expect(parseCsv('a,b\n1\n1,2,3\n')).toEqual([['a', 'b'], ['1', ''], ['1', '2']])
})
test('csv: header normalised', () => {
  expect(normHeader(['name', '', 'name', 'name'])).toEqual(['name', 'col_2', 'name_2', 'name_3'])
})

test('tables: where is exact, case-insensitive; table name case-insensitive', async () => {
  const $ = fake(people, ['people.csv'])
  const r = await tableTool($, { action: 'query', table: 'People', where: { city: 'porto' } })
  expect(r).toContain('Doe, Jane')
  expect(r).not.toContain('Bob')
})
test('tables: contains + where are ANDed', async () => {
  const $ = fake(people, ['people.csv'])
  const r = await tableTool($, { action: 'query', table: 'people', contains: { name: 'JAN' }, where: { city: 'lisboa' } })
  expect(r).not.toContain('Jane')
  expect(r).not.toContain('Bob')
})
test('tables: section capped at 60 lines / 4096 bytes', async () => {
  const files: Record<string, string> = {}
  const names = Array.from({ length: 30 }, (_, i) => `t${i}.csv`)
  const cols = Array.from({ length: 40 }, (_, i) => `column_${i}`).join(',')
  for (const n of names) files[`${D}/${n}`] = `${cols}\n`
  const s = await tablesSection(fake(files, names))
  expect(new TextEncoder().encode(s).length).toBeLessThanOrEqual(4096)
  expect(s.split('\n').length).toBeLessThanOrEqual(60)
  expect(s).toContain('t0')
})
test('tables: fs.list throws -> empty section, no tables yet', async () => {
  const $ = fake({})
  expect(await tablesSection($)).toBe('')
  expect(await tableTool($, { action: 'list' })).toBe('no tables yet')
})
test('tables: list shapes; ignores subdirs, dotfiles, non-csv', async () => {
  const files = { [`${D}/x.csv`]: 'a\n1\n', [`${D}/y.csv`]: 'a\n1\n2\n' }
  const $ = fake(files, [{ name: 'x.csv' }, 'y.csv', 'sub/', '.hidden.csv', 'a.txt', 'sub/z.csv'])
  const r = await tableTool($, { action: 'list' })
  expect(r).toContain('x (1 rows)')
  expect(r).toContain('y (2 rows)')
  expect(r).not.toMatch(/hidden|a\.txt|sub|z/)
  expect(await tablesSection($)).toContain('- x (1 rows): a')
})
test('tables: limit clamps to 50, reports shown of total', async () => {
  const body = 'n\n' + Array.from({ length: 120 }, (_, i) => `r${i}`).join('\n') + '\n'
  const $ = fake({ [`${D}/big.csv`]: body }, ['big.csv'])
  const r = await tableTool($, { action: 'query', table: 'big', limit: 999 })
  expect(r).toContain('50 of 120 rows shown')
  expect(r).toContain('r49')
  expect(r).not.toContain('r50\n')
})
test('tables: >1MB file is too large', async () => {
  const $ = fake({ [`${D}/h.csv`]: 'a\n' + 'x'.repeat(1_100_000) }, ['h.csv'])
  expect(await tableTool($, { action: 'list' })).toContain('h (too large)')
  expect(await tableTool($, { action: 'query', table: 'h' })).toContain('too large')
})
test('tables: header-only file lists 0 rows and queries without throwing', async () => {
  const $ = fake({ [`${D}/e.csv`]: 'a,b\n' }, ['e.csv'])
  expect(await tableTool($, { action: 'list' })).toContain('e (0 rows)')
  const r = await tableTool($, { action: 'query', table: 'e' })
  expect(r).toContain('a')
  expect(r).toContain('0 of 0')
})
test('tables: unknown table / column names the valid ones', async () => {
  const $ = fake(people, ['people.csv'])
  expect(await tableTool($, { action: 'query', table: 'nope' })).toContain('people')
  const r = await tableTool($, { action: 'query', table: 'people', columns: ['zip'] })
  expect(r).toContain('name')
  expect(r).toContain('city')
})
test('tables: a 20 KB cell keeps the reply within 8 KB', async () => {
  const $ = fake({ [`${D}/w.csv`]: `a,b\n${'x'.repeat(20000)},y\n${'z'.repeat(20000)},q\n` }, ['w.csv'])
  const r = await tableTool($, { action: 'query', table: 'w' })
  expect(new TextEncoder().encode(r).length).toBeLessThanOrEqual(8192)
})
test('tables: schema gives columns and at most 3 rows', async () => {
  const body = 'n\n' + Array.from({ length: 10 }, (_, i) => `row${i}`).join('\n') + '\n'
  const $ = fake({ [`${D}/s.csv`]: body }, ['s.csv'])
  const r = await tableTool($, { action: 'schema', table: 's' })
  expect(r).toContain('n')
  expect(r).toContain('row2')
  expect(r).not.toContain('row3')
})

test('tables: quoted newline row keeps list count at 2 and exact output escaped', async () => {
  const $ = fake({ [`${D}/q.csv`]: 'a,b\n"l1\nl2",z\nq,r\n' }, ['q.csv'])
  expect(await tableTool($, { action: 'list' })).toContain('q (2 rows)')
  expect(await tableTool($, { action: 'query', table: 'q' })).toContain('l1\\nl2\tz')
})
test('tables: wide header with long names stays within 8 KB', async () => {
  const cols = Array.from({ length: 40 }, (_, i) => `${i}`.padEnd(300, 'c'))
  const $ = fake({ [`${D}/w.csv`]: `${cols.join(',')}\n${cols.map(() => '1').join(',')}\n` }, ['w.csv'])
  const r = await tableTool($, { action: 'query', table: 'w' })
  expect(new TextEncoder().encode(r).length).toBeLessThanOrEqual(8192)
  expect(r).toContain('rows shown')
})
test('tables: blank lines are skipped', async () => {
  const $ = fake({ [`${D}/b.csv`]: 'a,b\n1,2\n\n3,4\n\n' }, ['b.csv'])
  expect(await tableTool($, { action: 'list' })).toContain('b (2 rows)')
})
test('tables: matching trims cells', async () => {
  const $ = fake({ [`${D}/p.csv`]: 'name,city\nAna, porto \nBob,Lisboa\n' }, ['p.csv'])
  const r = await tableTool($, { action: 'query', table: 'p', where: { city: 'porto' } })
  expect(r).toContain('Ana')
  expect(r).not.toContain('Bob')
})
test('tables: null/object where values are ignored', async () => {
  const $ = fake(people, ['people.csv'])
  const r = await tableTool($, { action: 'query', table: 'people', where: { city: null }, contains: { name: {} } })
  expect(r).toContain('Doe, Jane')
  expect(r).toContain('Bob')
})
test('tables: case-colliding files keep the first, list the other as skipped', async () => {
  const $ = fake({ [`${D}/A.csv`]: 'x\n1\n', [`${D}/a.csv`]: 'x\n1\n2\n' }, ['a.csv', 'A.csv'])
  const r = await tableTool($, { action: 'list' })
  expect(r).toContain('A (1 rows): x')
  expect(r).toContain('a (duplicate name, skipped)')
  expect(await tableTool($, { action: 'query', table: 'a' })).toBe('x\n1')
})
test('tables: 1 MB limit counts UTF-8 bytes', async () => {
  const $ = fake({ [`${D}/u.csv`]: 'a\n' + '\u00e9'.repeat(600_000) }, ['u.csv'])
  expect(await tableTool($, { action: 'list' })).toContain('u (too large)')
})

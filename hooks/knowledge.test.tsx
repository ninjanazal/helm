import { expect, test } from 'claude-code/testing'
import { KNOW_READ, KNOW_WRITE, capIndex, coverage, formatIndex, knowledgeSet, knowledgeSection, parseIndex, removeEntry, stale, upsert } from './knowledge'

const e = (topic: string, ...paths: string[]) => ({ topic, paths, note: 'n' })

test('knowledge: parse/format round-trips', () => {
  const x = [e('auth', 'src/auth.ts', 'src/login.ts'), e('db', 'lib/db.ts')]
  expect(parseIndex(formatIndex(x))).toEqual(x)
  expect(parseIndex('')).toEqual([])
})

test('knowledge: upsert dedupes case-insensitively and clamps; removeEntry ignores case', () => {
  const a = upsert([e('Auth', 'a')], { topic: 'auth', paths: ['1', '2', '3', '4'], note: 'x'.repeat(200) })
  expect(a).toHaveLength(1)
  expect(a[0]!.paths).toHaveLength(3)
  expect(a[0]!.note).toHaveLength(80)
  expect(removeEntry(a, 'AUTH')).toEqual([])
})

test('knowledge: malformed lines skipped, never throw', () => {
  const md = '# hi\n- no colon here\n- bad:\n- ok: a/b — fine\n\u0000garbage\n- : x — y\n'
  expect(parseIndex(md)).toEqual([{ topic: 'ok', paths: ['a/b'], note: 'fine' }])
})

test('knowledge: capIndex cuts at 60 lines / 4096 bytes with "… N more entries"', () => {
  const many = formatIndex(Array.from({ length: 100 }, (_, i) => e(`t${i}`, `d/${i}`)))
  const out = capIndex(many).trimEnd().split('\n')
  expect(out).toHaveLength(60)
  expect(out[59]).toBe('- … 41 more entries (run /helm:map)')
  const fat = formatIndex(Array.from({ length: 55 }, (_, i) => ({ topic: `t${i}`, paths: ['p'], note: 'y'.repeat(80) })))
  const c = capIndex(fat)
  expect(new TextEncoder().encode(c).length).toBeLessThanOrEqual(4096)
  expect(c).toContain('more entries (run /helm:map)')
  expect(capIndex('- a: b — c\n')).toBe('- a: b — c\n')
})

test('knowledge: stale lists entries with a missing path', () => {
  const x = [e('a', 'ok', 'gone'), e('b', 'ok')]
  expect(stale(x, p => p === 'ok').map(y => y.topic)).toEqual(['a'])
})

test('knowledge: coverage: 2 of 4 dirs → 50; none → 0', () => {
  const t = ['src/a.ts', 'lib/b.ts', 'app/c.ts', 'pkg/d.ts', 'docs/x.md', 'test/t.ts', '.github/w.yml', 'README.md']
  expect(coverage([e('x', 'src/a.ts'), e('y', 'lib')], t)).toBe(50)
  expect(coverage([], ['docs/a', 'tests/b', 'README.md'])).toBe(0)
  expect(coverage([e('x', 'src')], [])).toBe(0)
})

const fake = (files: Record<string, string>, store: Record<string, unknown> = {}) => ({
  store: { get: async (k: string) => store[k], set: async (k: string, v: unknown) => { store[k] = v } },
  session: { cwd: async () => '/p' },
  fs: {
    read: async (p: string) => { if (!(p in files)) throw new Error('ENOENT'); return files[p] },
    write: async (p: string, c: string) => { files[p] = c },
    list: async () => { throw new Error('ENOENT') },
  },
  process: { run: async () => ({ exitCode: 0, stdout: 'src/a.ts\nlib/b.ts\n', stderr: '' }) },
}) as never

test('knowledge: missing index is created; existing index is not rewritten', async () => {
  const files: Record<string, string> = {}
  const sec = await knowledgeSection(fake(files))
  expect(files['/p/.claude/helm/knowledge/index.md']).toBe('# Knowledge index\n')
  expect(sec).toContain('(no entries yet)')
  expect(sec.length).toBeGreaterThan('(no entries yet)'.length)
  const kept: Record<string, string> = { '/p/.claude/helm/knowledge/index.md': '# Knowledge index\n\n- a: x.ts — n\n' }
  await knowledgeSection(fake(kept))
  expect(kept['/p/.claude/helm/knowledge/index.md']).toBe('# Knowledge index\n\n- a: x.ts — n\n')
})

test('knowledge: status says "no knowledge yet" without a store', async () => {
  const $ = fake({})
  expect(await knowledgeSet($, { action: 'status' })).toBe('no knowledge yet')
})

test('knowledge: add with a case-different topic updates in place; section drops stale, keeps file', async () => {
  const files: Record<string, string> = { '/p/src/a.ts': '', '/p/lib/b.ts': '' }
  const $ = fake(files)
  expect(await knowledgeSet($, { action: 'add', topic: 'Auth', paths: ['src/a.ts'], note: 'one' })).toBe('noted: Auth')
  await knowledgeSet($, { action: 'add', topic: 'auth', paths: 'src/a.ts, lib/b.ts, x, y', note: 'two' })
  await knowledgeSet($, { action: 'add', topic: 'old', paths: ['src/missing.ts'], note: 'z' })
  const idx = files['/p/.claude/helm/knowledge/index.md']!
  expect(parseIndex(idx)).toHaveLength(2)
  expect(idx).toContain('auth: src/a.ts, lib/b.ts, x — two')
  const sec = await knowledgeSection($)
  expect(sec.startsWith('# Helm knowledge')).toBe(true)
  expect(sec).toContain('Check this index before searching; read linked files only when relevant.')
  expect(sec).not.toContain('- old:')
  expect(idx).toContain('- old:')
  expect(await knowledgeSet($, { action: 'stale' })).toContain('old')
  expect(await knowledgeSet($, { action: 'status' })).toContain('100% coverage')
})

test('knowledge: term and vision append one-line replies', async () => {
  const files: Record<string, string> = {}
  const $ = fake(files)
  expect(await knowledgeSet($, { action: 'term', term: 'Atlas', text: 'the map' })).toBe('noted: Atlas')
  expect(files['/p/GLOSSARY.md']).toBe('# p\n\n## Language\n\n**Atlas**:\nthe map\n')
  await knowledgeSet($, { action: 'vision', text: 'small' })
  expect(files['/p/.claude/helm/knowledge/vision.md']).toBe('- small\n')
})

test('knowledge: term accepts text as the definition; replaces an existing term; vision dedupes', async () => {
  const files: Record<string, string> = {}
  const $ = fake(files)
  await knowledgeSet($, { action: 'term', term: 'Atlas', text: 'the map' })
  expect(files['/p/GLOSSARY.md']).toBe('# p\n\n## Language\n\n**Atlas**:\nthe map\n')
  await knowledgeSet($, { action: 'term', term: 'atlas', text: 'new' })
  expect(files['/p/GLOSSARY.md']).toBe('# p\n\n## Language\n\n**atlas**:\nnew\n')
  await knowledgeSet($, { action: 'vision', text: 'Small' })
  await knowledgeSet($, { action: 'vision', text: ' small ' })
  expect(files['/p/.claude/helm/knowledge/vision.md']).toBe('- Small\n')
})

test('knowledge: empty note round-trips; headings and comments survive a write', async () => {
  expect(formatIndex([{ topic: 't', paths: ['p'], note: '' }])).toBe('- t: p\n')
  expect(parseIndex('- t: p\n- u: q, r — n\n')).toEqual([{ topic: 't', paths: ['p'], note: '' }, { topic: 'u', paths: ['q', 'r'], note: 'n' }])
  const files: Record<string, string> = { '/p/.claude/helm/knowledge/index.md': '# Mine\n- a: x — one\n<!-- keep -->\n- b: y — two\n' }
  const $ = fake(files)
  await knowledgeSet($, { action: 'add', topic: 'a', paths: ['x'], note: '' })
  await knowledgeSet($, { action: 'add', topic: 'c', paths: ['z'], note: 'three' })
  expect(files['/p/.claude/helm/knowledge/index.md']).toBe('# Mine\n- a: x\n<!-- keep -->\n- b: y — two\n- c: z — three\n')
})

test('knowledge: coverage accepts bare dir names', () => {
  expect(coverage([e('x', 'hooks/a.ts')], ['hooks', 'skills'])).toBe(50)
  expect(coverage([e('x', 'hooks/a.ts')], ['hooks/', 'skills/'])).toBe(50)
})

test('knowledge: topic colons and comma paths are sanitized and round-trip', () => {
  const [n] = upsert([], { topic: 'a: b', paths: ['x,y', 'ok'], note: 'n' })
  expect(n).toEqual({ topic: 'a - b', paths: ['ok'], note: 'n' })
  expect(parseIndex(formatIndex([n!]))).toEqual([n])
})

test('knowledge: coverage ignores top-level files when tracked is file output', () => {
  expect(coverage([e('x', 'hooks/a.ts')], ['Makefile', 'LICENSE', 'hooks/a.ts', 'skills/b.md'])).toBe(50)
})

test('knowledge: term appends to Language and replace keeps _Avoid_', async () => {
  const files: Record<string, string> = { '/p/GLOSSARY.md': '# p\n\n## Language\n\n**Atlas**:\nthe map\n_Avoid_: index\n\n## Other\nx\n' }
  const $ = fake(files)
  await knowledgeSet($, { action: 'term', term: 'Deck', text: 'the pane' })
  expect(files['/p/GLOSSARY.md']).toBe('# p\n\n## Language\n\n**Atlas**:\nthe map\n_Avoid_: index\n\n**Deck**:\nthe pane\n\n## Other\nx\n')
  await knowledgeSet($, { action: 'term', term: 'atlas', text: 'new' })
  expect(files['/p/GLOSSARY.md']).toBe('# p\n\n## Language\n\n**atlas**:\nnew\n_Avoid_: index\n\n**Deck**:\nthe pane\n\n## Other\nx\n')
})

test('knowledge: section states both capture triggers', async () => {
  const sec = await knowledgeSection(fake({}))
  expect(sec).toContain("When you locate the code for a topic the index doesn't cover, call mcp__helm__knowledge add.")
  expect(sec).toContain('When the person defines a term, call term; when they state a goal for the project, call vision. Write silently and say one line: noted: X.')
})

test('knowledge: last access is recorded and shown by status', async () => {
  const store: Record<string, unknown> = {}
  const $ = fake({}, store)
  await knowledgeSet($, { action: 'add', topic: 'a', paths: ['x'], note: '' })
  expect((store['knowledge.last'] as { op: string }).op).toBe('write')
  expect(await knowledgeSet($, { action: 'status' })).toContain('last write 0s ago')
  expect((store['knowledge.last'] as { op: string }).op).toBe('read')
  await knowledgeSet($, { action: 'stale' })
  expect((store['knowledge.last'] as { op: string }).op).toBe('read')
  await knowledgeSet($, { action: 'vision', text: 'v' })
  expect((store['knowledge.last'] as { op: string }).op).toBe('write')
  expect(KNOW_READ).toEqual(['status', 'stale'])
  expect(KNOW_WRITE).toEqual(['add', 'remove', 'vision', 'term'])
})

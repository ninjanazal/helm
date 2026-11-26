import type { EngineInterface } from 'claude-code'
import { TABLES_DIR } from './tables'

/**
 * Knowledge store: a small index of where things live (topic -> paths + note) kept in .claude/helm/knowledge/,
 * injected as a capped system-prompt section. Glossary stays in repo-root GLOSSARY.md. No server, no embeddings.
 * Index line: `- <topic>: <path>[, <path>]{0,2} — <note>`.
 */

export type Entry = { topic: string; paths: string[]; note: string }
export type KnowStats = { entries: number; bytes: number; coverage: number; stale: number; tables?: number; last?: { op: 'read' | 'write'; at: number } }

export const KNOW_READ = ['status', 'stale'] as const
export const KNOW_WRITE = ['add', 'remove', 'vision', 'term'] as const
const LAST_KEY = 'knowledge.last'

export const KNOWLEDGE_DIR = '.claude/helm/knowledge'
export const KNOWLEDGE_ID = 'helm:knowledge'
const INDEX = `${KNOWLEDGE_DIR}/index.md`
const VISION = `${KNOWLEDGE_DIR}/vision.md`
const GLOSSARY = 'GLOSSARY.md'
const MAX_PATHS = 3
const MAX_NOTE = 80
const EXCLUDED = new Set(['docs', 'test', 'tests', 'fixtures', 'bench'])

const bytesOf = (s: string) => new TextEncoder().encode(s).length
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const clamp = (x: Entry): Entry => ({
  topic: oneLine(x.topic.replace(/:/g, ' -')),
  paths: x.paths.map(p => oneLine(p)).filter(p => p && !p.includes(',')).slice(0, MAX_PATHS),
  note: oneLine(x.note).slice(0, MAX_NOTE),
})

/** Parse index.md; lines that do not match the format are skipped, never thrown on. */
function parseLine(line: string): Entry | undefined {
  const m = /^- (.+?): (.+?)(?: — (.*))?$/.exec(line.trim())
  if (!m) return undefined
  const paths = m[2]!.split(',').map(p => p.trim()).filter(Boolean)
  if (!m[1]!.trim() || !paths.length) return undefined
  return clamp({ topic: m[1]!, paths, note: m[3] ?? '' })
}

export function parseIndex(md: string): Entry[] {
  return String(md ?? '').split('\n').map(parseLine).filter((x): x is Entry => !!x)
}

const formatEntry = (x: Entry) => `- ${x.topic}: ${x.paths.join(', ')}${x.note ? ` — ${x.note}` : ''}`

export function formatIndex(e: Entry[]): string {
  return e.map(formatEntry).join('\n') + (e.length ? '\n' : '')
}

/** Rewrite index.md for `e`, keeping the non-entry lines (headings, comments) of `old` where they were. */
function mergeIndex(old: string, e: Entry[]): string {
  const left = new Map(e.map(x => [x.topic.toLowerCase(), x]))
  const out: string[] = []
  for (const line of old.split('\n')) {
    const p = parseLine(line)
    if (!p) { if (line.trim()) out.push(line); continue }
    const k = p.topic.toLowerCase(), n = left.get(k)
    if (n) { out.push(formatEntry(n)); left.delete(k) }
  }
  for (const x of left.values()) out.push(formatEntry(x))
  return out.length ? out.join('\n') + '\n' : ''
}

const sameTopic = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Add, or replace in place when the topic matches case-insensitively. Paths clamp to 3, the note to 80. */
export function upsert(e: Entry[], x: Entry): Entry[] {
  const n = clamp(x)
  if (!n.topic || !n.paths.length) return e
  const i = e.findIndex(y => sameTopic(y.topic, n.topic))
  return i < 0 ? [...e, n] : e.map((y, j) => (j === i ? n : y))
}

export const removeEntry = (e: Entry[], topic: string): Entry[] => e.filter(y => !sameTopic(y.topic, oneLine(topic)))

/** Cut the index to `lines` lines and `bytes` bytes, ending with a "… N more entries" line when something was cut. */
export function capIndex(md: string, lines = 60, bytes = 4096): string {
  const all = md.split('\n').filter(l => l.trim())
  const size = (ls: string[]) => bytesOf(ls.join('\n') + '\n')
  if (all.length <= lines && size(all) <= bytes) return all.length ? all.join('\n') + '\n' : ''
  let keep = Math.min(all.length, Math.max(0, lines - 1))
  const more = (k: number) => `- … ${all.length - k} more entries (run /helm:map)`
  while (keep > 0 && size([...all.slice(0, keep), more(keep)]) > bytes) keep--
  return [...all.slice(0, keep), more(keep)].join('\n') + '\n'
}

/** Entries with at least one path that no longer exists. */
export const stale = (e: Entry[], exists: (p: string) => boolean): Entry[] => e.filter(x => x.paths.some(p => !exists(p)))

const topDirs = (tracked: string[]): string[] => {
  const ps = tracked.map(t => t.trim().replace(/^\.\//, '')).filter(Boolean)
  // any '/' means file output (bare names are top-level files); otherwise every entry is a dir name
  const files = ps.some(p => p.includes('/'))
  const d = new Set<string>()
  for (const p of ps) {
    if (files && !p.includes('/')) continue
    const top = p.split('/')[0]!
    if (top && !top.startsWith('.') && !EXCLUDED.has(top)) d.add(top)
  }
  return [...d]
}

/** Integer % of tracked top-level source dirs that have an entry path inside. 0 when there are none. */
export function coverage(e: Entry[], tracked: string[]): number {
  const dirs = topDirs(tracked)
  if (!dirs.length) return 0
  const paths = e.flatMap(x => x.paths.map(p => p.replace(/^\.\//, '')))
  const hit = dirs.filter(d => paths.some(p => p === d || p.startsWith(`${d}/`))).length
  return Math.floor((hit / dirs.length) * 100)
}

// ---- engine glue ----

async function cwd($: EngineInterface): Promise<string> {
  try { return (await $.session.cwd()) ?? '.' } catch { return '.' }
}
function readFile($: EngineInterface, p: string): Promise<string | undefined> {
  return Promise.resolve($.fs.read(p)).then(String).catch(() => undefined)
}

/** Which of these paths exist: readable as a file, or listable as a directory. */
async function existing($: EngineInterface, root: string, paths: string[]): Promise<Set<string>> {
  const ok = new Set<string>()
  await Promise.all([...new Set(paths)].map(async p => {
    const full = `${root}/${p.replace(/\/+$/, '')}`
    if (await Promise.resolve($.fs.read(full)).then(() => true, () => false)) return ok.add(p)
    if (await Promise.resolve($.fs.list(full)).then(() => true, () => false)) ok.add(p)
  }))
  return ok
}

async function trackedFiles($: EngineInterface, root: string, given?: unknown): Promise<string[]> {
  if (Array.isArray(given)) return given.map(String)
  const r = await $.process.run(['git', 'ls-files'], { cwd: root, timeoutMs: 5000 } as never).catch(() => undefined)
  return String((r as { stdout?: string } | undefined)?.stdout ?? '').split('\n').filter(Boolean)
}

const RULES = [
  '# Helm knowledge',
  'Check this index before searching; read linked files only when relevant.',
  'When you locate the code for a topic the index doesn\'t cover, call mcp__helm__knowledge add.',
  'When the person defines a term, call term; when they state a goal for the project, call vision. Write silently and say one line: noted: X.',
]

async function loadIndex($: EngineInterface): Promise<{ root: string; md: string | undefined; entries: Entry[] }> {
  const root = await cwd($)
  const md = await readFile($, `${root}/${INDEX}`)
  return { root, md, entries: parseIndex(md ?? '') }
}

type Last = NonNullable<KnowStats['last']>
async function readLast($: EngineInterface): Promise<Last | undefined> {
  try {
    const v = (await $.store.get(LAST_KEY)) as Partial<Last> | undefined
    return v && (v.op === 'read' || v.op === 'write') && typeof v.at === 'number' ? { op: v.op, at: v.at } : undefined
  } catch { return undefined }
}
async function writeLast($: EngineInterface, op: Last['op']): Promise<void> {
  try { await $.store.set(LAST_KEY, { op, at: Date.now() }) } catch { /* no store */ }
}
function ago(at: number): string {
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000))
  return sec < 60 ? `${sec}s ago` : sec < 3600 ? `${Math.floor(sec / 60)}m ago` : sec < 86400 ? `${Math.floor(sec / 3600)}h ago` : `${Math.floor(sec / 86400)}d ago`
}

/** The section text: '' with no store. Stale entries are left out of the injected index, not deleted. */
export async function knowledgeSection($: EngineInterface): Promise<string> {
  const { root, md, entries: e } = await loadIndex($)
  if (md === undefined) {
    try {
      await $.fs.write(`${root}/${INDEX}`, '# Knowledge index\n')
    } catch {
      return RULES.join('\n')
    }
    return [...RULES, '(no entries yet)'].join('\n')
  }
  const ok = await existing($, root, e.flatMap(x => x.paths))
  const live = e.filter(x => x.paths.every(p => ok.has(p)))
  return [...RULES, capIndex(formatIndex(live)).trimEnd()].filter(Boolean).join('\n')
}

async function countTables($: EngineInterface, root: string): Promise<number> {
  try {
    const l = (await Promise.resolve($.fs.list(`${root}/${TABLES_DIR}`))) as unknown[]
    return (Array.isArray(l) ? l : []).map(e => (typeof e === 'string' ? e : (e as { name?: unknown } | null)?.name))
      .filter((n): n is string => typeof n === 'string' && /\.csv$/i.test(n) && !n.startsWith('.')).length
  } catch { return 0 }
}

export async function knowledgeStats($: EngineInterface, given?: string[]): Promise<KnowStats | undefined> {
  const { root, md, entries: e } = await loadIndex($)
  if (md === undefined) return undefined
  const ok = await existing($, root, e.flatMap(x => x.paths))
  return {
    entries: e.length,
    bytes: bytesOf(md),
    coverage: coverage(e, await trackedFiles($, root, given)),
    stale: stale(e, p => ok.has(p)).length,
    tables: await countTables($, root),
    last: await readLast($),
  }
}

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',').map(x => x.trim()) : []
const asText = (v: unknown) => (typeof v === 'string' ? oneLine(v) : '')

async function writeVision($: EngineInterface, root: string, text: string): Promise<string> {
  if (!text) return 'Need text.'
  const cur = (await readFile($, `${root}/${VISION}`)) ?? ''
  const key = (l: string) => l.trim().replace(/^- /, '').trim().toLowerCase()
  if (cur.split('\n').some(l => key(l) === text.toLowerCase())) return `noted: ${text}`
  await $.fs.write(`${root}/${VISION}`, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}- ${text}\n`)
  return `noted: ${text}`
}

async function writeTerm($: EngineInterface, root: string, term: string, def: string): Promise<string> {
  if (!term || !def) return 'Need a term and a definition.'
  const cur = (await readFile($, `${root}/${GLOSSARY}`)) ?? `# ${root.split('/').filter(Boolean).pop() ?? 'Glossary'}\n\n## Language\n`
  const head = `**${term}**:`.toLowerCase()
  const lines = cur.replace(/\n+$/, '').split('\n')
  const at = lines.findIndex(l => l.toLowerCase().startsWith(head))
  if (at >= 0) {
    let end = at + 1
    while (end < lines.length && lines[end]!.trim() !== '') end++
    const keep = lines.slice(at + 1, end).filter(l => l.startsWith('_Avoid_:'))
    lines.splice(at, end - at, `**${term}**:`, def, ...keep)
  } else {
    let h = lines.findIndex(l => l.trim() === '## Language')
    if (h < 0) { lines.push('', '## Language'); h = lines.length - 1 }
    let end = h + 1
    while (end < lines.length && !lines[end]!.startsWith('## ')) end++
    while (end > h + 1 && lines[end - 1]!.trim() === '') end--
    const after = end < lines.length
    lines.splice(end, 0, '', `**${term}**:`, def, ...(after && lines[end]!.trim() !== '' ? [''] : []))
  }
  await $.fs.write(`${root}/${GLOSSARY}`, lines.join('\n') + '\n')
  return `noted: ${term}`
}

/** The tool action. args: action, topic, paths, note, term, text (the definition or vision), tracked. Every reply is one line. */
export async function knowledgeSet($: EngineInterface, args: Record<string, unknown>): Promise<string> {
  const action = asText(args.action)
  const op: Last['op'] | undefined = (KNOW_READ as readonly string[]).includes(action) ? 'read'
    : (KNOW_WRITE as readonly string[]).includes(action) ? 'write' : undefined
  const { root, md, entries } = await loadIndex($)
  const save = (e: Entry[]) => Promise.resolve($.fs.write(`${root}/${INDEX}`, mergeIndex(md ?? '', e)))
  const out = await (async (): Promise<string> => {
    switch (action) {
      case 'add': {
        const x = clamp({ topic: asText(args.topic), paths: asList(args.paths), note: asText(args.note) })
        if (!x.topic || !x.paths.length) return 'Need a topic and at least one path.'
        await save(upsert(entries, x))
        return `noted: ${x.topic}`
      }
      case 'remove': {
        const t = asText(args.topic)
        const n = removeEntry(entries, t)
        if (n.length === entries.length) return `No entry "${t}".`
        await save(n)
        return `removed: ${t}`
      }
      case 'stale': {
        const ok = await existing($, root, entries.flatMap(x => x.paths))
        const st = stale(entries, p => ok.has(p)).map(x => x.topic)
        return st.length ? `Stale: ${st.join(', ')}` : 'No stale entries.'
      }
      case 'status': {
        const st = await knowledgeStats($, Array.isArray(args.tracked) ? args.tracked.map(String) : undefined)
        if (!st) return 'no knowledge yet'
        const last = st.last ? `, last ${st.last.op} ${ago(st.last.at)}` : ''
        return `${st.entries} entries, ${st.bytes} bytes, ${st.coverage}% coverage, ${st.stale} stale${last}`
      }
      case 'vision': return writeVision($, root, asText(args.text))
      case 'term': return writeTerm($, root, asText(args.term), asText(args.text))
      default:
        return 'Use add, remove, stale, status, vision or term.'
    }
  })()
  if (op) await writeLast($, op)
  return out
}

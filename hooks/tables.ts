import type { EngineInterface } from 'claude-code'

/**
 * Helm tables: read-only CSV files in .claude/helm/tables/, exposed as a names-and-columns session section
 * and the mcp__helm__table tool (list, schema, query). Rows come back exact (tabs/newlines escaped);
 * replies are capped at 8 KB, files at 1 MB (UTF-8 bytes). No writes, no server.
 */

export const TABLES_DIR = '.claude/helm/tables'
export const TABLES_ID = 'helm:tables'

const MAX_BYTES = 1_048_576
const MAX_REPLY = 8192
const enc = new TextEncoder()
const bytes = (s: string) => enc.encode(s).length

/** RFC 4180 parse. Strips BOM; CRLF/LF; rows padded/trimmed to header width; trailing blank line dropped. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  let any = false
  const endRow = () => { row.push(cell); rows.push(row); row = []; cell = ''; any = false }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else if (c === '"') { q = true; any = true }
    else if (c === ',') { row.push(cell); cell = ''; any = true }
    else if (c === '\r') { if (text[i + 1] === '\n') i++; endRow() }
    else if (c === '\n') endRow()
    else { cell += c; any = true }
  }
  if (any || cell) endRow()
  const kept = rows.filter(r => !(r.length === 1 && r[0] === ''))
  const w = kept[0]?.length ?? 0
  return kept.map(r => (r.length === w ? r : Array.from({ length: w }, (_, i) => r[i] ?? '')))
}

/** Empty -> col_N (1-based); duplicates -> name_2, name_3. */
export function normHeader(h: string[]): string[] {
  const seen = new Map<string, number>()
  return h.map((raw, i) => {
    const name = raw.trim() || `col_${i + 1}`
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    return n === 1 ? name : `${name}_${n}`
  })
}

type Table = { name: string; file: string; large?: boolean; dup?: boolean; cols: string[]; rows: string[][] }

async function cwd($: EngineInterface): Promise<string> {
  try { return (await $.session.cwd()) ?? '.' } catch { return '.' }
}

async function load($: EngineInterface): Promise<Table[]> {
  const dir = `${await cwd($)}/${TABLES_DIR}`
  let entries: unknown[]
  try { entries = (await Promise.resolve($.fs.list(dir))) as unknown[] } catch { return [] }
  const files = (Array.isArray(entries) ? entries : [])
    .map(e => (typeof e === 'string' ? e : (e as { name?: unknown } | null)?.name))
    .filter((n): n is string => typeof n === 'string' && /\.csv$/i.test(n) && !n.startsWith('.') && !n.includes('/'))
    .sort()
  const seen = new Set<string>()
  const out = await Promise.all(files.map(async (file): Promise<Table | undefined> => {
    const name = file.replace(/\.csv$/i, '')
    if (seen.has(name.toLowerCase())) return { name, file, dup: true, cols: [], rows: [] }
    seen.add(name.toLowerCase())
    const text = await Promise.resolve($.fs.read(`${dir}/${file}`)).then(String).catch(() => undefined)
    if (text === undefined) return undefined
    if (bytes(text) > MAX_BYTES) return { name, file, large: true, cols: [], rows: [] }
    const all = parseCsv(text)
    return { name, file, cols: normHeader(all[0] ?? []), rows: all.slice(1) }
  }))
  return out.filter((t): t is Table => !!t)
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Session section: names and columns only, never row data. '' when there are no tables. */
export async function tablesSection($: EngineInterface): Promise<string> {
  const ts = (await load($).catch(() => [] as Table[])).filter(t => !t.dup)
  if (!ts.length) return ''
  const head = ['# Helm tables', 'Read-only CSV tables. Fetch rows with mcp__helm__table (list, schema, query); never read the CSV files directly.']
  const lines = ts.map(t => t.large ? `- ${t.name} (too large)` : clip(`- ${t.name} (${t.rows.length} rows): ${t.cols.join(', ')}`, 120))
  const keep: string[] = []
  for (const l of lines) {
    const next = [...head, ...keep, l, `- … ${lines.length - keep.length - 1} more tables`].join('\n') + '\n'
    if (keep.length + head.length + 2 > 60 || bytes(next) > 4096) break
    keep.push(l)
  }
  if (keep.length < lines.length) keep.push(`- … ${lines.length - keep.length} more tables`)
  return [...head, ...keep].join('\n') + '\n'
}

const esc = (s: string) => s.replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
function clipBytes(s: string, n: number): string {
  if (bytes(s) <= n) return s
  let out = ''
  let used = 0
  for (const ch of s) {
    const b = bytes(ch)
    if (used + b > n - 3) break
    out += ch
    used += b
  }
  return `${out}…`
}
/** Lines (header first) packed under the reply budget; an over-long line is clipped and ends the list. */
function pack(lines: string[]): { out: string[]; shown: number; cut: boolean } {
  const budget = MAX_REPLY - 64
  const out: string[] = []
  let used = 0
  for (const [i, l] of lines.entries()) {
    const room = budget - used - (out.length ? 1 : 0)
    if (bytes(l) > room) {
      out.push(clipBytes(l, Math.max(room, 3)))
      return { out, shown: Math.max(0, i), cut: true }
    }
    out.push(l)
    used += bytes(l) + (out.length > 1 ? 1 : 0)
  }
  return { out, shown: Math.max(0, lines.length - 1), cut: false }
}
const lc = (s: string) => s.toLowerCase()
const asMap = (v: unknown): [string, string][] =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v as object).filter(([, x]) => x != null && typeof x !== 'object').map(([k, x]) => [k, String(x)]) : []

/** mcp__helm__table: action list | schema | query (table, columns, where exact, contains substring, limit <= 50). Rows exact, tabs/newlines escaped; reply <= 8 KB. */
export async function tableTool($: EngineInterface, args: Record<string, unknown>): Promise<string> {
  const all0 = await load($).catch(() => [] as Table[])
  if (!all0.length) return 'no tables yet'
  const ts = all0.filter(t => !t.dup)
  const action = String(args.action ?? 'list')
  if (action === 'list') return all0.map(t => t.dup ? `${t.name} (duplicate name, skipped)` : t.large ? `${t.name} (too large)` : `${t.name} (${t.rows.length} rows): ${t.cols.join(', ')}`).join('\n')
  const t = ts.find(x => lc(x.name) === lc(String(args.table ?? '')))
  if (!t) return `unknown table "${String(args.table ?? '')}". tables: ${ts.map(x => x.name).join(', ')}`
  if (t.large) return `${t.name} is too large (over 1 MB) to read`
  const fmt = (r: string[], idx: number[]) => idx.map(i => esc(r[i] ?? '')).join('\t')
  const all = t.cols.map((_, i) => i)
  if (action === 'schema') {
    const p = pack([t.cols.map(esc).join('\t'), ...t.rows.slice(0, 3).map(r => fmt(r, all))])
    return [`${t.name} (${t.rows.length} rows)`, ...p.out].join('\n')
  }
  if (action !== 'query') return `unknown action "${action}". use list, schema or query`
  const want = Array.isArray(args.columns) ? args.columns.map(String) : []
  const idx = want.length ? want.map(c => t.cols.findIndex(x => lc(x) === lc(c))) : all
  const bad = want.filter((_, i) => idx[i] === -1)
  if (bad.length) return `unknown column ${bad.join(', ')}. columns: ${t.cols.join(', ')}`
  const conds: { i: number; v: string; exact: boolean }[] = []
  for (const [kind, v] of [['where', args.where], ['contains', args.contains]] as const) {
    for (const [k, val] of asMap(v)) {
      const i = t.cols.findIndex(x => lc(x) === lc(k))
      if (i === -1) return `unknown column ${k}. columns: ${t.cols.join(', ')}`
      conds.push({ i, v: lc(val), exact: kind === 'where' })
    }
  }
  const hits = t.rows.filter(r => conds.every(c => { const x = lc((r[c.i] ?? '').trim()); return c.exact ? x === c.v : x.includes(c.v) }))
  const n = Number(args.limit)
  const limit = Math.min(50, Math.max(1, Number.isFinite(n) && n > 0 ? Math.floor(n) : 20))
  const head = idx.map(i => esc(t.cols[i]!)).join('\t')
  const p = pack([head, ...hits.slice(0, limit).map(r => fmt(r, idx))])
  if (p.cut || p.shown < hits.length || !hits.length) p.out.push(`${p.shown} of ${hits.length} rows shown`)
  return p.out.join('\n')
}

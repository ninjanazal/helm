import type { EngineInterface } from 'claude-code'

/** The atlas to ask: this project's own (make atlas SCOPE=local), else the user's, else whatever PATH finds. */
export async function atlasBin($: EngineInterface, cwd: string | undefined): Promise<string | undefined> {
  const home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
  for (const p of [cwd ? `${cwd}/.atlas/bin/atlas` : '', home ? `${home}/.local/bin/atlas` : ''].filter(Boolean)) {
    const dir = p.slice(0, p.lastIndexOf('/'))
    if (await $.fs.list(dir).then(l => l.some(f => f.name === 'atlas'), () => false)) return p
  }
  const r = await $.process.run(['sh', '-c', 'command -v atlas'], { timeoutMs: 2000 }).catch(() => undefined)
  return r && r.exitCode === 0 ? String(r.stdout).trim() || undefined : undefined
}

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const parse = (text: unknown): unknown => {
  try {
    return JSON.parse(String(text))
  } catch {
    return undefined
  }
}

/** One-paragraph state of the index from `atlas status --json` and `atlas stats --json`. */
export function atlasReport(status: unknown, stats: unknown): string {
  const st = obj(status)
  const state = st?.state
  if (state !== 'fresh' && state !== 'stale') return 'atlas: not indexed. Run /helm:atlas refresh to build the index.'
  const s = obj(stats)
  const counts = s ? ` · ${num(s.files)} files (${num(s.code_files)} code, ${num(s.text_files)} text) · ${num(s.symbols)} symbols` : ''
  if (state === 'fresh') return `atlas: fresh${counts}.`
  return `atlas: stale · ${num(st?.changed)} changed, ${num(st?.added)} new, ${num(st?.removed)} deleted since the last index${counts}. Run /helm:atlas refresh.`
}

export type AtlasAnswer = { text: string; isError: boolean }
type Lookup = (cwd: string | undefined) => Promise<string | undefined>
export type Ran = { exitCode: number; stdout: unknown; stderr: unknown }
export type Runner = (argv: string[], opts: { cwd?: string; timeoutMs: number }) => Promise<Ran>

/** /helm:atlas: status reports the index; refresh rebuilds it for the project root, then reports. */
export async function atlasTool(
  $: EngineInterface,
  action: 'status' | 'refresh',
  cwd: string | undefined,
  lookup: Lookup = c => atlasBin($, c),
  run: Runner = (argv, opts) => $.process.run(argv, opts) as Promise<Ran>,
): Promise<AtlasAnswer> {
  const bin = await lookup(cwd).catch(() => undefined)
  if (!bin) return { text: 'atlas is not installed. Run `make atlas` (this project) or `make atlas SCOPE=user` (every project) in the helm repo.', isError: false }
  const opts = cwd ? { cwd, timeoutMs: 5000 } : { timeoutMs: 5000 }
  let head = ''
  if (action === 'refresh') {
    const r = await run([bin, 'index', '--root', cwd ?? '.'], { ...opts, timeoutMs: 120000 }).catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
    if (r.exitCode !== 0) return { text: `atlas index failed: ${String(r.stderr || r.stdout).trim().slice(0, 200)}`, isError: true }
    head = `${String(r.stdout).trim().split('\n').filter(Boolean).at(-1) ?? 'indexed'}\n`
  }
  const [st, ss] = await Promise.all([
    run([bin, 'status', '--json'], opts).catch(() => undefined),
    run([bin, 'stats', '--json'], opts).catch(() => undefined),
  ])
  return { text: head + atlasReport(st?.exitCode === 0 ? parse(st.stdout) : undefined, ss?.exitCode === 0 ? parse(ss.stdout) : undefined), isError: false }
}

import type { EngineInterface } from 'claude-code'

/**
 * The current task: the prompt approved with /helm:prompt, saved to .claude/helm/task.md. Its `# <goal>` line
 * anchors the deck. Everything goes through `Io`, so it is tested without an engine.
 */

export type Io = {
  read(path: string): Promise<string>
  write(path: string, text: string): Promise<void>
}

export const TASK_FILE = '.claude/helm/task.md'
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

export async function setTask(io: Io, root: string, prompt: string, goal: string): Promise<void> {
  await io.write(`${root}/${TASK_FILE}`, `# ${oneLine(goal)}\n\n${prompt.trim()}\n`)
}

export async function getTask(io: Io, root: string): Promise<string | undefined> {
  const t = await io.read(`${root}/${TASK_FILE}`).catch(() => undefined)
  return t?.trim() ? t : undefined
}

export function engineIo($: EngineInterface): Io {
  return {
    read: p => $.fs.read(p),
    write: (p, t) => $.fs.write(p, t) as Promise<void>,
  }
}

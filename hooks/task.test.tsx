import { expect, test } from 'claude-code/testing'
import { getTask, setTask } from './task'
import type { Io } from './task'

function memIo(files: Record<string, string> = {}) {
  const io: Io = {
    read: async p => (p in files ? files[p] : Promise.reject(new Error('ENOENT'))),
    write: async (p, t) => { files[p] = t },
  }
  return { io, files }
}

test('task file: set writes goal and prompt, get reads it back', async () => {
  const { io, files } = memIo()
  expect(await getTask(io, '/p')).toBe(undefined)
  await setTask(io, '/p', 'Full prompt.', 'Add a flag')
  expect(files['/p/.claude/helm/task.md']).toBe('# Add a flag\n\nFull prompt.\n')
  expect(await getTask(io, '/p')).toBe('# Add a flag\n\nFull prompt.\n')
})

test('task file: a multi-line goal is folded to one line, an empty file reads as no task', async () => {
  const { io, files } = memIo({ '/p/.claude/helm/task.md': '  \n' })
  expect(await getTask(io, '/p')).toBe(undefined)
  await setTask(io, '/p', '  Do it.  ', 'Fix\n  the bug')
  expect(files['/p/.claude/helm/task.md']).toBe('# Fix the bug\n\nDo it.\n')
})

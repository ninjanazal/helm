import type { EngineInterface } from 'claude-code'
import { engineIo, setTask } from './task'
import { leanSet } from './lean'
import { workloadSet } from './workload'
import { testingSet } from './testing'
import { deckOpenNow, deckReset, deckSet, deckTask } from './deck'

/**
 * helm's tools. Each /helm:<verb> skill calls one of these and shows its text as is: the tool does the work,
 * so the outcome never depends on how the model reads the request.
 */

/** A plugin tool's answer is { result: string }; an error is a deny. */
export function toolText(text: string, isError = false) {
  return (isError ? { deny: text } : { result: text }) as never
}

export function toolArgs(e: object): Record<string, unknown> {
  const { tool: _tool, tool_use_id: _id, agentId: _agent, ...args } = e as Record<string, unknown>
  return args
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

export async function registerHelmTools($: EngineInterface): Promise<void> {
  await $.tool.register({
    name: 'deck',
    description:
      'Controls the helm deck pane. action: open (show it; turns it on), on (turn on for this project and open), ' +
      'off (turn off for this project and close; stays off across /clear and new sessions), task (re-anchor the task to text), reset.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['open', 'on', 'off', 'task', 'reset'] },
        text: { type: 'string', description: 'For task: the task in one line' },
      },
    },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'lean',
    description: 'Lean mode (fewer output tokens, on by default). action: on, off, lite, full, or status.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: { action: { type: 'string', enum: ['on', 'off', 'lite', 'full', 'status'] } },
    },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'workload',
    description: 'Workload: how much work goes to cheaper sub agents. action: off, sometimes, always, or status.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: { action: { type: 'string', enum: ['off', 'sometimes', 'always', 'status'] } },
    },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'testing',
    description: 'Testing: how much testing helm writes and runs. action: off, light, thorough, or status.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: { action: { type: 'string', enum: ['off', 'light', 'thorough', 'status'] } },
    },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'set_task',
    description:
      'Saves the approved prompt as the current task (.claude/helm/task.md) and sets the deck task to its goal. ' +
      'Call it only after the person approved the prompt.',
    inputSchema: {
      type: 'object',
      required: ['prompt', 'goal'],
      properties: {
        prompt: { type: 'string', description: 'The full approved prompt' },
        goal: { type: 'string', description: 'The prompt\'s goal in one line' },
      },
    },
    isDeferred: false,
  })
}

/** Runs a helm tool; undefined when `tool` is not one of helm's. */
export async function handleHelmTool($: EngineInterface, tool: string, args: Record<string, unknown>): Promise<unknown | undefined> {
  if (tool === 'mcp__helm__deck') {
    const action = str(args.action)
    if (action === 'on') return toolText(await deckSet($, true))
    if (action === 'off') return toolText(await deckSet($, false))
    if (action === 'open') return toolText(await deckOpenNow($))
    if (action === 'reset') return toolText(await deckReset($))
    if (action === 'task') {
      const text = str(args.text)?.trim()
      return text ? toolText(await deckTask($, text)) : toolText('Error: task needs text.', true)
    }
    return toolText('Error: action is one of open, on, off, task, reset.', true)
  }
  if (tool === 'mcp__helm__lean') {
    const a = str(args.action)
    return toolText(await leanSet($, a === 'on' ? 'full' : a))
  }
  if (tool === 'mcp__helm__workload') return toolText(await workloadSet($, str(args.action)))
  if (tool === 'mcp__helm__testing') return toolText(await testingSet($, str(args.action)))
  if (tool === 'mcp__helm__set_task') {
    const prompt = str(args.prompt)?.trim()
    const goal = str(args.goal)?.trim()
    if (!prompt || !goal) return toolText('Error: set_task needs prompt and goal.', true)
    const root = (await $.session.cwd().catch(() => undefined)) ?? '.'
    await setTask(engineIo($), root, prompt, goal)
    await deckTask($, goal)
    return toolText(`Task saved: ${goal}. Say "go" to work on it here.`)
  }
  return undefined
}

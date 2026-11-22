import type { EngineInterface } from 'claude-code'
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
  return undefined
}

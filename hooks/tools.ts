import type { EngineInterface } from 'claude-code'
import { engineIo, launchAgent, listAgents, agentLine, saveAgent, setTask } from './agents'
import type { AgentSpec } from './agents'
import { atlasTool } from './atlas'
import { detectHerdr } from './herdr'
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
    name: 'atlas',
    description: 'Reports the atlas code index for this project (status: fresh, stale or not indexed, with counts), or rebuilds it (refresh).',
    inputSchema: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['status', 'refresh'] } } },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'set_task',
    description:
      'Saves the approved prompt as the current task (.claude/helm/task.md, read by agents started with /helm:agent) and sets the deck task to its goal. ' +
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
  await $.tool.register({
    name: 'agent_list',
    description: 'Lists saved agents (project .claude/agents and ~/.claude/agents): one line each with name, model, effort, tools, where it is saved and what it is for.',
    inputSchema: { type: 'object', properties: {} },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'agent_save',
    description: 'Saves an agent definition to .claude/agents/<name>.md in this project. Call it only after the person approved the definition and its name.',
    inputSchema: {
      type: 'object',
      required: ['name', 'description', 'instructions'],
      properties: {
        name: { type: 'string', description: 'lowercase letters, digits and -' },
        description: { type: 'string', description: 'One line: what the agent is for' },
        model: { type: 'string', description: 'e.g. opus, sonnet, haiku; leave out to inherit' },
        effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
        tools: { type: 'array', items: { type: 'string' }, description: 'Tools it may use; leave out for all tools' },
        instructions: { type: 'string', description: 'The agent\'s system prompt' },
        overwrite: { type: 'boolean' },
      },
    },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'agent_launch',
    description: 'Starts a saved agent in a new herdr tab named after it, on the current task (.claude/helm/task.md). Needs herdr and an approved task.',
    inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
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
  if (tool === 'mcp__helm__atlas') {
    const action = str(args.action) ?? 'status'
    if (action !== 'status' && action !== 'refresh') return toolText('Error: action is status or refresh.', true)
    const r = await atlasTool($, action, await $.session.cwd().catch(() => undefined))
    return toolText(r.text, r.isError)
  }
  if (tool === 'mcp__helm__set_task' || tool.startsWith('mcp__helm__agent_')) {
    const root = (await $.session.cwd().catch(() => undefined)) ?? '.'
    const home = (await $.env.get('HOME').catch(() => undefined)) || undefined
    const io = engineIo($)
    if (tool === 'mcp__helm__set_task') {
      const prompt = str(args.prompt)?.trim()
      const goal = str(args.goal)?.trim()
      if (!prompt || !goal) return toolText('Error: set_task needs prompt and goal.', true)
      await setTask(io, root, prompt, goal)
      await deckTask($, goal)
      return toolText(`Task saved: ${goal}. Work on it here, or hand it off with /helm:agent [name].`)
    }
    if (tool === 'mcp__helm__agent_list') {
      const all = await listAgents(io, root, home)
      return toolText(all.length ? all.map(agentLine).join('\n') : 'No agents saved yet. Run /helm:agent to define one for the current task.')
    }
    if (tool === 'mcp__helm__agent_save') {
      const name = str(args.name)?.trim() ?? ''
      const spec: AgentSpec = { name, description: str(args.description) ?? '', instructions: str(args.instructions) ?? '' }
      if (str(args.model)) spec.model = str(args.model)
      if (str(args.effort)) spec.effort = str(args.effort)
      if (Array.isArray(args.tools) && args.tools.length) spec.tools = args.tools.filter((t): t is string => typeof t === 'string')
      const r = await saveAgent(io, root, spec, args.overwrite === true)
      return toolText(r.text, r.isError)
    }
    if (tool === 'mcp__helm__agent_launch') {
      const name = str(args.name)?.trim()
      if (!name) return toolText('Error: agent_launch needs a name.', true)
      const agentEnv = (await $.env.get('HELM_AGENT').catch(() => undefined)) || undefined
      const r = await launchAgent(io, { root, home, herdr: await detectHerdr($), agentEnv }, name)
      return toolText(r.text, r.isError)
    }
  }
  return undefined
}

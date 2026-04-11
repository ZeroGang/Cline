import type { Message, ContentBlock, AgentContext, QueryDeps, AgentDefinition } from './types.js'
import type { AgentEvent, Task } from '../scheduler/types.js'
import { StreamingToolExecutor, type ToolUseBlock } from './streaming-executor.js'
import { ContextManager } from './context-manager.js'

export interface AgentLoopState {
  messages: Message[]
  turn: number
  maxTurns: number
  aborted: boolean
  detained: boolean
  lastContentBlockIndex: number
}

export interface AgentLoopConfig {
  maxTurns: number
  contextManager: ContextManager
  deps: QueryDeps
  definition: AgentDefinition
}

function isToolUseBlock(block: ContentBlock): block is ContentBlock & { type: 'tool_use'; name: string; input: Record<string, unknown> } {
  return block.type === 'tool_use' && typeof block.name === 'string' && typeof block.input === 'object'
}

function shouldTerminate(state: AgentLoopState, lastMessage: Message | null): boolean {
  if (state.aborted) {
    return true
  }

  if (state.turn >= state.maxTurns) {
    return true
  }

  if (!lastMessage) {
    return false
  }

  if (lastMessage.role === 'assistant') {
    if (typeof lastMessage.content === 'string') {
      return true
    }

    const hasToolUse = lastMessage.content.some(block => block.type === 'tool_use')
    if (!hasToolUse) {
      return true
    }
  }

  return false
}

function createSyntheticAbortResult(toolUseId: string): Message {
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: 'Operation was interrupted by user',
        is_error: true
      }
    ]
  }
}

function extractToolUseBlocks(message: Message): ToolUseBlock[] {
  if (typeof message.content === 'string') {
    return []
  }

  const blocks: ToolUseBlock[] = []
  for (const block of message.content) {
    if (isToolUseBlock(block)) {
      blocks.push({
        type: 'tool_use',
        id: block.tool_use_id || `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: block.name,
        input: block.input
      })
    }
  }

  return blocks
}

async function* agentLoop(
  task: Task,
  context: AgentContext,
  config: AgentLoopConfig
): AsyncGenerator<AgentEvent> {
  const state: AgentLoopState = {
    messages: [{ role: 'user', content: task.prompt }],
    turn: 0,
    maxTurns: config.maxTurns || 100,
    aborted: false,
    detained: false,
    lastContentBlockIndex: 0
  }

  const executor = new StreamingToolExecutor(context.tools)
  let lastMessage: Message | null = null

  const abortHandler = () => {
    state.aborted = true
  }
  context.abortController.signal.addEventListener('abort', abortHandler)

  try {
    while (!shouldTerminate(state, lastMessage)) {
      state.turn++

      yield {
        type: 'turn_start',
        agentId: context.toolPermissionContext.sessionId,
        taskId: task.id,
        timestamp: Date.now(),
        data: { turn: state.turn }
      }

      const compressedMessages = await config.contextManager.applyContextPipeline(
        state.messages,
        config.deps.autocompact
      )

      const tools = context.tools.getAll().map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema
      }))

      let assistantMessage: Message | null = null
      let hasMaxTokensError = false

      try {
        for await (const modelMessage of config.deps.callModel(compressedMessages, tools)) {
          if (state.aborted) {
            break
          }

          assistantMessage = modelMessage
          state.messages.push(modelMessage)

          yield {
            type: 'model_response',
            agentId: context.toolPermissionContext.sessionId,
            taskId: task.id,
            timestamp: Date.now(),
            data: { message: modelMessage }
          }

          if (typeof modelMessage.content !== 'string') {
            for (const block of modelMessage.content) {
              if (isToolUseBlock(block)) {
                const toolUseBlock: ToolUseBlock = {
                  type: 'tool_use',
                  id: block.tool_use_id || config.deps.uuid(),
                  name: block.name,
                  input: block.input
                }
                executor.addTool(toolUseBlock)

                yield {
                  type: 'tool_start',
                  agentId: context.toolPermissionContext.sessionId,
                  taskId: task.id,
                  timestamp: Date.now(),
                  data: { toolName: block.name, toolUseId: toolUseBlock.id }
                }
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('max_output_tokens')) {
          hasMaxTokensError = true
          state.detained = true

          yield {
            type: 'detention',
            agentId: context.toolPermissionContext.sessionId,
            taskId: task.id,
            timestamp: Date.now(),
            data: { reason: 'max_output_tokens exceeded' }
          }

          state.messages.push({
            role: 'user',
            content: 'Please continue your response.'
          })
        } else {
          throw error
        }
      }

      if (state.aborted) {
        const pendingToolUses = extractToolUseBlocks(assistantMessage || { role: 'assistant', content: [] })
        for (const toolUse of pendingToolUses) {
          const syntheticResult = createSyntheticAbortResult(toolUse.id)
          state.messages.push(syntheticResult)

          yield {
            type: 'tool_result',
            agentId: context.toolPermissionContext.sessionId,
            taskId: task.id,
            timestamp: Date.now(),
            data: { toolUseId: toolUse.id, result: syntheticResult }
          }
        }

        yield {
          type: 'aborted',
          agentId: context.toolPermissionContext.sessionId,
          taskId: task.id,
          timestamp: Date.now(),
          data: { reason: 'User interrupted' }
        }
        break
      }

      if (executor.hasPending() || executor.hasCompleted()) {
        const results = await executor.waitForCompletion()
        const toolResultMessages = executor.createToolResultMessages()
        state.messages.push(...toolResultMessages)

        for (const result of results) {
          yield {
            type: 'tool_result',
            agentId: context.toolPermissionContext.sessionId,
            taskId: task.id,
            timestamp: Date.now(),
            data: result
          }
        }

        executor.clear()
      }

      if (!hasMaxTokensError && assistantMessage) {
        lastMessage = assistantMessage
      }

      yield {
        type: 'turn_end',
        agentId: context.toolPermissionContext.sessionId,
        taskId: task.id,
        timestamp: Date.now(),
        data: { turn: state.turn }
      }
    }

    yield {
      type: 'completed',
      agentId: context.toolPermissionContext.sessionId,
      taskId: task.id,
      timestamp: Date.now(),
      data: {
        turns: state.turn,
        finalMessage: lastMessage
      }
    }
  } finally {
    context.abortController.signal.removeEventListener('abort', abortHandler)
  }
}

function createAgentLoopConfig(
  definition: AgentDefinition,
  deps: QueryDeps
): AgentLoopConfig {
  return {
    maxTurns: definition.maxTurns || 100,
    contextManager: new ContextManager(),
    deps,
    definition
  }
}

export {
  agentLoop,
  shouldTerminate,
  createSyntheticAbortResult,
  extractToolUseBlocks,
  createAgentLoopConfig
}

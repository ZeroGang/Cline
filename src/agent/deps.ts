import type { Message, QueryDeps } from './types.js'
import { randomUUID } from 'crypto'

export function productionDeps(): QueryDeps {
  return {
    callModel: async function* (_messages: Message[], _tools: unknown[]): AsyncGenerator<Message> {
      yield {
        role: 'assistant',
        content: 'Production model call not implemented yet'
      }
    },
    autocompact: async (messages: Message[]): Promise<Message[]> => {
      return messages
    },
    microcompact: async (messages: Message[]): Promise<Message[]> => {
      return messages
    },
    uuid: () => randomUUID()
  }
}

export interface TestDepsOptions {
  callModel?: (messages: Message[], tools: unknown[]) => AsyncGenerator<Message>
  autocompact?: (messages: Message[]) => Promise<Message[]>
  microcompact?: (messages: Message[]) => Promise<Message[]>
  uuid?: () => string
}

export function testDeps(options: TestDepsOptions = {}): QueryDeps {
  return {
    callModel: options.callModel ?? (async function* (_messages: Message[], _tools: unknown[]): AsyncGenerator<Message> {
      yield {
        role: 'assistant',
        content: 'Test response'
      }
    }),
    autocompact: options.autocompact ?? (async (messages: Message[]) => messages),
    microcompact: options.microcompact ?? (async (messages: Message[]) => messages),
    uuid: options.uuid ?? (() => 'test-uuid-0000-0000-0000-000000000000')
  }
}

export function createMockMessage(role: 'user' | 'assistant' | 'system', content: string): Message {
  return { role, content }
}

export function createMockToolUse(name: string, input: Record<string, unknown>): Message {
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        name,
        input
      }
    ]
  }
}

export function createMockToolResult(toolUseId: string, content: string, isError = false): Message {
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content,
        is_error: isError
      }
    ]
  }
}

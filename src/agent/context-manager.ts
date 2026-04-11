import type { Message, ContentBlock } from '../agent/types.js'

export interface ContextManagerConfig {
  maxToolResultSize: number
  maxContextSize: number
  snipThreshold: number
  microCompactThreshold: number
  collapseThreshold: number
  autoCompactThreshold: number
}

export const DEFAULT_CONTEXT_CONFIG: ContextManagerConfig = {
  maxToolResultSize: 50000,
  maxContextSize: 200000,
  snipThreshold: 0.9,
  microCompactThreshold: 0.8,
  collapseThreshold: 0.85,
  autoCompactThreshold: 0.95
}

export class CircuitBreaker {
  private failures: number = 0
  private lastFailure: number = 0
  private readonly threshold: number
  private readonly resetTime: number

  constructor(threshold = 3, resetTime = 60000) {
    this.threshold = threshold
    this.resetTime = resetTime
  }

  canExecute(): boolean {
    if (this.failures >= this.threshold) {
      return Date.now() - this.lastFailure > this.resetTime
    }
    return true
  }

  recordFailure(): void {
    this.failures++
    this.lastFailure = Date.now()
  }

  recordSuccess(): void {
    this.failures = 0
  }

  reset(): void {
    this.failures = 0
    this.lastFailure = 0
  }

  getFailureCount(): number {
    return this.failures
  }
}

function isContentBlockArray(content: string | ContentBlock[]): content is ContentBlock[] {
  return Array.isArray(content)
}

function isToolResultBlock(block: ContentBlock): boolean {
  return block.type === 'tool_result'
}

function getFirstBlock(content: ContentBlock[]): ContentBlock | undefined {
  return content[0]
}

export class ContextManager {
  private config: ContextManagerConfig
  private circuitBreaker: CircuitBreaker

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config }
    this.circuitBreaker = new CircuitBreaker()
  }

  applyToolResultBudget(result: string): string {
    if (result.length <= this.config.maxToolResultSize) {
      return result
    }
    
    const truncated = result.substring(0, this.config.maxToolResultSize)
    return truncated + '\n... [truncated]'
  }

  estimateTokenCount(messages: Message[]): number {
    let count = 0
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        count += msg.content.length / 4
      } else {
        for (const block of msg.content) {
          if (block.text) {
            count += block.text.length / 4
          }
          if (block.content) {
            count += block.content.length / 4
          }
        }
      }
    }
    return Math.ceil(count)
  }

  snipCompactIfNeeded(messages: Message[]): Message[] {
    const tokenCount = this.estimateTokenCount(messages)
    const threshold = this.config.maxContextSize * this.config.snipThreshold
    
    if (tokenCount < threshold) {
      return messages
    }

    const result: Message[] = []
    let currentTokens = 0
    const targetTokens = this.config.maxContextSize * 0.7

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (!msg) continue
      
      const msgTokens = this.estimateTokenCount([msg])
      
      if (currentTokens + msgTokens <= targetTokens || result.length === 0) {
        result.unshift(msg)
        currentTokens += msgTokens
      } else {
        break
      }
    }

    if (result.length < messages.length) {
      result.unshift({
        role: 'system',
        content: '[Earlier messages truncated to fit context budget]'
      })
    }

    return result
  }

  microCompact(messages: Message[]): Message[] {
    const result: Message[] = []
    
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push(msg)
        continue
      }

      const filteredBlocks: ContentBlock[] = []
      for (const block of msg.content) {
        if (isToolResultBlock(block) && block.content && block.content.length > 10000) {
          filteredBlocks.push({
            ...block,
            content: block.content.substring(0, 5000) + '\n... [output truncated]'
          })
        } else {
          filteredBlocks.push(block)
        }
      }

      result.push({ ...msg, content: filteredBlocks })
    }

    return result
  }

  applyCollapsesIfNeeded(messages: Message[]): Message[] {
    const result: Message[] = []
    let i = 0

    while (i < messages.length) {
      const msg = messages[i]
      if (!msg) {
        i++
        continue
      }

      if (
        msg.role === 'user' &&
        isContentBlockArray(msg.content) &&
        msg.content.length === 1
      ) {
        const firstBlock = getFirstBlock(msg.content)
        if (firstBlock && isToolResultBlock(firstBlock)) {
          let toolResultCount = 1
          let j = i + 1

          while (j < messages.length) {
            const nextMsg = messages[j]
            if (!nextMsg || nextMsg.role !== 'user') break
            
            if (!isContentBlockArray(nextMsg.content) || nextMsg.content.length !== 1) break
            
            const nextBlock = getFirstBlock(nextMsg.content)
            if (!nextBlock || !isToolResultBlock(nextBlock)) break
            
            toolResultCount++
            j++
          }

          if (toolResultCount > 3) {
            result.push({
              role: 'user',
              content: `[${toolResultCount} tool results collapsed]`
            })
            i = j
            continue
          }
        }
      }

      result.push(msg)
      i++
    }

    return result
  }

  async autoCompact(
    messages: Message[],
    compactFn: (msgs: Message[]) => Promise<Message[]>
  ): Promise<Message[]> {
    const tokenCount = this.estimateTokenCount(messages)
    const threshold = this.config.maxContextSize * this.config.autoCompactThreshold

    if (tokenCount < threshold) {
      return messages
    }

    if (!this.circuitBreaker.canExecute()) {
      return this.snipCompactIfNeeded(messages)
    }

    try {
      const compacted = await compactFn(messages)
      this.circuitBreaker.recordSuccess()
      return compacted
    } catch (error) {
      this.circuitBreaker.recordFailure()
      return this.snipCompactIfNeeded(messages)
    }
  }

  async applyContextPipeline(
    messages: Message[],
    compactFn: (msgs: Message[]) => Promise<Message[]> = async (m) => m
  ): Promise<Message[]> {
    let result = messages

    result = this.microCompact(result)

    result = this.applyCollapsesIfNeeded(result)

    result = await this.autoCompact(result, compactFn)

    result = this.snipCompactIfNeeded(result)

    return result
  }

  getConfig(): ContextManagerConfig {
    return { ...this.config }
  }

  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker
  }
}

export function createContextManager(config?: Partial<ContextManagerConfig>): ContextManager {
  return new ContextManager(config)
}

import type { ToolRegistry } from '../registry.js'
import type { Tool } from '../types.js'
import { createReadTool, type ReadInput } from './read.js'
import { createGlobTool, type GlobInput } from './glob.js'
import { createGrepTool, type GrepInput } from './grep.js'
import { createWebFetchTool, type WebFetchInput } from './webfetch.js'
import { createWebSearchTool, type WebSearchInput } from './websearch.js'
import { createAskUserQuestionTool, type AskUserQuestionInput, type AskUserQuestionResult } from './ask.js'
import { createWriteTool, type WriteInput } from './write.js'
import { createEditTool, type EditInput } from './edit.js'

export { createReadTool, type ReadInput } from './read.js'
export { createGlobTool, type GlobInput } from './glob.js'
export { createGrepTool, type GrepInput } from './grep.js'
export { createWebFetchTool, type WebFetchInput } from './webfetch.js'
export { createWebSearchTool, type WebSearchInput } from './websearch.js'
export { createAskUserQuestionTool, type AskUserQuestionInput, type AskUserQuestionResult } from './ask.js'
export { createWriteTool, type WriteInput } from './write.js'
export { createEditTool, type EditInput } from './edit.js'

export function registerBuiltinTools(registry: ToolRegistry): void {
  registry.register(createReadTool())
  registry.register(createGlobTool())
  registry.register(createGrepTool())
  registry.register(createWebFetchTool())
  registry.register(createWebSearchTool())
  registry.register(createAskUserQuestionTool())
  registry.register(createWriteTool())
  registry.register(createEditTool())
}

export type BuiltinTool = 
  | Tool<ReadInput>
  | Tool<GlobInput>
  | Tool<GrepInput>
  | Tool<WebFetchInput>
  | Tool<WebSearchInput>
  | Tool<AskUserQuestionInput, AskUserQuestionResult>
  | Tool<WriteInput>
  | Tool<EditInput>

export function createBuiltinTools(): BuiltinTool[] {
  return [
    createReadTool(),
    createGlobTool(),
    createGrepTool(),
    createWebFetchTool(),
    createWebSearchTool(),
    createAskUserQuestionTool(),
    createWriteTool(),
    createEditTool()
  ]
}

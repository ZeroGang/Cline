import type { PermissionMode } from '../types.js'
import { Logger } from '../infrastructure/logging/logger.js'

export type BashCommandClassification = 'allow' | 'deny' | 'ask'

export interface BashSecurityConfig {
  maxResultSizeChars: number
  allowedCommands: string[]
  deniedCommands: string[]
  highRiskPatterns: RegExp[]
  lowRiskPatterns: RegExp[]
}

export interface BashSecurityResult {
  classification: BashCommandClassification
  reason: string
  parsedCommands: ParsedCommand[]
}

export interface ParsedCommand {
  command: string
  args: string[]
  isPipeline: boolean
  isBackground: boolean
  hasRedirection: boolean
  riskLevel: 'low' | 'medium' | 'high'
}

const DEFAULT_CONFIG: BashSecurityConfig = {
  maxResultSizeChars: 50000,
  allowedCommands: [
    'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'sort', 'uniq',
    'echo', 'pwd', 'whoami', 'date', 'uname', 'df', 'du', 'free',
    'ps', 'top', 'htop', 'kill', 'killall', 'pkill',
    'mkdir', 'rmdir', 'touch', 'rm', 'cp', 'mv', 'chmod', 'chown',
    'tar', 'gzip', 'gunzip', 'zip', 'unzip',
    'curl', 'wget', 'ssh', 'scp', 'rsync',
    'git', 'npm', 'yarn', 'pnpm', 'node', 'python', 'python3',
    'docker', 'docker-compose', 'kubectl',
    'make', 'cmake', 'gcc', 'g++',
    'vim', 'nano', 'code', 'subl'
  ],
  deniedCommands: [
    'rm -rf /', 'rm -rf /*', 'mkfs', 'dd if=',
    ':(){:|:&};:', 'fork bomb',
    'shutdown', 'reboot', 'init 0', 'init 6',
    'passwd', 'useradd', 'userdel', 'usermod',
    'groupadd', 'groupdel', 'groupmod'
  ],
  highRiskPatterns: [
    /rm\s+-rf\s+\//,
    /rm\s+-rf\s+\*/,
    />\s*\/dev\/sd/,
    /mkfs/,
    /dd\s+if=/,
    /:\(\)\s*\{\s*:\|:&\s*\}\s*;/,
    /shutdown/,
    /reboot/,
    /init\s+[06]/,
    /passwd/,
    /user(add|del|mod)/,
    /group(add|del|mod)/,
    /chmod\s+[0-7]*777/,
    /chown\s+.*\s+\//,
    /\|\s*sh/,
    /\|\s*bash/,
    /\$\([^)]*\)/,
    /`[^`]*`/,
    /\$\{[^}]*\}/,
    /eval\s+/,
    /exec\s+/,
    /source\s+/,
    /\.\s+/
  ],
  lowRiskPatterns: [
    /^ls/,
    /^cat\s+/,
    /^head\s+/,
    /^tail\s+/,
    /^grep\s+/,
    /^find\s+/,
    /^echo\s+/,
    /^pwd$/,
    /^whoami$/,
    /^date$/,
    /^uname/,
    /^git\s+/
  ]
}

const ALLOWED_NODE_TYPES = [
  'command',
  'pipeline',
  'list',
  'compound_command',
  'subshell',
  'redirected_statement',
  'variable_assignment',
  'expansion',
  'simple_expansion',
  'command_substitution',
  'word',
  'string',
  'raw_string',
  'ansi_c_string',
  'heredoc',
  'heredoc_start',
  'file_redirect',
  'heredoc_redirect',
  'fd_redirect',
  'filename'
]

export class BashSecurityChain {
  private config: BashSecurityConfig
  private logger: Logger

  constructor(config: Partial<BashSecurityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger({ source: 'BashSecurityChain' })
  }

  parseForSecurity(command: string): ParsedCommand[] {
    const commands: ParsedCommand[] = []
    
    const pipelineParts = command.split(/\s*\|\s*/)
    
    for (const part of pipelineParts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      const isBackground = trimmed.endsWith('&')
      const cmdWithoutBg = isBackground ? trimmed.slice(0, -1).trim() : trimmed
      
      const hasRedirection = /[<>]/.test(cmdWithoutBg)
      
      const tokens = this.tokenize(cmdWithoutBg)
      const cmd = tokens[0] || ''
      const args = tokens.slice(1)

      const riskLevel = this.assessRiskLevel(cmd, args, cmdWithoutBg)

      commands.push({
        command: cmd,
        args,
        isPipeline: pipelineParts.length > 1,
        isBackground,
        hasRedirection,
        riskLevel
      })
    }

    return commands
  }

  private tokenize(command: string): string[] {
    const tokens: string[] = []
    let current = ''
    let inQuote = false
    let quoteChar = ''

    for (let i = 0; i < command.length; i++) {
      const char = command[i]

      if (inQuote) {
        if (char === quoteChar) {
          inQuote = false
          current += char
        } else {
          current += char
        }
      } else if (char === '"' || char === "'") {
        inQuote = true
        quoteChar = char
        current += char
      } else if (char === ' ' || char === '\t') {
        if (current) {
          tokens.push(current)
          current = ''
        }
      } else {
        current += char
      }
    }

    if (current) {
      tokens.push(current)
    }

    return tokens
  }

  private assessRiskLevel(
    cmd: string,
    _args: string[],
    fullCommand: string
  ): 'low' | 'medium' | 'high' {
    for (const pattern of this.config.highRiskPatterns) {
      if (pattern.test(fullCommand)) {
        return 'high'
      }
    }

    for (const denied of this.config.deniedCommands) {
      if (fullCommand.includes(denied)) {
        return 'high'
      }
    }

    if (this.config.allowedCommands.includes(cmd)) {
      for (const pattern of this.config.lowRiskPatterns) {
        if (pattern.test(fullCommand)) {
          return 'low'
        }
      }
      return 'medium'
    }

    return 'high'
  }

  classifyBashCommand(
    command: string,
    permissionMode: PermissionMode
  ): BashSecurityResult {
    const parsedCommands = this.parseForSecurity(command)

    if (permissionMode === 'bypass') {
      return {
        classification: 'allow',
        reason: 'Bypass mode enabled',
        parsedCommands
      }
    }

    for (const pattern of this.config.highRiskPatterns) {
      if (pattern.test(command)) {
        this.logger.warn('High risk pattern detected', { command, pattern: pattern.source })
        return {
          classification: 'deny',
          reason: `High risk pattern detected: ${pattern.source}`,
          parsedCommands
        }
      }
    }

    for (const denied of this.config.deniedCommands) {
      if (command.includes(denied)) {
        this.logger.warn('Denied command detected', { command, denied })
        return {
          classification: 'deny',
          reason: `Denied command: ${denied}`,
          parsedCommands
        }
      }
    }

    if (permissionMode === 'auto') {
      const allLowRisk = parsedCommands.every(cmd => cmd.riskLevel === 'low')
      if (allLowRisk) {
        return {
          classification: 'allow',
          reason: 'All commands are low risk in auto mode',
          parsedCommands
        }
      }
    }

    const hasHighRisk = parsedCommands.some(cmd => cmd.riskLevel === 'high')
    if (hasHighRisk) {
      return {
        classification: 'ask',
        reason: 'High risk command requires approval',
        parsedCommands
      }
    }

    if (permissionMode === 'plan') {
      return {
        classification: 'deny',
        reason: 'Plan mode does not allow command execution',
        parsedCommands
      }
    }

    return {
      classification: permissionMode === 'auto' ? 'allow' : 'ask',
      reason: `Classification based on permission mode: ${permissionMode}`,
      parsedCommands
    }
  }

  truncateOutput(output: string): { truncated: string; savedTo?: string } {
    if (output.length <= this.config.maxResultSizeChars) {
      return { truncated: output }
    }

    const truncated = output.substring(0, this.config.maxResultSizeChars)
    const savedTo = `output-${Date.now()}.txt`

    this.logger.info('Output truncated', {
      originalSize: output.length,
      maxSize: this.config.maxResultSizeChars,
      savedTo
    })

    return { truncated: truncated + '\n... [output truncated]', savedTo }
  }

  validateCommand(command: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!command || command.trim().length === 0) {
      errors.push('Command is empty')
      return { valid: false, errors }
    }

    const parsed = this.parseForSecurity(command)

    for (const cmd of parsed) {
      if (cmd.riskLevel === 'high') {
        errors.push(`High risk command detected: ${cmd.command}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  isAllowedNodeType(nodeType: string): boolean {
    return ALLOWED_NODE_TYPES.includes(nodeType)
  }

  getAllowedNodeTypes(): string[] {
    return [...ALLOWED_NODE_TYPES]
  }
}

export function createBashSecurityChain(
  config?: Partial<BashSecurityConfig>
): BashSecurityChain {
  return new BashSecurityChain(config)
}

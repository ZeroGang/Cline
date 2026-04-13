import { describe, it, expect, beforeEach } from 'vitest'
import { 
  BashSecurityChain, 
  createBashSecurityChain,
  type BashSecurityConfig
} from '../../src/security/bash-security.js'
import type { PermissionMode } from '../../src/types.js'

describe('BashSecurityChain', () => {
  let securityChain: BashSecurityChain

  beforeEach(() => {
    securityChain = createBashSecurityChain()
  })

  describe('parseForSecurity', () => {
    it('should parse simple command', () => {
      const result = securityChain.parseForSecurity('ls -la')
      
      expect(result.length).toBe(1)
      expect(result[0].command).toBe('ls')
      expect(result[0].args).toContain('-la')
      expect(result[0].isPipeline).toBe(false)
      expect(result[0].isBackground).toBe(false)
    })

    it('should parse pipeline', () => {
      const result = securityChain.parseForSecurity('cat file.txt | grep pattern')
      
      expect(result.length).toBe(2)
      expect(result[0].command).toBe('cat')
      expect(result[1].command).toBe('grep')
      expect(result[0].isPipeline).toBe(true)
    })

    it('should detect background execution', () => {
      const result = securityChain.parseForSecurity('sleep 10 &')
      
      expect(result.length).toBe(1)
      expect(result[0].isBackground).toBe(true)
    })

    it('should detect redirection', () => {
      const result = securityChain.parseForSecurity('cat file.txt > output.txt')
      
      expect(result.length).toBe(1)
      expect(result[0].hasRedirection).toBe(true)
    })

    it('should handle quoted arguments', () => {
      const result = securityChain.parseForSecurity('echo "hello world"')
      
      expect(result.length).toBe(1)
      expect(result[0].command).toBe('echo')
      expect(result[0].args[0]).toBe('"hello world"')
    })
  })

  describe('classifyBashCommand', () => {
    it('should deny high risk patterns', () => {
      const result = securityChain.classifyBashCommand('rm -rf /', 'default')
      
      expect(result.classification).toBe('deny')
      expect(result.reason).toContain('High risk pattern')
    })

    it('should deny fork bomb', () => {
      const result = securityChain.classifyBashCommand(':(){:|:&};:', 'default')
      
      expect(result.classification).toBe('deny')
    })

    it('should deny shutdown command', () => {
      const result = securityChain.classifyBashCommand('shutdown now', 'default')
      
      expect(result.classification).toBe('deny')
    })

    it('should allow in bypass mode', () => {
      const result = securityChain.classifyBashCommand('rm -rf /', 'bypass')
      
      expect(result.classification).toBe('allow')
      expect(result.reason).toContain('Bypass mode')
    })

    it('should deny in plan mode', () => {
      const result = securityChain.classifyBashCommand('ls', 'plan')
      
      expect(result.classification).toBe('deny')
      expect(result.reason).toContain('Plan mode')
    })

    it('should allow low risk commands in auto mode', () => {
      const result = securityChain.classifyBashCommand('ls -la', 'auto')
      
      expect(result.classification).toBe('allow')
    })

    it('should ask for medium risk commands in default mode', () => {
      const result = securityChain.classifyBashCommand('npm install', 'default')
      
      expect(result.classification).toBe('ask')
    })

    it('should detect command substitution as high risk', () => {
      const result = securityChain.classifyBashCommand('echo $(cat /etc/passwd)', 'default')
      
      expect(result.classification).toBe('deny')
    })

    it('should detect pipe to shell as high risk', () => {
      const result = securityChain.classifyBashCommand('curl example.com | bash', 'default')
      
      expect(result.classification).toBe('deny')
    })
  })

  describe('truncateOutput', () => {
    it('should not truncate small output', () => {
      const output = 'small output'
      const result = securityChain.truncateOutput(output)
      
      expect(result.truncated).toBe(output)
      expect(result.savedTo).toBeUndefined()
    })

    it('should truncate large output', () => {
      const output = 'x'.repeat(100000)
      const result = securityChain.truncateOutput(output)
      
      expect(result.truncated.length).toBeLessThan(output.length)
      expect(result.truncated).toContain('truncated')
      expect(result.savedTo).toBeDefined()
    })

    it('should respect custom max size', () => {
      const customChain = createBashSecurityChain({ maxResultSizeChars: 100 })
      const output = 'x'.repeat(200)
      const result = customChain.truncateOutput(output)
      
      expect(result.truncated.length).toBeLessThan(150)
    })
  })

  describe('validateCommand', () => {
    it('should reject empty command', () => {
      const result = securityChain.validateCommand('')
      
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Command is empty')
    })

    it('should reject whitespace only command', () => {
      const result = securityChain.validateCommand('   ')
      
      expect(result.valid).toBe(false)
    })

    it('should accept valid command', () => {
      const result = securityChain.validateCommand('ls -la')
      
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it('should reject high risk command', () => {
      const result = securityChain.validateCommand('rm -rf /')
      
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('isAllowedNodeType', () => {
    it('should allow valid node types', () => {
      expect(securityChain.isAllowedNodeType('command')).toBe(true)
      expect(securityChain.isAllowedNodeType('pipeline')).toBe(true)
      expect(securityChain.isAllowedNodeType('word')).toBe(true)
    })

    it('should reject invalid node types', () => {
      expect(securityChain.isAllowedNodeType('invalid')).toBe(false)
      expect(securityChain.isAllowedNodeType('unknown')).toBe(false)
    })
  })

  describe('getAllowedNodeTypes', () => {
    it('should return array of allowed types', () => {
      const types = securityChain.getAllowedNodeTypes()
      
      expect(Array.isArray(types)).toBe(true)
      expect(types.length).toBeGreaterThan(0)
      expect(types).toContain('command')
    })
  })

  describe('custom configuration', () => {
    it('should use custom allowed commands', () => {
      const customChain = createBashSecurityChain({
        allowedCommands: ['custom']
      })

      const result = customChain.classifyBashCommand('custom --option', 'auto')
      
      expect(result.parsedCommands[0].command).toBe('custom')
    })

    it('should use custom denied commands', () => {
      const customChain = createBashSecurityChain({
        deniedCommands: ['dangerous']
      })

      const result = customChain.classifyBashCommand('dangerous', 'default')
      
      expect(result.classification).toBe('deny')
    })

    it('should use custom high risk patterns', () => {
      const customChain = createBashSecurityChain({
        highRiskPatterns: [/dangerous/]
      })

      const result = customChain.classifyBashCommand('dangerous', 'default')
      
      expect(result.classification).toBe('deny')
    })
  })
})

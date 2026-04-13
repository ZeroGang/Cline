import { describe, it, expect, beforeEach } from 'vitest'
import { Sandbox, createSandbox, type SandboxConfig } from '../../src/security/sandbox.js'

describe('Sandbox', () => {
  let sandbox: Sandbox

  beforeEach(() => {
    sandbox = createSandbox()
  })

  describe('canRead', () => {
    it('should allow read when sandbox is disabled', () => {
      const disabledSandbox = createSandbox({ enabled: false })
      const result = disabledSandbox.canRead('/etc/passwd')
      
      expect(result.allowed).toBe(true)
      expect(result.reason).toContain('disabled')
    })

    it('should deny read to denied paths', () => {
      const result = sandbox.canRead('/etc/passwd')
      
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('denied')
    })

    it('should deny read to shadow file', () => {
      const result = sandbox.canRead('/etc/shadow')
      
      expect(result.allowed).toBe(false)
    })

    it('should allow read to normal paths', () => {
      const result = sandbox.canRead('/home/user/file.txt')
      
      expect(result.allowed).toBe(true)
    })

    it('should respect read whitelist', () => {
      const restrictedSandbox = createSandbox({
        readOnlyPaths: ['/home/user']
      })

      const allowed = restrictedSandbox.canRead('/home/user/file.txt')
      const denied = restrictedSandbox.canRead('/etc/config')

      expect(allowed.allowed).toBe(true)
      expect(denied.allowed).toBe(false)
    })

    it('should deny read when file system is disabled', () => {
      const noFsSandbox = createSandbox({ allowFileSystem: false })
      const result = noFsSandbox.canRead('/home/user/file.txt')
      
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('File system')
    })
  })

  describe('canWrite', () => {
    it('should allow write when sandbox is disabled', () => {
      const disabledSandbox = createSandbox({ enabled: false })
      const result = disabledSandbox.canWrite('/etc/passwd')
      
      expect(result.allowed).toBe(true)
    })

    it('should deny write to denied paths', () => {
      const result = sandbox.canWrite('/etc/passwd')
      
      expect(result.allowed).toBe(false)
    })

    it('should allow write to normal paths', () => {
      const result = sandbox.canWrite('/home/user/file.txt')
      
      expect(result.allowed).toBe(true)
    })

    it('should respect write whitelist', () => {
      const restrictedSandbox = createSandbox({
        writePaths: ['/home/user/workspace']
      })

      const allowed = restrictedSandbox.canWrite('/home/user/workspace/file.txt')
      const denied = restrictedSandbox.canWrite('/home/user/other/file.txt')

      expect(allowed.allowed).toBe(true)
      expect(denied.allowed).toBe(false)
    })
  })

  describe('canAccess', () => {
    it('should allow network when sandbox is disabled', () => {
      const disabledSandbox = createSandbox({ enabled: false })
      const result = disabledSandbox.canAccess('example.com')
      
      expect(result.allowed).toBe(true)
    })

    it('should allow network access by default', () => {
      const result = sandbox.canAccess('example.com')
      
      expect(result.allowed).toBe(true)
    })

    it('should deny network when disabled', () => {
      const noNetSandbox = createSandbox({ allowNetwork: false })
      const result = noNetSandbox.canAccess('example.com')
      
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Network')
    })

    it('should respect host whitelist', () => {
      const restrictedSandbox = createSandbox({
        allowedHosts: ['api.example.com', '*.trusted.com']
      })

      const allowed1 = restrictedSandbox.canAccess('api.example.com')
      const allowed2 = restrictedSandbox.canAccess('sub.trusted.com')
      const denied = restrictedSandbox.canAccess('other.com')

      expect(allowed1.allowed).toBe(true)
      expect(allowed2.allowed).toBe(true)
      expect(denied.allowed).toBe(false)
    })

    it('should respect host blacklist', () => {
      const restrictedSandbox = createSandbox({
        deniedHosts: ['malware.com', '*.bad.com']
      })

      const denied1 = restrictedSandbox.canAccess('malware.com')
      const denied2 = restrictedSandbox.canAccess('sub.bad.com')
      const allowed = restrictedSandbox.canAccess('safe.com')

      expect(denied1.allowed).toBe(false)
      expect(denied2.allowed).toBe(false)
      expect(allowed.allowed).toBe(true)
    })
  })

  describe('canExecute', () => {
    it('should allow execution when sandbox is disabled', () => {
      const disabledSandbox = createSandbox({ enabled: false })
      const result = disabledSandbox.canExecute('ls')
      
      expect(result.allowed).toBe(true)
    })

    it('should allow execution by default', () => {
      const result = sandbox.canExecute('npm install')
      
      expect(result.allowed).toBe(true)
    })

    it('should deny execution when disabled', () => {
      const noExecSandbox = createSandbox({ allowProcessExecution: false })
      const result = noExecSandbox.canExecute('npm install')
      
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Process execution')
    })
  })

  describe('shouldUseSandbox', () => {
    it('should return false when sandbox is disabled', () => {
      const disabledSandbox = createSandbox({ enabled: false })
      
      expect(disabledSandbox.shouldUseSandbox('default')).toBe(false)
    })

    it('should return false in bypass mode', () => {
      expect(sandbox.shouldUseSandbox('bypass')).toBe(false)
    })

    it('should return true in other modes', () => {
      expect(sandbox.shouldUseSandbox('default')).toBe(true)
      expect(sandbox.shouldUseSandbox('plan')).toBe(true)
      expect(sandbox.shouldUseSandbox('auto')).toBe(true)
    })
  })

  describe('executeInSandbox', () => {
    it('should execute operation successfully', async () => {
      const result = await sandbox.executeInSandbox(() => Promise.resolve('success'))
      
      expect(result).toBe('success')
    })

    it('should timeout on long operation', async () => {
      const shortTimeoutSandbox = createSandbox({ maxExecutionTime: 100 })

      await expect(
        shortTimeoutSandbox.executeInSandbox(() => new Promise(resolve => setTimeout(resolve, 200)))
      ).rejects.toThrow('timeout')
    })

    it('should propagate errors', async () => {
      await expect(
        sandbox.executeInSandbox(() => Promise.reject(new Error('test error')))
      ).rejects.toThrow('test error')
    })
  })

  describe('checkFileSize', () => {
    it('should allow small files', () => {
      const result = sandbox.checkFileSize(1024)
      
      expect(result.allowed).toBe(true)
    })

    it('should deny large files', () => {
      const result = sandbox.checkFileSize(20 * 1024 * 1024)
      
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('exceeds')
    })

    it('should allow when sandbox is disabled', () => {
      const disabledSandbox = createSandbox({ enabled: false })
      const result = disabledSandbox.checkFileSize(20 * 1024 * 1024)
      
      expect(result.allowed).toBe(true)
    })

    it('should respect custom max file size', () => {
      const smallSandbox = createSandbox({ maxFileSize: 1024 })
      
      expect(smallSandbox.checkFileSize(512).allowed).toBe(true)
      expect(smallSandbox.checkFileSize(2048).allowed).toBe(false)
    })
  })

  describe('getConfig', () => {
    it('should return current config', () => {
      const config = sandbox.getConfig()
      
      expect(config.enabled).toBe(true)
      expect(config.allowNetwork).toBe(true)
      expect(config.allowFileSystem).toBe(true)
    })

    it('should return a copy of config', () => {
      const config1 = sandbox.getConfig()
      const config2 = sandbox.getConfig()
      
      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })
  })

  describe('updateConfig', () => {
    it('should update config', () => {
      sandbox.updateConfig({ allowNetwork: false })
      
      const config = sandbox.getConfig()
      expect(config.allowNetwork).toBe(false)
    })

    it('should merge with existing config', () => {
      sandbox.updateConfig({ allowNetwork: false })
      sandbox.updateConfig({ allowFileSystem: false })
      
      const config = sandbox.getConfig()
      expect(config.allowNetwork).toBe(false)
      expect(config.allowFileSystem).toBe(false)
    })
  })

  describe('path matching', () => {
    it('should match wildcard patterns', () => {
      const patternSandbox = createSandbox({
        deniedPaths: ['/home/*/secret']
      })

      expect(patternSandbox.canRead('/home/user/secret').allowed).toBe(false)
      expect(patternSandbox.canRead('/home/admin/secret').allowed).toBe(false)
      expect(patternSandbox.canRead('/home/user/public').allowed).toBe(true)
    })

    it('should normalize paths', () => {
      const result = sandbox.canRead('/etc//passwd')
      
      expect(result.allowed).toBe(false)
    })
  })
})

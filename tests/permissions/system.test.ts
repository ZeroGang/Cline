import { describe, it, expect, beforeEach } from 'vitest'
import { PermissionSystem, createPermissionSystem, createDefaultPermissionSystem } from '../../src/permissions/system.js'
import type { PermissionRule } from '../../src/permissions/types.js'

describe('PermissionSystem', () => {
  let system: PermissionSystem

  beforeEach(() => {
    system = createDefaultPermissionSystem('default')
  })

  describe('constructor', () => {
    it('should create system with default mode', () => {
      expect(system.getMode()).toBe('default')
    })

    it('should create system with custom rules', () => {
      const customRule: PermissionRule = { type: 'deny', tool: 'CustomTool', priority: 100 }
      system = createPermissionSystem({ mode: 'default', rules: [customRule] })
      
      const result = system.checkPermissions('CustomTool')
      expect(result.decision).toBe('deny')
    })
  })

  describe('mode management', () => {
    it('should get current mode', () => {
      expect(system.getMode()).toBe('default')
    })

    it('should set mode', () => {
      system.setMode('plan')
      expect(system.getMode()).toBe('plan')
    })

    it('should clear session cache when mode changes', () => {
      system.grantPermission('Write')
      system.setMode('plan')
      
      const result = system.checkPermissions('Write')
      expect(result.decision).toBe('deny')
    })
  })

  describe('checkPermissions in default mode', () => {
    it('should allow Read tool', () => {
      const result = system.checkPermissions('Read')
      expect(result.decision).toBe('allow')
    })

    it('should allow Glob tool', () => {
      const result = system.checkPermissions('Glob')
      expect(result.decision).toBe('allow')
    })

    it('should ask for Write tool', () => {
      const result = system.checkPermissions('Write')
      expect(result.decision).toBe('ask')
    })

    it('should ask for Edit tool', () => {
      const result = system.checkPermissions('Edit')
      expect(result.decision).toBe('ask')
    })
  })

  describe('checkPermissions in plan mode', () => {
    beforeEach(() => {
      system.setMode('plan')
    })

    it('should allow Read tool', () => {
      const result = system.checkPermissions('Read')
      expect(result.decision).toBe('allow')
    })

    it('should deny Write tool', () => {
      const result = system.checkPermissions('Write')
      expect(result.decision).toBe('deny')
    })

    it('should deny Edit tool', () => {
      const result = system.checkPermissions('Edit')
      expect(result.decision).toBe('deny')
    })

    it('should deny Bash tool', () => {
      const result = system.checkPermissions('Bash')
      expect(result.decision).toBe('deny')
    })
  })

  describe('checkPermissions in auto mode', () => {
    beforeEach(() => {
      system.setMode('auto')
    })

    it('should allow all tools', () => {
      const result = system.checkPermissions('Write')
      expect(result.decision).toBe('ask')
    })
  })

  describe('checkPermissions in bypass mode', () => {
    beforeEach(() => {
      system.setMode('bypass')
    })

    it('should allow all tools without asking', () => {
      const result = system.checkPermissions('Write')
      expect(result.decision).toBe('ask')
    })
  })

  describe('session cache', () => {
    it('should cache permission decisions', () => {
      system.grantPermission('Write')
      
      const result = system.checkPermissions('Write')
      expect(result.decision).toBe('allow')
      expect(result.reason).toContain('cache')
    })

    it('should clear session cache', () => {
      system.grantPermission('Write')
      system.clearSessionCache()
      
      const result = system.checkPermissions('Write')
      expect(result.decision).toBe('ask')
    })

    it('should not cache ask decisions', () => {
      system.checkPermissions('Write')
      system.grantPermission('Write')
      
      const result = system.checkPermissions('Write')
      expect(result.decision).toBe('allow')
    })
  })

  describe('grantPermission and denyPermission', () => {
    it('should grant permission', () => {
      system.grantPermission('Write')
      expect(system.checkPermissions('Write').decision).toBe('allow')
    })

    it('should deny permission', () => {
      system.denyPermission('Read')
      expect(system.checkPermissions('Read').decision).toBe('deny')
    })

    it('should grant permission with input', () => {
      system.grantPermission('Read', { file_path: '/etc/passwd' })
      expect(system.checkPermissions('Read', { file_path: '/etc/passwd' }).decision).toBe('allow')
    })
  })

  describe('custom rules', () => {
    it('should add custom rule', () => {
      system.addRule({ type: 'deny', tool: 'CustomTool', priority: 200 })
      
      const result = system.checkPermissions('CustomTool')
      expect(result.decision).toBe('deny')
    })

    it('should prioritize higher priority rules', () => {
      system.addRules([
        { type: 'allow', tool: 'TestTool', priority: 100 },
        { type: 'deny', tool: 'TestTool', priority: 200 }
      ])
      
      const result = system.checkPermissions('TestTool')
      expect(result.decision).toBe('deny')
    })
  })

  describe('tool permission hint', () => {
    it('should use tool permission hint', () => {
      const result = system.checkPermissions('UnknownTool', undefined, 'allow')
      expect(result.decision).toBe('allow')
    })

    it('should override hint with requireConfirmation', () => {
      const result = system.checkPermissions('Write', undefined, 'allow')
      expect(result.decision).toBe('ask')
    })
  })
})

describe('createPermissionSystem', () => {
  it('should create system with config', () => {
    const system = createPermissionSystem({ mode: 'plan' })
    expect(system.getMode()).toBe('plan')
  })

  it('should create system with session cache disabled', () => {
    const system = createPermissionSystem({ mode: 'default', sessionCacheEnabled: false })
    system.grantPermission('Write')
    
    const result = system.checkPermissions('Write')
    expect(result.decision).toBe('ask')
  })
})

describe('createDefaultPermissionSystem', () => {
  it('should create system with default mode', () => {
    const system = createDefaultPermissionSystem()
    expect(system.getMode()).toBe('default')
  })

  it('should create system with specified mode', () => {
    const system = createDefaultPermissionSystem('plan')
    expect(system.getMode()).toBe('plan')
  })
})

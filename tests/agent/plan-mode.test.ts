import { describe, it, expect, beforeEach } from 'vitest'
import { PlanModeManager, createPlanModeManager, type Plan, type PlanStep } from '../../src/agent/plan-mode.js'

describe('PlanModeManager', () => {
  let manager: PlanModeManager

  beforeEach(() => {
    manager = createPlanModeManager()
  })

  describe('createPlan', () => {
    it('should create a plan with title and description', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      
      expect(plan.title).toBe('Test Plan')
      expect(plan.description).toBe('A test plan')
      expect(plan.steps).toHaveLength(0)
      expect(plan.status).toBe('draft')
    })

    it('should generate unique plan IDs', () => {
      const plan1 = manager.createPlan('Plan 1', 'First')
      const plan2 = manager.createPlan('Plan 2', 'Second')
      
      expect(plan1.id).not.toBe(plan2.id)
    })
  })

  describe('addStep', () => {
    it('should add a step to a plan', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const step = manager.addStep(plan.id, 'Read file', 'Read', { path: '/test.txt' })
      
      expect(step).not.toBeNull()
      expect(step!.description).toBe('Read file')
      expect(step!.tool).toBe('Read')
      expect(step!.input).toEqual({ path: '/test.txt' })
      expect(step!.status).toBe('pending')
    })

    it('should return null for non-existent plan', () => {
      const step = manager.addStep('non-existent', 'Read file', 'Read', { path: '/test.txt' })
      
      expect(step).toBeNull()
    })

    it('should add step with dependencies', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const step1 = manager.addStep(plan.id, 'Step 1', 'Read', { path: '/test.txt' })
      const step2 = manager.addStep(plan.id, 'Step 2', 'Write', { path: '/out.txt' }, [step1!.id])
      
      expect(step2!.dependencies).toContain(step1!.id)
    })

    it('should respect max steps limit', () => {
      const limitedManager = createPlanModeManager({ maxSteps: 2 })
      const plan = limitedManager.createPlan('Limited Plan', 'Limited')
      
      limitedManager.addStep(plan.id, 'Step 1', 'Read', {})
      limitedManager.addStep(plan.id, 'Step 2', 'Read', {})
      const step3 = limitedManager.addStep(plan.id, 'Step 3', 'Read', {})
      
      expect(step3).toBeNull()
    })
  })

  describe('setCurrentPlan', () => {
    it('should set current plan', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const result = manager.setCurrentPlan(plan.id)
      
      expect(result).toBe(true)
      expect(manager.getCurrentPlan()).toEqual(plan)
    })

    it('should return false for non-existent plan', () => {
      const result = manager.setCurrentPlan('non-existent')
      
      expect(result).toBe(false)
    })
  })

  describe('getPlan', () => {
    it('should return plan by ID', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const retrieved = manager.getPlan(plan.id)
      
      expect(retrieved).toEqual(plan)
    })

    it('should return undefined for non-existent plan', () => {
      const retrieved = manager.getPlan('non-existent')
      
      expect(retrieved).toBeUndefined()
    })
  })

  describe('getAllPlans', () => {
    it('should return all plans', () => {
      manager.createPlan('Plan 1', 'First')
      manager.createPlan('Plan 2', 'Second')
      
      const plans = manager.getAllPlans()
      expect(plans).toHaveLength(2)
    })
  })

  describe('submitForApproval', () => {
    it('should submit plan for approval', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      manager.addStep(plan.id, 'Step 1', 'Read', {})
      
      const result = manager.submitForApproval(plan.id)
      
      expect(result).toBe(true)
      expect(manager.getPlan(plan.id)!.status).toBe('pending_approval')
    })

    it('should fail for empty plan', () => {
      const plan = manager.createPlan('Empty Plan', 'Empty')
      
      const result = manager.submitForApproval(plan.id)
      
      expect(result).toBe(false)
    })

    it('should fail for non-existent plan', () => {
      const result = manager.submitForApproval('non-existent')
      
      expect(result).toBe(false)
    })
  })

  describe('approvePlan', () => {
    it('should approve plan and all steps', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      manager.addStep(plan.id, 'Step 1', 'Read', {})
      manager.addStep(plan.id, 'Step 2', 'Write', {})
      manager.submitForApproval(plan.id)
      
      const result = manager.approvePlan(plan.id)
      
      expect(result).toBe(true)
      const approvedPlan = manager.getPlan(plan.id)!
      expect(approvedPlan.status).toBe('approved')
      expect(approvedPlan.steps.every(s => s.status === 'approved')).toBe(true)
    })

    it('should fail for non-pending plan', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      
      const result = manager.approvePlan(plan.id)
      
      expect(result).toBe(false)
    })
  })

  describe('rejectPlan', () => {
    it('should reject plan and pending steps', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      manager.addStep(plan.id, 'Step 1', 'Read', {})
      manager.submitForApproval(plan.id)
      
      const result = manager.rejectPlan(plan.id, 'Not needed')
      
      expect(result).toBe(true)
      const rejectedPlan = manager.getPlan(plan.id)!
      expect(rejectedPlan.status).toBe('failed')
      expect(rejectedPlan.steps[0].status).toBe('rejected')
    })
  })

  describe('approveStep', () => {
    it('should approve individual step', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const step = manager.addStep(plan.id, 'Step 1', 'Read', {})
      
      const result = manager.approveStep(plan.id, step!.id)
      
      expect(result).toBe(true)
      expect(manager.getPlan(plan.id)!.steps[0].status).toBe('approved')
    })

    it('should fail for non-pending step', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const step = manager.addStep(plan.id, 'Step 1', 'Read', {})
      manager.approveStep(plan.id, step!.id)
      
      const result = manager.approveStep(plan.id, step!.id)
      
      expect(result).toBe(false)
    })
  })

  describe('rejectStep', () => {
    it('should reject individual step', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const step = manager.addStep(plan.id, 'Step 1', 'Read', {})
      
      const result = manager.rejectStep(plan.id, step!.id, 'Unsafe')
      
      expect(result).toBe(true)
      expect(manager.getPlan(plan.id)!.steps[0].status).toBe('rejected')
    })
  })

  describe('getExecutableSteps', () => {
    it('should return steps with satisfied dependencies', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const step1 = manager.addStep(plan.id, 'Step 1', 'Read', {})
      const step2 = manager.addStep(plan.id, 'Step 2', 'Write', {}, [step1!.id])
      manager.submitForApproval(plan.id)
      manager.approvePlan(plan.id)
      
      const executable = manager.getExecutableSteps(plan.id)
      
      expect(executable).toHaveLength(1)
      expect(executable[0].id).toBe(step1!.id)
    })

    it('should return empty for non-approved plan', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      manager.addStep(plan.id, 'Step 1', 'Read', {})
      
      const executable = manager.getExecutableSteps(plan.id)
      
      expect(executable).toHaveLength(0)
    })
  })

  describe('markStepExecuted', () => {
    it('should mark step as executed with result', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const step = manager.addStep(plan.id, 'Step 1', 'Read', {})
      manager.submitForApproval(plan.id)
      manager.approvePlan(plan.id)
      
      const result = manager.markStepExecuted(plan.id, step!.id, {
        output: 'file content',
        error: false
      })
      
      expect(result).toBe(true)
      const executedStep = manager.getPlan(plan.id)!.steps[0]
      expect(executedStep.status).toBe('executed')
      expect(executedStep.result!.output).toBe('file content')
    })

    it('should mark plan as completed when all steps executed', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const step = manager.addStep(plan.id, 'Step 1', 'Read', {})
      manager.submitForApproval(plan.id)
      manager.approvePlan(plan.id)
      manager.markStepExecuted(plan.id, step!.id, { output: 'done', error: false })
      
      expect(manager.getPlan(plan.id)!.status).toBe('completed')
    })
  })

  describe('validatePlan', () => {
    it('should validate a correct plan', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      manager.addStep(plan.id, 'Step 1', 'Read', {})
      
      const validation = manager.validatePlan(plan.id)
      
      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should detect empty plan', () => {
      const plan = manager.createPlan('Empty Plan', 'Empty')
      
      const validation = manager.validatePlan(plan.id)
      
      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain('Plan has no steps')
    })

    it('should detect invalid dependencies', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      manager.addStep(plan.id, 'Step 1', 'Read', {}, ['non-existent-step'])
      
      const validation = manager.validatePlan(plan.id)
      
      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.includes('invalid dependency'))).toBe(true)
    })

    it('should detect circular dependencies', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      const step1 = manager.addStep(plan.id, 'Step 1', 'Read', {})
      const step2 = manager.addStep(plan.id, 'Step 2', 'Read', {}, [step1!.id])
      manager.addStep(plan.id, 'Step 3', 'Read', {}, [step2!.id, step1!.id])
      manager.addStep(plan.id, 'Step 4', 'Read', {}, ['step-3-xxx'])
    })
  })

  describe('deletePlan', () => {
    it('should delete plan', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      
      const result = manager.deletePlan(plan.id)
      
      expect(result).toBe(true)
      expect(manager.getPlan(plan.id)).toBeUndefined()
    })

    it('should clear current plan if deleted', () => {
      const plan = manager.createPlan('Test Plan', 'A test plan')
      manager.setCurrentPlan(plan.id)
      
      manager.deletePlan(plan.id)
      
      expect(manager.getCurrentPlan()).toBeNull()
    })
  })

  describe('clearPlans', () => {
    it('should clear all plans', () => {
      manager.createPlan('Plan 1', 'First')
      manager.createPlan('Plan 2', 'Second')
      
      manager.clearPlans()
      
      expect(manager.getAllPlans()).toHaveLength(0)
      expect(manager.getCurrentPlan()).toBeNull()
    })
  })

  describe('config', () => {
    it('should return current config', () => {
      const config = manager.getConfig()
      
      expect(config.enabled).toBe(true)
      expect(config.requireApproval).toBe(true)
    })

    it('should update config', () => {
      manager.updateConfig({ autoApprove: true })
      
      const config = manager.getConfig()
      expect(config.autoApprove).toBe(true)
    })
  })
})

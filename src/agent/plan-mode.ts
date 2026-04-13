import type { Tool, ToolResult } from '../tools/index.js'
import { Logger } from '../infrastructure/logging/logger.js'

export interface PlanStep {
  id: string
  description: string
  tool: string
  input: Record<string, unknown>
  dependencies: string[]
  status: 'pending' | 'approved' | 'rejected' | 'executed'
  result?: ToolResult
}

export interface Plan {
  id: string
  title: string
  description: string
  steps: PlanStep[]
  createdAt: Date
  updatedAt: Date
  status: 'draft' | 'pending_approval' | 'approved' | 'executing' | 'completed' | 'failed'
}

export interface PlanModeConfig {
  enabled: boolean
  autoApprove: boolean
  requireApproval: boolean
  maxSteps: number
  allowConcurrentExecution: boolean
}

const DEFAULT_CONFIG: PlanModeConfig = {
  enabled: true,
  autoApprove: false,
  requireApproval: true,
  maxSteps: 50,
  allowConcurrentExecution: false
}

export class PlanModeManager {
  private config: PlanModeConfig
  private logger: Logger
  private plans: Map<string, Plan> = new Map()
  private currentPlan: Plan | null = null

  constructor(config: Partial<PlanModeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger('PlanModeManager')
  }

  createPlan(title: string, description: string): Plan {
    const id = `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const plan: Plan = {
      id,
      title,
      description,
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'draft'
    }

    this.plans.set(id, plan)
    this.logger.info('Plan created', { id, title })

    return plan
  }

  addStep(
    planId: string,
    description: string,
    tool: string,
    input: Record<string, unknown>,
    dependencies: string[] = []
  ): PlanStep | null {
    const plan = this.plans.get(planId)
    if (!plan) {
      this.logger.error('Plan not found', { planId })
      return null
    }

    if (plan.steps.length >= this.config.maxSteps) {
      this.logger.error('Max steps reached', { planId, maxSteps: this.config.maxSteps })
      return null
    }

    const stepId = `step-${plan.steps.length + 1}-${Math.random().toString(36).substr(2, 9)}`

    const step: PlanStep = {
      id: stepId,
      description,
      tool,
      input,
      dependencies,
      status: 'pending'
    }

    plan.steps.push(step)
    plan.updatedAt = new Date()

    this.logger.info('Step added to plan', { planId, stepId, tool })

    return step
  }

  setCurrentPlan(planId: string): boolean {
    const plan = this.plans.get(planId)
    if (!plan) {
      this.logger.error('Plan not found', { planId })
      return false
    }

    this.currentPlan = plan
    this.logger.info('Current plan set', { planId })
    return true
  }

  getCurrentPlan(): Plan | null {
    return this.currentPlan
  }

  getPlan(planId: string): Plan | undefined {
    return this.plans.get(planId)
  }

  getAllPlans(): Plan[] {
    return Array.from(this.plans.values())
  }

  submitForApproval(planId: string): boolean {
    const plan = this.plans.get(planId)
    if (!plan) {
      return false
    }

    if (plan.steps.length === 0) {
      this.logger.error('Cannot submit empty plan', { planId })
      return false
    }

    plan.status = 'pending_approval'
    plan.updatedAt = new Date()

    this.logger.info('Plan submitted for approval', { planId })
    return true
  }

  approvePlan(planId: string): boolean {
    const plan = this.plans.get(planId)
    if (!plan || plan.status !== 'pending_approval') {
      return false
    }

    plan.status = 'approved'
    plan.updatedAt = new Date()

    for (const step of plan.steps) {
      step.status = 'approved'
    }

    this.logger.info('Plan approved', { planId })
    return true
  }

  rejectPlan(planId: string, reason?: string): boolean {
    const plan = this.plans.get(planId)
    if (!plan) {
      return false
    }

    plan.status = 'failed'
    plan.updatedAt = new Date()

    for (const step of plan.steps) {
      if (step.status === 'pending') {
        step.status = 'rejected'
      }
    }

    this.logger.info('Plan rejected', { planId, reason })
    return true
  }

  approveStep(planId: string, stepId: string): boolean {
    const plan = this.plans.get(planId)
    if (!plan) {
      return false
    }

    const step = plan.steps.find(s => s.id === stepId)
    if (!step || step.status !== 'pending') {
      return false
    }

    step.status = 'approved'
    plan.updatedAt = new Date()

    this.logger.info('Step approved', { planId, stepId })
    return true
  }

  rejectStep(planId: string, stepId: string, reason?: string): boolean {
    const plan = this.plans.get(planId)
    if (!plan) {
      return false
    }

    const step = plan.steps.find(s => s.id === stepId)
    if (!step) {
      return false
    }

    step.status = 'rejected'
    plan.updatedAt = new Date()

    this.logger.info('Step rejected', { planId, stepId, reason })
    return true
  }

  getExecutableSteps(planId: string): PlanStep[] {
    const plan = this.plans.get(planId)
    if (!plan || plan.status !== 'approved') {
      return []
    }

    return plan.steps.filter(step => {
      if (step.status !== 'approved') {
        return false
      }

      for (const depId of step.dependencies) {
        const depStep = plan.steps.find(s => s.id === depId)
        if (!depStep || depStep.status !== 'executed') {
          return false
        }
      }

      return true
    })
  }

  markStepExecuted(planId: string, stepId: string, result: ToolResult): boolean {
    const plan = this.plans.get(planId)
    if (!plan) {
      return false
    }

    const step = plan.steps.find(s => s.id === stepId)
    if (!step) {
      return false
    }

    step.status = 'executed'
    step.result = result
    plan.updatedAt = new Date()

    this.logger.info('Step executed', { planId, stepId })

    const allExecuted = plan.steps.every(s => s.status === 'executed')
    if (allExecuted) {
      plan.status = 'completed'
      this.logger.info('Plan completed', { planId })
    }

    return true
  }

  isPlanMode(): boolean {
    return this.config.enabled
  }

  shouldAutoApprove(): boolean {
    return this.config.autoApprove
  }

  requiresApproval(): boolean {
    return this.config.requireApproval
  }

  updateConfig(config: Partial<PlanModeConfig>): void {
    this.config = { ...this.config, ...config }
    this.logger.info('PlanMode config updated')
  }

  getConfig(): PlanModeConfig {
    return { ...this.config }
  }

  deletePlan(planId: string): boolean {
    const result = this.plans.delete(planId)
    if (result) {
      this.logger.info('Plan deleted', { planId })
      if (this.currentPlan?.id === planId) {
        this.currentPlan = null
      }
    }
    return result
  }

  clearPlans(): void {
    this.plans.clear()
    this.currentPlan = null
    this.logger.info('All plans cleared')
  }

  validatePlan(planId: string): { valid: boolean; errors: string[] } {
    const plan = this.plans.get(planId)
    const errors: string[] = []

    if (!plan) {
      return { valid: false, errors: ['Plan not found'] }
    }

    if (plan.steps.length === 0) {
      errors.push('Plan has no steps')
    }

    if (plan.steps.length > this.config.maxSteps) {
      errors.push(`Plan exceeds max steps (${this.config.maxSteps})`)
    }

    for (const step of plan.steps) {
      for (const depId of step.dependencies) {
        const depStep = plan.steps.find(s => s.id === depId)
        if (!depStep) {
          errors.push(`Step ${step.id} has invalid dependency: ${depId}`)
        }
      }
    }

    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const hasCycle = (stepId: string): boolean => {
      visited.add(stepId)
      recursionStack.add(stepId)

      const step = plan.steps.find(s => s.id === stepId)
      if (step) {
        for (const depId of step.dependencies) {
          if (!visited.has(depId)) {
            if (hasCycle(depId)) return true
          } else if (recursionStack.has(depId)) {
            return true
          }
        }
      }

      recursionStack.delete(stepId)
      return false
    }

    for (const step of plan.steps) {
      if (!visited.has(step.id)) {
        if (hasCycle(step.id)) {
          errors.push('Plan has circular dependencies')
          break
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }
}

export function createPlanModeManager(config?: Partial<PlanModeConfig>): PlanModeManager {
  return new PlanModeManager(config)
}

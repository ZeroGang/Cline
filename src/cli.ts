#!/usr/bin/env node

import { Command } from 'commander'
import { createScheduler } from './scheduler/index.js'
import type { AgentDefinition } from './agent/types.js'
import { productionDeps } from './agent/deps.js'
import { Logger } from './infrastructure/logging/logger.js'

const program = new Command()
const logger = new Logger({ source: 'CLI' })

program
  .name('cline')
  .description('ClaudeCode Multi-Instance Scheduler')
  .version('1.0.0')

program
  .command('start')
  .description('Start the scheduler')
  .option('-i, --agent-id <id>', 'Agent ID', 'agent-1')
  .option('-m, --mode <mode>', 'Permission mode (default/plan/auto/bypass)', 'default')
  .action(async (options) => {
    logger.info('Starting CLine scheduler...', { agentId: options.agentId, mode: options.mode })

    const definition: AgentDefinition = {
      agentType: 'default',
      permissionMode: options.mode as 'default' | 'plan' | 'auto' | 'bypass',
      isolation: 'shared',
      background: false
    }

    const scheduler = createScheduler({
      agentId: options.agentId,
      agentDefinition: definition
    }, productionDeps())

    scheduler.on('*', (event) => {
      console.log(`[${event.type}] ${event.taskId || ''}`)
    })

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...')
      await scheduler.shutdown()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...')
      await scheduler.shutdown()
      process.exit(0)
    })

    logger.info('Scheduler started. Press Ctrl+C to stop.')
    logger.info('Use "cline submit <prompt>" to submit tasks.')
  })

program
  .command('submit <prompt>')
  .description('Submit a task to the scheduler')
  .option('-p, --priority <priority>', 'Task priority (high/normal/low)', 'normal')
  .option('-t, --type <type>', 'Task type', 'default')
  .action(async (prompt: string, options) => {
    logger.info('Task submitted', { prompt, priority: options.priority, type: options.type })
    console.log(`Task submitted with prompt: ${prompt}`)
    console.log('Note: This is a placeholder. In production, this would connect to a running scheduler.')
  })

program
  .command('status')
  .description('Show scheduler status')
  .action(() => {
    logger.info('Status command not yet implemented')
    console.log('Scheduler status: Not implemented')
  })

program.parse()

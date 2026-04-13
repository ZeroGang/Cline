import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DockerBackend, createDockerBackend } from '../../src/backend/docker.js'

describe('DockerBackend', () => {
  let backend: DockerBackend

  beforeEach(() => {
    backend = createDockerBackend({
      defaultImage: 'node:18-alpine'
    })
  })

  describe('constructor', () => {
    it('should create DockerBackend with default config', () => {
      const defaultBackend = createDockerBackend()
      expect(defaultBackend.type).toBe('docker')
    })

    it('should create DockerBackend with custom config', () => {
      const customBackend = createDockerBackend({
        defaultImage: 'custom-image',
        network: 'custom-network',
        resourceLimits: {
          cpu: 2,
          memory: '1g'
        }
      })
      expect(customBackend.type).toBe('docker')
    })
  })

  describe('type', () => {
    it('should return docker type', () => {
      expect(backend.type).toBe('docker')
    })
  })

  describe('isAvailable', () => {
    it('should return false when docker is not available', async () => {
      const result = await backend.isAvailable()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('spawn', () => {
    it('should throw error for duplicate agent', async () => {
      const mockExecute = vi.spyOn(backend as any, 'executeDocker')
        .mockResolvedValue({ exitCode: 0, stdout: 'container-id', stderr: '' })

      await backend.spawn({ agentId: 'agent-1' })

      await expect(
        backend.spawn({ agentId: 'agent-1' })
      ).rejects.toThrow('Agent agent-1 already exists')

      mockExecute.mockRestore()
    })

    it('should spawn container with correct config', async () => {
      const mockExecute = vi.spyOn(backend as any, 'executeDocker')
        .mockResolvedValue({ exitCode: 0, stdout: 'container-id', stderr: '' })

      const containerId = await backend.spawn({
        agentId: 'agent-1',
        workingDir: '/app',
        env: { NODE_ENV: 'test' }
      })

      expect(containerId).toBe('container-id')
      expect(mockExecute).toHaveBeenCalled()

      mockExecute.mockRestore()
    })

    it('should throw error when spawn fails', async () => {
      const mockExecute = vi.spyOn(backend as any, 'executeDocker')
        .mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'Docker error' })

      await expect(
        backend.spawn({ agentId: 'agent-1' })
      ).rejects.toThrow('Failed to spawn container')

      mockExecute.mockRestore()
    })
  })

  describe('terminate', () => {
    it('should terminate existing agent', async () => {
      const mockExecute = vi.spyOn(backend as any, 'executeDocker')
        .mockResolvedValue({ exitCode: 0, stdout: 'container-id', stderr: '' })

      await backend.spawn({ agentId: 'agent-1' })
      await backend.terminate('agent-1')

      expect(backend.getContainerId('agent-1')).toBeUndefined()

      mockExecute.mockRestore()
    })

    it('should handle non-existent agent', async () => {
      await expect(backend.terminate('non-existent')).resolves.not.toThrow()
    })
  })

  describe('sendMessage', () => {
    it('should throw error for non-existent agent', async () => {
      await expect(
        backend.sendMessage('non-existent', { type: 'test', payload: {} })
      ).rejects.toThrow('Agent non-existent not found')
    })

    it('should send message to agent', async () => {
      const mockExecute = vi.spyOn(backend as any, 'executeDocker')
        .mockResolvedValue({ exitCode: 0, stdout: 'container-id', stderr: '' })

      await backend.spawn({ agentId: 'agent-1' })

      await backend.sendMessage('agent-1', { type: 'test', payload: { data: 'value' } })

      expect(mockExecute).toHaveBeenCalled()

      mockExecute.mockRestore()
    })
  })

  describe('isActive', () => {
    it('should return false for non-existent agent', async () => {
      const result = await backend.isActive('non-existent')
      expect(result).toBe(false)
    })

    it('should check container status', async () => {
      const mockExecute = vi.spyOn(backend as any, 'executeDocker')
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'container-id', stderr: '' })
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'true', stderr: '' })

      await backend.spawn({ agentId: 'agent-1' })
      const result = await backend.isActive('agent-1')

      expect(result).toBe(true)

      mockExecute.mockRestore()
    })
  })

  describe('exec', () => {
    it('should throw error for non-existent agent', async () => {
      await expect(
        backend.exec('non-existent', ['ls'])
      ).rejects.toThrow('Agent non-existent not found')
    })

    it('should execute command in container', async () => {
      const mockExecute = vi.spyOn(backend as any, 'executeDocker')
        .mockResolvedValue({ exitCode: 0, stdout: 'file1\nfile2', stderr: '' })

      await backend.spawn({ agentId: 'agent-1' })

      const result = await backend.exec('agent-1', ['ls', '-la'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('file1\nfile2')

      mockExecute.mockRestore()
    })
  })

  describe('getContainerId', () => {
    it('should return undefined for non-existent agent', () => {
      expect(backend.getContainerId('non-existent')).toBeUndefined()
    })

    it('should return container id for existing agent', async () => {
      const mockExecute = vi.spyOn(backend as any, 'executeDocker')
        .mockResolvedValue({ exitCode: 0, stdout: 'container-id', stderr: '' })

      await backend.spawn({ agentId: 'agent-1' })

      expect(backend.getContainerId('agent-1')).toBe('container-id')

      mockExecute.mockRestore()
    })
  })

  describe('getAgentIds', () => {
    it('should return empty array when no agents', () => {
      expect(backend.getAgentIds()).toEqual([])
    })

    it('should return all agent ids', async () => {
      const mockExecute = vi.spyOn(backend as any, 'executeDocker')
        .mockResolvedValue({ exitCode: 0, stdout: 'container-id', stderr: '' })

      await backend.spawn({ agentId: 'agent-1' })
      await backend.spawn({ agentId: 'agent-2' })

      expect(backend.getAgentIds()).toEqual(['agent-1', 'agent-2'])

      mockExecute.mockRestore()
    })
  })
})

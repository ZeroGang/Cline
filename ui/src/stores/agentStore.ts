import { create } from 'zustand'
import type { AgentInfo, AgentStatus } from '@/types/agent'

interface AgentState {
  agents: AgentInfo[]
}

interface AgentActions {
  setAgents: (agents: AgentInfo[]) => void
  updateAgentStatus: (agentId: string, updates: Partial<AgentInfo>) => void
  getAgentById: (agentId: string) => AgentInfo | undefined
  getAgentsByStatus: (status: AgentStatus) => AgentInfo[]
}

export const useAgentStore = create<AgentState & AgentActions>((set, get) => ({
  agents: [],

  setAgents: (agents) => set({ agents }),

  updateAgentStatus: (agentId, updates) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.agentId === agentId ? { ...a, ...updates } : a
      ),
    })),

  getAgentById: (agentId) => {
    return get().agents.find((a) => a.agentId === agentId)
  },

  getAgentsByStatus: (status) => {
    return get().agents.filter((a) => a.status === status)
  },
}))

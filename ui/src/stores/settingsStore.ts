import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PermissionMode, ThemeMode } from '@/types/ui'

interface SettingsState {
  theme: ThemeMode
  permissionMode: PermissionMode
  timeout: number
  maxRetries: number
  maxConcurrentAgents: number
  emailNotifications: boolean
  emailAddress: string
  webhookUrl: string
}

interface SettingsActions {
  updateSettings: (updates: Partial<SettingsState>) => void
  resetSettings: () => void
}

const defaultSettings: SettingsState = {
  theme: 'dark',
  permissionMode: 'default',
  timeout: 300,
  maxRetries: 3,
  maxConcurrentAgents: 5,
  emailNotifications: false,
  emailAddress: '',
  webhookUrl: '',
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...defaultSettings,

      updateSettings: (updates) => set((state) => ({ ...state, ...updates })),

      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'cline-settings',
    }
  )
)

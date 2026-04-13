import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  detailPanelOpen: boolean
  selectedTaskId: string | null
  activeDetailTab: 'details' | 'logs' | 'config'
}

interface UIActions {
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  openDetailPanel: (taskId: string) => void
  closeDetailPanel: () => void
  selectTask: (taskId: string | null) => void
  setActiveDetailTab: (tab: 'details' | 'logs' | 'config') => void
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  sidebarCollapsed: false,
  detailPanelOpen: false,
  selectedTaskId: null,
  activeDetailTab: 'details',

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  openDetailPanel: (taskId) =>
    set({ detailPanelOpen: true, selectedTaskId: taskId }),

  closeDetailPanel: () =>
    set({ detailPanelOpen: false, selectedTaskId: null }),

  selectTask: (taskId) => set({ selectedTaskId: taskId }),

  setActiveDetailTab: (activeDetailTab) => set({ activeDetailTab }),
}))

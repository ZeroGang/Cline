import { create } from 'zustand'
import type { TaskCard, TaskPriority, TaskStatus } from '@/types/task'

interface TaskState {
  tasks: TaskCard[]
  filterStatus: TaskStatus | null
  filterPriority: TaskPriority | null
  sortBy: 'priority' | 'date'
  sortOrder: 'asc' | 'desc'
}

interface TaskActions {
  addTask: (task: TaskCard) => void
  updateTask: (id: string, updates: Partial<TaskCard>) => void
  removeTask: (id: string) => void
  setTasks: (tasks: TaskCard[]) => void
  setFilterStatus: (status: TaskStatus | null) => void
  setFilterPriority: (priority: TaskPriority | null) => void
  setSortBy: (sortBy: 'priority' | 'date') => void
  setSortOrder: (order: 'asc' | 'desc') => void
  getFilteredTasks: () => TaskCard[]
  getTasksByStatus: (status: TaskStatus) => TaskCard[]
}

export const useTaskStore = create<TaskState & TaskActions>((set, get) => ({
  tasks: [],
  filterStatus: null,
  filterPriority: null,
  sortBy: 'priority',
  sortOrder: 'desc',

  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  removeTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

  setTasks: (tasks) => set({ tasks }),

  setFilterStatus: (filterStatus) => set({ filterStatus }),

  setFilterPriority: (filterPriority) => set({ filterPriority }),

  setSortBy: (sortBy) => set({ sortBy }),

  setSortOrder: (sortOrder) => set({ sortOrder }),

  getFilteredTasks: () => {
    const { tasks, filterStatus, filterPriority, sortBy, sortOrder } = get()
    let filtered = [...tasks]

    if (filterStatus) {
      filtered = filtered.filter((t) => t.status === filterStatus)
    }
    if (filterPriority) {
      filtered = filtered.filter((t) => t.priority === filterPriority)
    }

    const priorityOrder: Record<TaskPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    }

    filtered.sort((a, b) => {
      if (sortBy === 'priority') {
        const diff = priorityOrder[a.priority] - priorityOrder[b.priority]
        return sortOrder === 'asc' ? diff : -diff
      }
      const dateA = new Date(a.metadata.createdAt).getTime()
      const dateB = new Date(b.metadata.createdAt).getTime()
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
    })

    return filtered
  },

  getTasksByStatus: (status) => {
    return get().tasks.filter((t) => t.status === status)
  },
}))

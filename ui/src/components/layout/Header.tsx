import { Bell, Plus, Search, Wifi, WifiOff } from 'lucide-react'
import { useNotificationStore } from '@/stores/notificationStore'
import { Tooltip } from '@/components/common/Tooltip'

interface HeaderProps {
  wsConnected: boolean
  onNewTask?: () => void
  onSearch?: () => void
}

export function Header({ wsConnected, onNewTask, onSearch }: HeaderProps) {
  const unreadCount = useNotificationStore((s) => s.getUnreadCount())

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--border-radius-md)] bg-[var(--accent-blue)]">
            <span className="text-sm font-bold text-white">C</span>
          </div>
          <h2 className="hidden text-sm font-medium text-[var(--text-primary)] sm:block">
            CLine Task Monitor
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip content="New Task (Ctrl+N)">
          <button
            onClick={onNewTask}
            className="flex h-8 items-center gap-1.5 rounded-[var(--border-radius-md)] bg-[var(--accent-blue)] px-3 text-xs font-medium text-white hover:bg-[var(--accent-blue)]/90 transition-default cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Task</span>
          </button>
        </Tooltip>

        <Tooltip content="Search (Ctrl+F)">
          <button
            onClick={onSearch}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-default cursor-pointer"
          >
            <Search className="h-4 w-4" />
          </button>
        </Tooltip>

        <Tooltip content={wsConnected ? 'Connected' : 'Disconnected'}>
          <div className="flex items-center gap-1.5">
            {wsConnected ? (
              <Wifi className="h-4 w-4 text-[var(--accent-green)]" />
            ) : (
              <WifiOff className="h-4 w-4 text-[var(--accent-red)]" />
            )}
          </div>
        </Tooltip>

        <Tooltip content="Notifications">
          <button className="relative flex h-8 w-8 items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-default cursor-pointer">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-red)] text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </Tooltip>
      </div>
    </header>
  )
}

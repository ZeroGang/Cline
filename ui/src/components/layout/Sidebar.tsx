import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  BarChart3,
  Settings,
  Wrench,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useUIStore } from '@/stores/uiStore'
import { Tooltip } from '@/components/common/Tooltip'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks', icon: ListTodo, label: 'Task Management' },
  { to: '/agents', icon: FolderKanban, label: 'Agents' },
  { to: '/logs', icon: BarChart3, label: 'Statistics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/tools', icon: Wrench, label: 'Toolbox' },
]

interface SidebarProps {
  wsConnected?: boolean
}

export function Sidebar({ wsConnected = false }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const location = useLocation()

  return (
    <aside
      className={cn(
        'hidden flex-col border-r border-[var(--border-color)] bg-[#1a1a1a] transition-all duration-300 md:flex',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className="flex h-14 items-center border-b border-[var(--border-color)] px-4">
        {!sidebarCollapsed && (
          <h1 className="text-lg font-bold text-[var(--text-primary)]">CLine</h1>
        )}
        <button
          onClick={toggleSidebar}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-default cursor-pointer',
            sidebarCollapsed ? 'mx-auto' : 'ml-auto'
          )}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 py-2">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to || (to !== '/dashboard' && location.pathname.startsWith(to))
          const link = (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 rounded-[var(--border-radius-md)] mx-2 px-3 py-2.5 text-sm font-medium transition-default',
                isActive
                  ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                sidebarCollapsed && 'justify-center px-0'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </NavLink>
          )

          if (sidebarCollapsed) {
            return (
              <Tooltip key={to} content={label} placement="right">
                {link}
              </Tooltip>
            )
          }

          return link
        })}
      </nav>

      <div className="border-t border-[var(--border-color)] p-3">
        <div className={cn('flex items-center gap-2', sidebarCollapsed && 'justify-center')}>
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              wsConnected ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-red)]'
            )}
            role="status"
            aria-label={wsConnected ? 'System running' : 'System disconnected'}
          />
          {!sidebarCollapsed && (
            <span className="text-xs text-[var(--text-muted)]">
              {wsConnected ? 'System Running' : 'Disconnected'}
            </span>
          )}
        </div>
      </div>
    </aside>
  )
}

import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Bot,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useUIStore } from '@/stores/uiStore'
import { Tooltip } from '@/components/common/Tooltip'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const location = useLocation()

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-[var(--border-color)] bg-[var(--bg-secondary)] transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-56'
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
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 py-2">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to))
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
        {!sidebarCollapsed && (
          <div className="text-xs text-[var(--text-muted)]">CLine Monitor v1.0</div>
        )}
      </div>
    </aside>
  )
}

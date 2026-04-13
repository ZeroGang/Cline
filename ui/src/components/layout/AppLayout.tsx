import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Footer } from './Footer'
import { DetailPanel } from './DetailPanel'
import { useState, useEffect } from 'react'
import { useUIStore } from '@/stores/uiStore'

export function AppLayout() {
  const [wsConnected] = useState(false)
  const { setSidebarCollapsed, closeDetailPanel } = useUIStore()

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      if (width <= 768) {
        setSidebarCollapsed(true)
        closeDetailPanel()
      } else if (width <= 1024) {
        setSidebarCollapsed(true)
      } else {
        setSidebarCollapsed(false)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setSidebarCollapsed, closeDetailPanel])

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      <Sidebar wsConnected={wsConnected} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header wsConnected={wsConnected} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <Footer wsConnected={wsConnected} />
      </div>
      <div className="hidden lg:block">
        <DetailPanel />
      </div>
    </div>
  )
}

import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { DetailPanel } from './DetailPanel'
import { useState } from 'react'

export function AppLayout() {
  const [wsConnected] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header wsConnected={wsConnected} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <DetailPanel />
    </div>
  )
}

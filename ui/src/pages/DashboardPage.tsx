import { BarChart3, Clock, CheckCircle2, XCircle, Zap } from 'lucide-react'
import { cn } from '@/utils/cn'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  trend?: string
}

function StatCard({ label, value, icon, color, trend }: StatCardProps) {
  return (
    <div className="rounded-[var(--border-radius-lg)] border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--text-muted)]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{value}</p>
          {trend && <p className="mt-1 text-xs text-[var(--accent-green)]">{trend}</p>}
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-[var(--border-radius-md)]', color)}>
          {icon}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Overview of your CLine monitoring system</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Tasks"
          value={0}
          icon={<BarChart3 className="h-5 w-5 text-[var(--accent-blue)]" />}
          color="bg-[var(--accent-blue)]/10"
        />
        <StatCard
          label="Running"
          value={0}
          icon={<Clock className="h-5 w-5 text-[var(--accent-yellow)]" />}
          color="bg-[var(--accent-yellow)]/10"
        />
        <StatCard
          label="Completed"
          value={0}
          icon={<CheckCircle2 className="h-5 w-5 text-[var(--accent-green)]" />}
          color="bg-[var(--accent-green)]/10"
        />
        <StatCard
          label="Failed"
          value={0}
          icon={<XCircle className="h-5 w-5 text-[var(--accent-red)]" />}
          color="bg-[var(--accent-red)]/10"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <h2 className="mb-4 text-sm font-medium text-[var(--text-primary)]">Task Distribution</h2>
          <div className="flex h-48 items-center justify-center text-[var(--text-muted)]">
            <Zap className="mr-2 h-5 w-5" />
            <span>Waiting for data...</span>
          </div>
        </div>
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <h2 className="mb-4 text-sm font-medium text-[var(--text-primary)]">Recent Activity</h2>
          <div className="flex h-48 items-center justify-center text-[var(--text-muted)]">
            <Zap className="mr-2 h-5 w-5" />
            <span>No recent activity</span>
          </div>
        </div>
      </div>
    </div>
  )
}

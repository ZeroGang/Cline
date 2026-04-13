import { Home, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/common/Button'

export default function NotFoundPage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-yellow)]/10">
          <AlertTriangle className="h-8 w-8 text-[var(--accent-yellow)]" />
        </div>
        <h1 className="text-4xl font-bold text-[var(--text-primary)]">404</h1>
        <p className="mt-2 text-lg text-[var(--text-secondary)]">Page Not Found</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link to="/dashboard">
          <Button variant="primary" className="mt-6">
            <Home className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  )
}

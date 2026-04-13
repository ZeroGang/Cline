import { Settings as SettingsIcon } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { Input } from '@/components/common/Input'
import { Select } from '@/components/common/Select'
import { Button } from '@/components/common/Button'
import type { PermissionMode } from '@/types/ui'

const permissionOptions = [
  { value: 'default', label: 'Default' },
  { value: 'plan', label: 'Plan Mode' },
  { value: 'auto', label: 'Auto Accept' },
  { value: 'bypass', label: 'Bypass Permissions' },
]

export default function SettingsPage() {
  const settings = useSettingsStore()
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Configure your CLine monitoring system</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <section className="rounded-[var(--border-radius-lg)] border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <h2 className="text-sm font-medium text-[var(--text-primary)]">General</h2>
          </div>

          <div className="space-y-4">
            <Select
              label="Permission Mode"
              options={permissionOptions}
              value={settings.permissionMode}
              onChange={(v) => updateSettings({ permissionMode: v as PermissionMode })}
            />

            <Input
              label="Timeout (seconds)"
              type="number"
              value={settings.timeout}
              onChange={(e) => updateSettings({ timeout: Number(e.target.value) })}
              min={0}
            />

            <Input
              label="Max Retries"
              type="number"
              value={settings.maxRetries}
              onChange={(e) => updateSettings({ maxRetries: Number(e.target.value) })}
              min={0}
            />

            <Input
              label="Max Concurrent Agents"
              type="number"
              value={settings.maxConcurrentAgents}
              onChange={(e) => updateSettings({ maxConcurrentAgents: Number(e.target.value) })}
              min={1}
            />
          </div>
        </section>

        <section className="rounded-[var(--border-radius-lg)] border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <h2 className="mb-4 text-sm font-medium text-[var(--text-primary)]">Notifications</h2>

          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={(e) => updateSettings({ emailNotifications: e.target.checked })}
                className="h-4 w-4 rounded border-[var(--border-color)] bg-[var(--bg-secondary)] accent-[var(--accent-blue)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">Enable email notifications</span>
            </label>

            {settings.emailNotifications && (
              <Input
                label="Email Address"
                type="email"
                value={settings.emailAddress}
                onChange={(e) => updateSettings({ emailAddress: e.target.value })}
                placeholder="your@email.com"
              />
            )}

            <Input
              label="Webhook URL"
              type="url"
              value={settings.webhookUrl}
              onChange={(e) => updateSettings({ webhookUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => useSettingsStore.getState().resetSettings()}>
            Reset
          </Button>
          <Button>Save Changes</Button>
        </div>
      </div>
    </div>
  )
}

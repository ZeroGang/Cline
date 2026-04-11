export interface AlertRule {
  name: string
  condition: (metrics: unknown) => boolean
  severity: 'info' | 'warning' | 'critical'
  channels: string[]
  message: string
}

export interface Alert {
  rule: AlertRule
  triggeredAt: number
  resolvedAt?: number
}

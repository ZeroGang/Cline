export type AgentId = string
export type TaskId = string
export type ToolName = string

export type AgentStatus = 'idle' | 'busy' | 'error' | 'disposed'
export type TaskStatus = 'pending' | 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled'
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'

export type PermissionMode = 'default' | 'plan' | 'auto' | 'bypass'
export type PermissionDecision = 'allow' | 'deny' | 'ask'

export type BackendType = 'in-process' | 'tmux' | 'docker'

export type HookType = 'PreToolUse' | 'PostToolUse' | 'Stop' | 'Notification' | 'PreCommit'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

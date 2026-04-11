# CLine 架构设计文档

> 基于 Claude Code 源码分析，设计一个多实例 ClaudeCode 调度器

---

## 目录

- [第一部分：概述与原则](#第一部分概述与原则)
  - [架构全景图](#架构全景图)
  - [核心数据流](#核心数据流)
  - [1. 项目概述](#1-项目概述)
  - [2. 架构设计原则](#2-架构设计原则)
- [第二部分：系统架构](#第二部分系统架构)
  - [3. 系统架构分层](#3-系统架构分层)
  - [4. 核心架构模式](#4-核心架构模式)
  - [5. 状态管理](#5-状态管理)
- [第三部分：调度器核心](#第三部分调度器核心)
  - [6. 调度器核心设计](#6-调度器核心设计)
  - [7. Backend 抽象层](#7-backend-抽象层)
  - [8. 错误处理与降级](#8-错误处理与降级)
- [第四部分：Agent 系统](#第四部分agent-系统)
  - [9. Agent 实例设计](#9-agent-实例设计)
  - [10. 工具注册表](#10-工具注册表)
  - [11. Plan Mode](#11-plan-mode)
  - [12. 子 Agent 调度](#12-子-agent-调度)
- [第五部分：安全与权限](#第五部分安全与权限)
  - [13. 权限中间件](#13-权限中间件)
  - [14. Bash 安全链](#14-bash-安全链)
  - [15. 沙箱隔离](#15-沙箱隔离)
- [第六部分：上下文管理](#第六部分上下文管理)
  - [16. 上下文预算模式](#16-上下文预算模式)
- [第七部分：可观测性](#第七部分可观测性)
  - [17. 监控系统](#17-监控系统)
  - [18. 日志系统](#18-日志系统)
  - [19. 遥测与性能分析](#19-遥测与性能分析)
- [第八部分：扩展机制](#第八部分扩展机制)
  - [20. Hook 系统](#20-hook-系统)
  - [21. MCP 集成](#21-mcp-集成)
  - [22. 插件系统](#22-插件系统)
- [第九部分：实施计划](#第九部分实施计划)
  - [23. 技术选型](#23-技术选型)
  - [24. 项目结构](#24-项目结构)
  - [25. 实施路线图](#25-实施路线图)
  - [26. 架构决策记录（ADR）](#26-架构决策记录adr)

---

# 第一部分：概述与原则

## 架构全景图

```
                              CLine 系统全景
 ┌──────────────────────────────────────────────────────────────────────┐
 │                                                                      │
 │  ┌─ 监控 UI ──────────────────────────────────────────────────────┐  │
 │  │  Dashboard ── TaskView ── AgentMonitor ── LogViewer ── Alert   │  │
 │  └──────────────────────────┬─────────────────────────────────────┘  │
 │                             │ Store 订阅                             │
 │  ┌─ 调度引擎 ──────────────┴─────────────────────────────────────┐  │
 │  │                                                                │  │
 │  │  Scheduler ──► TaskQueue ──► LoadBalancer ──► AgentPool       │  │
 │  │      │              │                              │           │  │
 │  │      │         Coordinator ◄── Mailbox ──► SubAgents           │  │
 │  │      │              │                              │           │  │
 │  │      └──────────────┴──────────────────────────────┘           │  │
 │  └──────────────────────────┬─────────────────────────────────────┘  │
 │                             │ Backend 抽象层                         │
 │  ┌─ Agent 实例 ────────────┴─────────────────────────────────────┐  │
 │  │                                                                │  │
 │  │  AgentInstance ──► QueryEngine ──► ToolExecutor               │  │
 │  │       │                 │                  │                   │  │
 │  │  ContextManager    AgentLoop          ToolRegistry             │  │
 │  │   (五层压缩)      (流式循环)         (声明式工具)              │  │
 │  │                                                                │  │
 │  └──────────────────────────┬─────────────────────────────────────┘  │
 │                             │                                       │
 │  ┌─ 基础设施 ──────────────┴─────────────────────────────────────┐  │
 │  │                                                                │  │
 │  │  StateStore │ PermissionSystem │ Sandbox │ Logger │ Metrics   │  │
 │  │             │  (规则+模式+链)   │ (隔离)  │ (聚合) │ (遥测)   │  │
 │  │                                                                │  │
 │  │  HookSystem │ MCPManager │ PluginManager │ CircuitBreaker     │  │
 │  │  (拦截器)   │ (外部工具) │ (扩展)        │ (熔断器)          │  │
 │  └────────────────────────────────────────────────────────────────┘  │
 │                                                                      │
 └──────────────────────────────────────────────────────────────────────┘
```

## 核心数据流

```
用户提交任务
     │
     ▼
 TaskQueue.enqueue() ──── 依赖检查 ──── 等待队列
     │                                      │
     ▼                                      │ (依赖满足后入队)
 Scheduler.schedule() ◄─────────────────────┘
     │
     ▼
 LoadBalancer.selectNext() ── 选择策略 (优先级/公平/依赖)
     │
     ▼
 AgentPool.acquire() ── Backend 抽象 ── InProcess / Tmux / Docker
     │
     ▼
 AgentInstance.execute(task)
     │
     ▼
 ┌─ Agent Loop ─────────────────────────────────────────────┐
 │                                                          │
 │  applyContextPipeline() ── 五层压缩 ── 管理上下文窗口    │
 │       │                                                  │
 │       ▼                                                  │
 │  deps.callModel() ── LLM 流式响应                        │
 │       │                                                  │
 │       ├── tool_use_block ──► StreamingToolExecutor       │
 │       │                        │                         │
 │       │                   并发/串行执行                   │
 │       │                        │                         │
 │       │                  权限检查 ── Bash安全链 ── 沙箱   │
 │       │                        │                         │
 │       │                  Hook: PreToolUse → PostToolUse  │
 │       │                        │                         │
 │       ▼                        ▼                         │
 │  yield AgentEvent ◄──── tool_result                     │
 │       │                                                  │
 │  shouldTerminate? ── Yes ──► return result              │
 │       │  No                                              │
 │       └──► next turn                                     │
 │                                                          │
 └──────────────────────────────────────────────────────────┘
     │
     ▼
 Scheduler.handleAgentEvent()
     │
     ├──► Store.setState() ──► UI 响应式更新
     ├──► MetricsCollector.record()
     ├──► Logger.info()
     └──► AlertManager.check()
```

## 1. 项目概述

### 1.1 项目定位

CLine 是一个 **ClaudeCode 多实例调度器**，核心目标是：

- **调度多个 Claude Code 实例**：并行处理多个任务，提高整体吞吐量
- **任务队列管理**：任务优先级、依赖管理、失败重试
- **监控与可观测性**：执行日志、状态监控、告警机制
- **权限与安全**：细粒度的权限控制和安全隔离

### 1.2 核心类型速查

以下是贯穿全文的关键类型定义索引，便于快速查阅：

| 类型 | 定义位置 | 说明 |
|------|----------|------|
| `Scheduler` | §6.1 | 调度器核心接口 |
| `Task` | §6.2 | 任务定义（含优先级、依赖、重试） |
| `TaskQueue` | §6.2 | 任务队列（含依赖图） |
| `AgentPool` | §6.3 | Agent 实例池（弹性伸缩） |
| `LoadBalanceStrategy` | §6.4 | 负载均衡策略接口 |
| `AgentBackend` | §7.2 | Backend 抽象接口 |
| `BackendType` | §7.2 | `'in-process' \| 'tmux' \| 'docker'` |
| `CircuitBreaker` | §8.4 | 熔断器（系统级错误保护） |
| `AgentInstance` | §9.1 | Agent 实例（执行/中断/指标） |
| `AgentContext` | §9.2 | Agent 上下文（消息/中断/工具/权限） |
| `Tool<I, O>` | §10.1 | 工具接口（声明式定义） |
| `ToolRegistry` | §10.2 | 工具注册表 |
| `PermissionMode` | §11.2 | `'default' \| 'plan' \| 'auto' \| 'bypass'` |
| `AgentDefinition` | §12.1 | 子 Agent 类型定义 |
| `PermissionRule` | §13.3 | 权限规则（allow/deny/ask） |
| `HookConfig` | §20.1 | Hook 配置（类型/命令/匹配器） |
| `HookResult` | §20.2 | Hook 执行结果（proceed/修改输入输出） |
| `AppState` | §5.1 | 全局应用状态（DeepImmutable） |
| `SchedulerEvent` | §17.2 | 调度器事件类型 |
| `AgentEvent` | §17.2 | Agent 事件类型 |
| `Metrics` | §19.3 | 指标集合（Counter/Gauge/Histogram） |
| `TelemetryEvent` | §19.1 | 遥测事件 |
| `Plugin` | §22.1 | 插件接口（工具/命令/策略/导出器） |
| `MCPServer` | §21.1 | MCP 服务器接口 |

### 1.3 设计理念

参考 Claude Code 的架构设计，CLine 遵循以下核心理念：

1. **把不确定的模型放进确定的系统结构里** - 通过状态、权限、上下文预算、恢复协议来管理 Agent 的不确定性
2. **边界管理能力是真正可复用的架构资产** - 模型能力会变化，但边界管理能力是稳定的
3. **渐进式设计** - 从核心功能开始，逐步扩展能力边界

---

## 2. 架构设计原则

参考 Claude Code 的七条核心设计原则：

### 2.1 流式优先

- 所有 Agent 操作都应该是流式的
- 用户不应该等待完整响应才能看到进度
- 使用 AsyncGenerator 作为核心原语

### 2.2 默认隔离

- 每个 Agent 实例有独立的上下文和状态
- Agent 之间通过消息传递通信，不共享可变状态
- 遵循 Actor 模型而非共享内存模型

### 2.3 权限最小化

- 默认拒绝，显式允许
- 分层权限模型：全局模式 → 工具级 → 文件级
- 安全检查不可绕过

### 2.4 渐进增强

- 核心功能最小化，扩展能力可插拔
- Feature Flag 门控实验性功能
- 降级策略保证基本可用

### 2.5 用户始终可控

- 任何时刻用户都可以中断 Agent
- 权限确认机制让用户理解正在发生什么
- 透明的执行日志和状态展示

### 2.6 优雅降级

- 部分组件失败时系统仍能提供价值
- MCP 连接失败不阻止启动
- 配置错误容忍

### 2.7 可观测性

- 完整的执行日志
- 实时状态监控
- 成本追踪和预算控制

---

# 第二部分：系统架构

## 3. 系统架构分层

参考 Claude Code 的四层架构，CLine 采用类似的分层设计：

```
┌─────────────────────────────────────────────────────────────────┐
│                        监控 UI 层 (React)                        │
│  Dashboard | TaskView | AgentMonitor | LogViewer | Settings     │
├─────────────────────────────────────────────────────────────────┤
│                        调度引擎层                                 │
│  Scheduler | TaskQueue | AgentPool | LoadBalancer | Coordinator │
├─────────────────────────────────────────────────────────────────┤
│                        Agent 实例层                              │
│  AgentInstance | QueryEngine | ToolExecutor | ContextManager    │
├─────────────────────────────────────────────────────────────────┤
│                        基础设施层                                │
│  StateStore | PermissionSystem | Sandbox | Logger | Metrics     │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 第一层：监控 UI 层

**职责**：渲染状态、转发用户操作、展示执行进度

**核心组件**：

```
ui/
├── Dashboard/           # 主控制面板
│   ├── TaskPanel        # 任务列表面板
│   ├── AgentPanel       # Agent 状态面板
│   └── MetricsPanel     # 指标监控面板
├── TaskView/            # 任务详情视图
├── AgentMonitor/        # Agent 执行监控
├── LogViewer/           # 日志查看器
└── Settings/            # 配置管理
```

**设计原则**：
- UI 层不包含业务逻辑
- 只负责渲染状态和转发用户操作
- 通过 Store 订阅实现响应式更新

### 3.2 第二层：调度引擎层

**职责**：任务调度、Agent 生命周期管理、负载均衡

**核心模块**：

```
scheduler/
├── Scheduler.ts         # 调度器核心
├── TaskQueue.ts         # 任务队列管理
├── AgentPool.ts         # Agent 实例池
├── LoadBalancer.ts      # 负载均衡策略
├── Coordinator.ts       # 多 Agent 协调器
└── strategies/          # 调度策略
    ├── PriorityStrategy
    ├── DependencyStrategy
    └── FairShareStrategy
```

**调度器核心接口**：

```typescript
interface Scheduler {
  submitTask(task: Task): Promise<TaskId>
  cancelTask(taskId: TaskId): Promise<void>
  getTaskStatus(taskId: TaskId): TaskStatus
  getAgentStatus(agentId: AgentId): AgentStatus
  pause(): void
  resume(): void
}
```

### 3.3 第三层：Agent 实例层

**职责**：执行具体任务、管理上下文、调用工具

**核心模块**：

```
agent/
├── AgentInstance.ts     # Agent 实例封装
├── QueryEngine.ts       # 查询引擎（参考 Claude Code）
├── ToolExecutor.ts      # 工具执行器
├── ContextManager.ts    # 上下文管理
├── MessageHistory.ts    # 消息历史管理
└── CompactService.ts    # 上下文压缩服务
```

**Agent 实例接口**：

```typescript
interface AgentInstance {
  id: AgentId
  status: AgentStatus
  currentTask: Task | null
  
  execute(task: Task): AsyncGenerator<AgentEvent>
  interrupt(): Promise<void>
  getMetrics(): AgentMetrics
  dispose(): Promise<void>
}
```

### 3.4 第四层：基础设施层

**职责**：状态管理、权限控制、日志、指标

**核心模块**：

```
infrastructure/
├── state/
│   ├── Store.ts         # 响应式状态存储
│   └── AppState.ts      # 全局应用状态
├── permissions/
│   ├── PermissionSystem.ts
│   ├── RuleEngine.ts
│   └── PermissionMode.ts
├── sandbox/
│   └── SandboxAdapter.ts
├── logging/
│   ├── Logger.ts
│   └── LogStore.ts
└── metrics/
    ├── MetricsCollector.ts
    └── CostTracker.ts
```

---

## 4. 核心架构模式

参考 Claude Code 的七大架构模式，CLine 采用以下模式：

### 4.1 Agent 循环模式

**核心问题**：Agent 的执行是一个可能执行零次或多次工具调用的循环

**解决方案**：使用 AsyncGenerator 实现 Agent 循环

```typescript
async function* agentLoop(
  task: Task,
  context: AgentContext
): AsyncGenerator<AgentEvent> {
  const state = initializeState(task, context)
  
  while (true) {
    // 1. 上下文管理管道（五层压缩）
    const messages = await applyContextPipeline(state)
    yield { type: 'context_built', messages }
    
    // 2. 调用 LLM（流式）
    const stream = deps.callModel(messages)
    for await (const event of stream) {
      // 3. 流式工具执行：检测到 tool_use 立即执行
      if (event.type === 'tool_use_block_complete') {
        streamingToolExecutor.addTool(event.toolBlock)
      }
      
      // 4. 非阻塞获取已完成工具结果
      for (const result of streamingToolExecutor.getCompletedResults()) {
        yield { type: 'tool_result', result }
      }
      
      // 扣留机制：某些错误不立即 yield
      if (!shouldWithhold(event)) {
        yield event
      }
    }
    
    // 5. 检查终止条件
    if (shouldTerminate(state)) {
      return { reason: state.terminationReason }
    }
    
    // 6. 检查中断
    if (state.abortSignal.aborted) {
      yield* yieldMissingToolResults(state.pendingToolCalls, 'User interrupted')
      return { reason: 'aborted' }
    }
    
    state.turnCount++
  }
}
```

**关键设计点**：

| 设计点 | 说明 |
|--------|------|
| 流式 yield | 每个 content_block_stop 时 yield，而非等待 message_stop |
| 闭包状态保持 | State 对象在迭代间传递，包含 transition 原因字段 |
| AbortController 级联 | 父子控制器支持细粒度中断控制 |
| 依赖注入 | 通过 `deps.callModel()` 实现可测试性 |

#### 4.1.1 StreamingToolExecutor：流式工具执行器

**核心洞察**：工具执行不能等模型输出完成。当第一个 tool_use block 完成时，就应该开始执行。

```typescript
class StreamingToolExecutor {
  private pending: Map<string, Promise<ToolResult>>
  private completed: ToolResult[]
  
  addTool(toolBlock: ToolUseBlock, message: AssistantMessage): void {
    const tool = this.toolRegistry.get(toolBlock.name)
    
    if (tool.isConcurrencySafe(toolBlock.input)) {
      const promise = this.executeTool(tool, toolBlock)
      this.pending.set(toolBlock.id, promise)
    } else {
      this.serialQueue.push({ tool, toolBlock })
    }
  }
  
  *getCompletedResults(): Generator<ToolResultMessage> {
    for (const [id, promise] of this.pending) {
      if (promise.status === 'fulfilled') {
        this.pending.delete(id)
        yield this.createResultMessage(id, promise.value)
      }
    }
  }
}
```

#### 4.1.2 扣留（Withholding）机制

不是所有流式输出都应该立刻到达消费者：

```typescript
let withheld = false

if (isWithheldMaxOutputTokens(message)) {
  withheld = true
  state.maxOutputTokensOverride = 64000
  state.messages.push(createRecoveryMessage())
  continue
}

if (!withheld) {
  yield message
}
```

#### 4.1.3 依赖注入：可测试性保障

```typescript
interface QueryDeps {
  callModel(params: ModelParams): AsyncGenerator<Message>
  autocompact(messages: Message[]): Promise<CompactResult>
  microcompact(messages: Message[]): Message[]
  uuid(): string
}

// 生产环境
const productionDeps = (): QueryDeps => ({
  callModel: (p) => claudeApi.queryModel(p),
  autocompact: (m) => compactService.autoCompact(m),
  microcompact: (m) => compactService.microCompact(m),
  uuid: () => crypto.randomUUID(),
})

// 测试环境
const testDeps = (mocks: MockConfig): QueryDeps => ({
  callModel: async function* () {
    for (const msg of mocks.responses) yield msg
  },
  autocompact: async () => ({ messages: mocks.compacted, tokensSaved: 1000 }),
  microcompact: (m) => m,
  uuid: () => 'test-uuid',
})
```

### 4.2 多 Agent 委派模式

**核心问题**：单个 Agent 能力有限，如何让多个 Agent 协作处理复杂任务

**解决方案**：协调者模式 + Actor 模型 + 邮箱系统

```
多 Agent 协作架构（Swarm）：

                    ┌─────────────────┐
                    │   Team Lead     │
                    │   (协调者)      │
                    └────────┬────────┘
                             │ Mailbox
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Teammate 1   │  │ Teammate 2   │  │ Teammate 3   │
    │ (researcher) │  │ (coder)      │  │ (tester)     │
    └──────────────┘  └──────────────┘  └──────────────┘
```

**邮箱系统设计**：

```typescript
interface AgentMailbox {
  send(to: AgentId, message: AgentMessage): void
  receive(): AsyncGenerator<AgentMessage>
  broadcast(message: AgentMessage): void
}

interface AgentMessage {
  from: AgentId
  to: AgentId | 'broadcast'
  type: 'task' | 'result' | 'query' | 'control'
  payload: unknown
  timestamp: Date
}
```

**协调者模式**：

```typescript
class Coordinator {
  private agents: Map<AgentId, AgentInstance>
  private mailboxes: Map<AgentId, AgentMailbox>
  private taskAssignments: Map<TaskId, AgentId>
  
  async coordinate(task: Task): Promise<TaskResult> {
    // 1. 分解任务
    const subtasks = await this.decomposeTask(task)
    
    // 2. 分配给合适的 Agent
    for (const subtask of subtasks) {
      const agent = this.selectAgent(subtask)
      this.mailboxes.get(agent.id).send({
        from: 'coordinator',
        to: agent.id,
        type: 'task',
        payload: subtask,
      })
    }
    
    // 3. 收集结果
    const results = await this.collectResults(subtasks)
    
    // 4. 合并结果
    return this.mergeResults(results)
  }
}
```

### 4.3 流式处理模式

**核心问题**：如何让用户在长时间操作中保持感知

**解决方案**：多层 AsyncGenerator 管道

```
流式处理管道：

LLM API Stream → 事件解析器 → 工具执行器 → 状态更新器 → UI 渲染
      │              │              │              │           │
      │              │              │              │           └─ 实时渲染
      │              │              │              └─ 更新 Store
      │              │              └─ 并行执行工具
      │              └─ 解析 SSE 事件
      └─ Anthropic API
```

### 4.4 优雅降级模式

**核心问题**：部分组件失败时如何保持系统可用

**解决方案**：多层降级策略

```
降级层次：

完整模式 → 精简模式 → 最小模式 → 紧急模式
    │           │           │           │
    │           │           │           └─ 仅核心调度功能
    │           │           └─ 禁用 MCP、插件
    │           └─ 禁用非必要工具
    └─ 所有功能可用
```

---

## 5. 状态管理

### 5.1 全局状态设计

```typescript
interface AppState {
  scheduler: {
    status: 'running' | 'paused' | 'stopped'
    activeTaskCount: number
    queuedTaskCount: number
  }
  
  tasks: Map<TaskId, TaskState>
  agents: Map<AgentId, AgentState>
  logs: LogEntry[]
  
  metrics: {
    totalTasksCompleted: number
    totalTokensUsed: number
    totalCost: number
    averageTaskDuration: number
  }
  
  config: AppConfig
  permissions: PermissionState
}
```

### 5.2 响应式 Store

```typescript
class Store<T> {
  private state: T
  private listeners: Set<Listener>
  
  getState(): T
  setState(updater: (prev: T) => T): void
  subscribe(listener: Listener): () => void
}
```

### 5.3 选择器模式

```typescript
function TaskPanel() {
  const tasks = useAppState(s => s.tasks)
  return <TaskList tasks={tasks} />
}

function AgentPanel() {
  const agents = useAppState(s => s.agents)
  return <AgentList agents={agents} />
}
```

### 5.4 DeepImmutable 类型约束

```typescript
type DeepImmutable<T> = {
  readonly [K in keyof T]: T[K] extends Function 
    ? T[K] 
    : DeepImmutable<T[K]>
}

interface AppState extends DeepImmutable<{
  scheduler: SchedulerState
  tasks: Map<TaskId, TaskState>
  agents: Map<AgentId, AgentState>
}> {}
```

---

# 第三部分：调度器核心

## 6. 调度器核心设计

### 6.1 调度器架构

```typescript
class Scheduler {
  private taskQueue: TaskQueue
  private agentPool: AgentPool
  private loadBalancer: LoadBalancer
  private coordinator: Coordinator
  
  async submitTask(task: Task): Promise<TaskId> {
    await this.validateTask(task)
    const taskId = await this.taskQueue.enqueue(task)
    this.schedule()
    return taskId
  }
  
  private async schedule(): Promise<void> {
    while (this.taskQueue.hasPending()) {
      const agent = await this.agentPool.acquire()
      if (!agent) break
      
      const task = await this.loadBalancer.selectNext(
        this.taskQueue.getPending(),
        agent
      )
      if (!task) {
        this.agentPool.release(agent)
        break
      }
      
      this.assignTask(agent, task)
    }
  }
  
  private async assignTask(agent: AgentInstance, task: Task): Promise<void> {
    try {
      agent.status = 'busy'
      task.status = 'running'
      
      for await (const event of agent.execute(task)) {
        this.handleAgentEvent(agent, task, event)
      }
      
      task.status = 'completed'
    } catch (error) {
      task.status = 'failed'
      task.error = error
      
      if (task.retryCount < task.maxRetries) {
        task.retryCount++
        await this.taskQueue.enqueue(task)
      }
    } finally {
      agent.status = 'idle'
      this.agentPool.release(agent)
      this.schedule()
    }
  }
}
```

### 6.2 任务队列设计

```typescript
interface Task {
  id: TaskId
  type: TaskType
  priority: Priority
  status: TaskStatus
  
  prompt: string
  context?: TaskContext
  
  dependencies: TaskId[]
  dependents: TaskId[]
  
  maxRetries: number
  retryCount: number
  timeout: number
  
  result?: TaskResult
  error?: Error
  
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  agentId?: AgentId
}

class TaskQueue {
  private queues: Map<Priority, Task[]>
  private dependencyGraph: DependencyGraph
  
  async enqueue(task: Task): Promise<TaskId> {
    const unresolvedDeps = this.getUnresolvedDependencies(task)
    if (unresolvedDeps.length > 0) {
      this.waitingQueue.set(task.id, { task, waitingFor: unresolvedDeps })
    } else {
      this.queues.get(task.priority).push(task)
    }
    return task.id
  }
  
  getPending(): Task[] {
    return [...this.queues.values()].flat()
  }
  
  onTaskCompleted(taskId: TaskId): void {
    const waiting = this.waitingQueue.get(taskId)
    if (waiting) {
      waiting.waitingFor = waiting.waitingFor.filter(id => id !== taskId)
      if (waiting.waitingFor.length === 0) {
        this.waitingQueue.delete(taskId)
        this.enqueue(waiting.task)
      }
    }
  }
}
```

### 6.3 Agent 池设计

```typescript
class AgentPool {
  private agents: Map<AgentId, AgentInstance>
  private available: AgentId[]
  private config: AgentPoolConfig
  
  async initialize(): Promise<void> {
    for (let i = 0; i < this.config.minAgents; i++) {
      const agent = await this.createAgent()
      this.agents.set(agent.id, agent)
      this.available.push(agent.id)
    }
  }
  
  async acquire(): Promise<AgentInstance | null> {
    if (this.available.length === 0) {
      if (this.agents.size < this.config.maxAgents) {
        const agent = await this.createAgent()
        this.agents.set(agent.id, agent)
        return agent
      }
      return null
    }
    
    const agentId = this.available.pop()
    return this.agents.get(agentId)
  }
  
  release(agent: AgentInstance): void {
    if (this.agents.size > this.config.minAgents && agent.isIdle()) {
      this.agents.delete(agent.id)
      agent.dispose()
    } else {
      this.available.push(agent.id)
    }
  }
}
```

### 6.4 负载均衡策略

```typescript
interface LoadBalanceStrategy {
  selectNext(tasks: Task[], agent: AgentInstance): Task | null
}

class PriorityStrategy implements LoadBalanceStrategy {
  selectNext(tasks: Task[], agent: AgentInstance): Task | null {
    const sorted = tasks.sort((a, b) => b.priority - a.priority)
    return sorted[0] || null
  }
}

class FairShareStrategy implements LoadBalanceStrategy {
  private agentTaskCount: Map<AgentId, number>
  
  selectNext(tasks: Task[], agent: AgentInstance): Task | null {
    const eligibleTasks = tasks.filter(t => this.canAssign(t, agent))
    if (eligibleTasks.length === 0) return null
    return eligibleTasks.sort((a, b) => 
      a.createdAt.getTime() - b.createdAt.getTime()
    )[0]
  }
}

class DependencyStrategy implements LoadBalanceStrategy {
  selectNext(tasks: Task[], agent: AgentInstance): Task | null {
    const tasksWithDependents = tasks.map(t => ({
      task: t,
      dependentCount: this.getDependentCount(t.id)
    }))
    return tasksWithDependents
      .sort((a, b) => b.dependentCount - a.dependentCount)[0]?.task
  }
}
```

---

## 7. Backend 抽象层

### 7.1 设计理念

为了支持多种执行环境，CLine 设计了 Backend 抽象层，支持：
- **InProcess**：进程内多实例（轻量、快速）
- **Tmux**：基于 Tmux 的多会话管理（隔离性好）
- **Docker**：容器化部署（最强隔离）

### 7.2 Backend 接口定义

```typescript
type BackendType = 'in-process' | 'tmux' | 'docker'

interface AgentBackend {
  readonly type: BackendType
  
  isAvailable(): Promise<boolean>
  spawn(config: AgentSpawnConfig): Promise<AgentInstance>
  sendMessage(agentId: string, message: AgentMessage): Promise<void>
  terminate(agentId: string, reason?: string): Promise<void>
  getOutput(agentId: string): AsyncGenerator<OutputEvent>
  isActive(agentId: string): Promise<boolean>
}

interface AgentSpawnConfig {
  id: string
  cwd: string
  model?: string
  tools?: string[]
  permissions?: PermissionConfig
  env?: Record<string, string>
}
```

### 7.3 Backend 实现

#### InProcess Backend

```typescript
class InProcessBackend implements AgentBackend {
  readonly type = 'in-process'
  private agents: Map<string, AgentInstance>
  
  async isAvailable(): Promise<boolean> {
    return true
  }
  
  async spawn(config: AgentSpawnConfig): Promise<AgentInstance> {
    const agent = new AgentInstance(config)
    await agent.initialize()
    this.agents.set(config.id, agent)
    return agent
  }
  
  async *getOutput(agentId: string): AsyncGenerator<OutputEvent> {
    const agent = this.agents.get(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)
    yield* agent.outputStream
  }
}
```

#### Tmux Backend

```typescript
class TmuxBackend implements AgentBackend {
  readonly type = 'tmux'
  private sessions: Map<string, TmuxSession>
  
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('tmux -V')
      return true
    } catch {
      return false
    }
  }
  
  async spawn(config: AgentSpawnConfig): Promise<AgentInstance> {
    const sessionName = `cline-${config.id}`
    await execAsync(`tmux new-session -d -s ${sessionName}`)
    await execAsync(`tmux send-keys -t ${sessionName} 'claude-code' Enter`)
    
    return new TmuxAgentInstance(sessionName, config)
  }
  
  async *getOutput(agentId: string): AsyncGenerator<OutputEvent> {
    const session = this.sessions.get(agentId)
    if (!session) throw new Error(`Session ${agentId} not found`)
    
    while (await this.isActive(agentId)) {
      const output = await execAsync(`tmux capture-pane -t ${session.name} -p`)
      yield { type: 'output', content: output }
      await sleep(100)
    }
  }
}
```

### 7.4 Backend 选择策略

```typescript
function selectBackend(preference?: BackendType): Promise<AgentBackend> {
  const backends = [
    new InProcessBackend(),
    new TmuxBackend(),
    new DockerBackend(),
  ]
  
  if (preference) {
    const backend = backends.find(b => b.type === preference)
    if (backend && await backend.isAvailable()) {
      return backend
    }
  }
  
  for (const backend of backends) {
    if (await backend.isAvailable()) {
      return backend
    }
  }
  
  throw new Error('No available backend')
}
```

---

## 8. 错误处理与降级

### 8.1 三层错误架构

AI Agent 的错误是一个光谱——从"这个工具失败了"到"系统级故障"。CLine 采用三层隔离架构：

```
┌─────────────────────────────────────────────────────────────────┐
│                    第三层：系统级错误                            │
│  网络断开 | SSL错误 | API过载(529) | 认证失效                    │
│                         ↓                                       │
│                    熔断器阻止级联故障                            │
├─────────────────────────────────────────────────────────────────┤
│                    第二层：查询级错误                            │
│  流式请求失败 | 速率限制(429) | Prompt过长(400)                  │
│                         ↓                                       │
│                    查询降级 (streaming → sync)                   │
├─────────────────────────────────────────────────────────────────┤
│                    第一层：工具级错误                            │
│  Shell命令失败 | 文件读写失败 | MCP超时                          │
│                         ↓                                       │
│                    工具隔离，不影响其他工具                       │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 第一层：工具级错误隔离

**设计哲学**：工具错误不是异常，而是工具的输出。

```typescript
class ShellError extends Error {
  constructor(
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly code: number,
    public readonly interrupted: boolean,
  ) {
    super('Shell command failed')
    this.name = 'ShellError'
  }
}

async function executeTool(tool: Tool, input: unknown): Promise<ToolResult> {
  try {
    const result = await tool.execute(input, context)
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: formatToolError(error),
      stdout: error.stdout,
      stderr: error.stderr,
    }
  }
}
```

**短堆栈设计**：只保留前 5 帧，节省上下文空间：

```typescript
function shortErrorStack(e: unknown, maxFrames = 5): string {
  if (!(e instanceof Error)) return String(e)
  const lines = e.stack?.split('\n') ?? []
  const frames = lines.slice(1).filter(l => l.trim().startsWith('at '))
  if (frames.length <= maxFrames) return e.stack ?? e.message
  return [lines[0], ...frames.slice(0, maxFrames)].join('\n')
}
```

### 8.3 第二层：查询级错误与降级

```typescript
function getAssistantMessageFromError(error: unknown): AssistantMessage {
  if (isTimeout(error)) {
    return createAPIErrorMessage('Request timed out')
  }
  
  if (isRateLimit(error)) {
    const resetTime = parseRateLimitHeaders(error)
    return createAPIErrorMessage(`Rate limited. Resets at ${resetTime}`)
  }
  
  if (isPromptTooLong(error)) {
    return createAPIErrorMessage('Prompt too long. Try compacting the conversation.')
  }
  
  if (isAuthError(error)) {
    return createAPIErrorMessage('Authentication failed. Please run /login.')
  }
  
  return createAPIErrorMessage(formatAPIError(error))
}
```

### 8.4 第三层：系统级错误与熔断

```typescript
class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  
  constructor(
    private threshold = 5,
    private resetTimeout = 60000,
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open'
      } else {
        throw new Error('Circuit breaker is open')
      }
    }
    
    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
  
  private onSuccess(): void {
    this.failures = 0
    this.state = 'closed'
  }
  
  private onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()
    if (this.failures >= this.threshold) {
      this.state = 'open'
    }
  }
}
```

---

# 第四部分：Agent 系统

## 9. Agent 实例设计

### 9.1 Agent 实例结构

```typescript
class AgentInstance {
  id: AgentId
  status: AgentStatus
  currentTask: Task | null
  
  private context: AgentContext
  private toolExecutor: ToolExecutor
  private contextManager: ContextManager
  
  async *execute(task: Task): AsyncGenerator<AgentEvent> {
    this.status = 'busy'
    this.currentTask = task
    
    try {
      const context = await this.contextManager.prepare(task)
      
      for await (const event of this.agentLoop(context)) {
        yield event
        
        if (this.abortSignal.aborted) {
          yield { type: 'aborted', reason: 'User interrupted' }
          return
        }
      }
      
      yield { type: 'completed', result: context.result }
    } finally {
      this.status = 'idle'
      this.currentTask = null
    }
  }
  
  async interrupt(): Promise<void> {
    this.abortController.abort()
  }
  
  getMetrics(): AgentMetrics {
    return {
      totalTokens: this.contextManager.totalTokens,
      totalCost: this.contextManager.totalCost,
      toolCalls: this.toolExecutor.callCount,
      turns: this.turnCount,
    }
  }
}
```

### 9.2 Agent 上下文

```typescript
interface AgentContext {
  messages: Message[]
  abortController: AbortController
  abortSignal: AbortSignal
  setAppState: (updater: (prev: AppState) => AppState) => void
  getAppState: () => AppState
  tools: Map<string, Tool>
  readFileState: FileStateCache
  contentReplacementState: ContentReplacementState
  toolPermissionContext: ToolPermissionContext
  mcpTools: Map<string, Tool>
}
```

---

## 10. 工具注册表

### 10.1 工具接口定义

```typescript
interface Tool<Input, Output> {
  name: string
  description: string
  inputSchema: z.ZodSchema<Input>
  
  isEnabled(): boolean
  isConcurrencySafe(input: Input): boolean
  isReadOnly(input: Input): boolean
  isDestructive(input: Input): boolean
  
  checkPermissions(input: Input, context: ToolContext): Promise<PermissionResult>
  execute(input: Input, context: ToolContext): Promise<ToolResult<Output>>
}
```

### 10.2 工具注册表

```typescript
class ToolRegistry {
  private tools: Map<string, Tool<unknown, unknown>>
  
  register(tool: Tool<unknown, unknown>): void
  get(name: string): Tool<unknown, unknown> | undefined
  getAll(): Tool<unknown, unknown>[]
  filter(predicate: (tool: Tool) => boolean): Tool<unknown, unknown>[]
}
```

### 10.3 内置工具

| 工具名 | 功能 | 只读 | 并发安全 |
|--------|------|------|----------|
| Read | 读取文件 | ✓ | ✓ |
| Write | 写入文件 | ✗ | ✗ |
| Edit | 编辑文件 | ✗ | ✗ |
| Glob | 文件模式匹配 | ✓ | ✓ |
| Grep | 内容搜索 | ✓ | ✓ |
| Bash | 执行命令 | ✗ | 取决于命令 |
| WebFetch | 获取网页 | ✓ | ✓ |
| WebSearch | 网络搜索 | ✓ | ✓ |
| AskUserQuestion | 询问用户 | ✓ | ✓ |

---

## 11. Plan Mode

### 11.1 核心设计理念

**问题**：Agent 可能在未充分理解任务时就开始执行写入操作，导致方向错误或连锁破坏。

**解决方案**：通过权限系统强制分离思考（只读）和行动（读写）阶段。

```
Plan Mode 状态转换：

普通模式 ──────────────────────────────────────────────────────
    │
    ├─── EnterPlanModeTool.call() ───→ Plan Mode（只读探索）
    │                                      │
    │                                      ├── Read, Glob, Grep（允许）
    │                                      ├── WebFetch, AskUserQuestion（允许）
    │                                      ├── Write, Edit, Bash写操作（拒绝）
    │                                      │
    │                                      └── 编写 plan 文件
    │                                              │
    │←── ExitPlanMode + 用户审批 ───────────────────┘
    │
    └──→ 恢复原有权限模式，开始执行
```

### 11.2 权限模式扩展

```typescript
type PermissionMode = 'default' | 'plan' | 'auto' | 'bypass'

const PERMISSION_MODE_CONFIG = {
  default: { title: 'Default', symbol: '○' },
  plan: { 
    title: 'Plan Mode', 
    shortTitle: 'Plan',
    symbol: '⏸',
    color: 'planMode',
  },
  auto: { title: 'Auto', symbol: '⚡' },
  bypass: { title: 'Bypass', symbol: '🔓' },
}

const PLAN_MODE_READONLY_TOOLS = [
  'Read', 'Glob', 'Grep', 'WebFetch', 'AskUserQuestion',
  'ToolSearch', 'EnterPlanMode', 'ExitPlanMode',
]
```

### 11.3 进入/退出 Plan Mode

```typescript
const EnterPlanModeTool: Tool = {
  name: 'EnterPlanMode',
  isReadOnly: () => true,
  shouldDefer: true,
  searchHint: 'switch to plan mode to design an approach before coding',
  
  async call(input, context) {
    const prePlanMode = context.permissionMode
    
    context.setAppState(prev => ({
      ...prev,
      toolPermissionContext: {
        ...prev.toolPermissionContext,
        mode: 'plan',
        prePlanMode,
      },
    }))
    
    return {
      message: `Entered plan mode. You should:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval

Remember: DO NOT write or edit any files yet. This is a read-only exploration phase.`
    }
  },
}

const ExitPlanModeTool: Tool = {
  name: 'ExitPlanMode',
  isReadOnly: () => true,
  shouldDefer: true,
  
  async checkPermissions(input, context) {
    return {
      behavior: 'ask',
      message: 'Exit plan mode and start execution?',
    }
  },
  
  async call(input, context) {
    const prePlanMode = context.toolPermissionContext.prePlanMode ?? 'default'
    
    context.setAppState(prev => ({
      ...prev,
      toolPermissionContext: {
        ...prev.toolPermissionContext,
        mode: prePlanMode,
        prePlanMode: undefined,
      },
    }))
    
    return { message: 'User has approved your plan. You can now start coding.' }
  },
}
```

---

## 12. 子 Agent 调度

### 12.1 Agent 类型定义

```typescript
interface AgentDefinition {
  agentType: string
  description: string
  systemPrompt: string
  
  tools?: string[]
  disallowedTools?: string[]
  permissionMode?: PermissionMode
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  isolation?: 'worktree' | 'remote' | 'none'
  background?: boolean
  maxTurns?: number
  requiredMcpServers?: string[]
}

const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    agentType: 'general',
    description: 'General purpose agent',
    systemPrompt: '...',
    model: 'inherit',
  },
  {
    agentType: 'explore',
    description: 'Code exploration agent',
    systemPrompt: 'Focus on understanding and exploring code...',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch'],
    permissionMode: 'plan',
  },
  {
    agentType: 'plan',
    description: 'Planning agent',
    systemPrompt: 'Focus on creating implementation plans...',
    permissionMode: 'plan',
    maxTurns: 10,
  },
]
```

### 12.2 上下文隔离

```typescript
function createSubagentContext(
  parentContext: AgentContext,
  options: SubagentOptions
): AgentContext {
  return {
    readFileState: cloneFileStateCache(parentContext.readFileState),
    messages: [],
    abortController: createChildAbortController(parentContext.abortController),
    setAppState: options.shareSetAppState ? parentContext.setAppState : () => {},
    setAppStateForTasks: parentContext.setAppStateForTasks,
    tools: assembleToolPool(
      { ...parentContext.toolPermissionContext, mode: options.permissionMode },
      parentContext.mcpTools
    ),
    contentReplacementState: cloneContentReplacementState(
      parentContext.contentReplacementState
    ),
  }
}

function createChildAbortController(parent: AbortController): AbortController {
  const child = new AbortController()
  parent.signal.addEventListener('abort', () => child.abort())
  return child
}
```

### 12.3 同步与异步执行

```typescript
async function executeSubagent(input: AgentToolInput, context: AgentContext) {
  const agentDef = selectAgentDefinition(input.subagent_type)
  
  if (agentDef.requiredMcpServers) {
    await waitForMcpServers(agentDef.requiredMcpServers, { timeout: 30000 })
  }
  
  const subagentContext = createSubagentContext(context, {
    permissionMode: agentDef.permissionMode,
    shareSetAppState: false,
  })
  
  const shouldRunAsync = (
    input.run_in_background === true ||
    agentDef.background === true ||
    context.isCoordinatorMode
  )
  
  if (shouldRunAsync) {
    const taskId = registerAsyncAgent({
      context: subagentContext,
      definition: agentDef,
      prompt: input.prompt,
    })
    return { status: 'async_launched', taskId }
  } else {
    const result = await runAgent(subagentContext, agentDef, input.prompt)
    return { status: 'completed', result }
  }
}
```

---

# 第五部分：安全与权限

## 13. 权限中间件

### 13.1 权限决策流程

```
工具请求 → 规则匹配 → 模式检查 → 工具自身检查 → 安全边界检查 → 用户确认 → 执行
    │           │           │              │               │            │
    │           │           │              │               │            └─ 会话级缓存
    │           │           │              │               └─ .git/、配置文件等敏感路径
    │           │           │              └─ 工具定义的权限要求
    │           │           └─ default/plan/auto/bypass 模式
    │           └─ allow/deny/ask 规则
    └─ 用户设置/项目设置/策略设置
```

### 13.2 权限模式

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| default | 每次危险操作询问 | 日常交互 |
| plan | 只读规划 | 方案评审 |
| auto | AI 分类器自动判断 | 高信任场景 |
| bypass | 跳过权限检查 | CI/CD 环境 |

### 13.3 权限规则引擎

```typescript
interface PermissionRule {
  type: 'allow' | 'deny' | 'ask'
  tool?: string
  pattern?: RegExp
  path?: string
  priority: number
}

class RuleEngine {
  private rules: PermissionRule[]
  
  match(tool: string, input: unknown): PermissionRule | null {
    const applicable = this.rules
      .filter(r => !r.tool || r.tool === tool)
      .sort((a, b) => b.priority - a.priority)
    
    for (const rule of applicable) {
      if (this.matchesPattern(rule, input)) {
        return rule
      }
    }
    return null
  }
}
```

---

## 14. Bash 安全链

### 14.1 纵深防御架构

```
Bash 安全链：

Agent 发起 Bash 调用
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  1. AST 安全解析 (tree-sitter-bash)                         │
│     - 白名单节点类型检查                                     │
│     - 无法解析 → 'too-complex' → 回退用户审批               │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 权限规则匹配                                            │
│     - deny 规则优先 → 拒绝                                  │
│     - allow 规则 → 允许                                     │
│     - 未匹配 → 继续下一步                                   │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 自动分类器                                              │
│     - 分析命令 + description                                │
│     - 返回 'allow' | 'deny' | 'ask'                         │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 用户交互审批                                            │
│     - 展示命令详情                                          │
│     - 用户决定：允许/拒绝/总是允许                          │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  5. 沙箱检查                                                │
│     - shouldUseSandbox() → 沙箱内执行                       │
│     - 文件系统/网络隔离                                     │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  6. 输出管理                                                │
│     - 超过 maxResultSizeChars → 截断 + 持久化               │
│     - 返回预览 + 文件路径                                   │
└─────────────────────────────────────────────────────────────┘
```

### 14.2 AST 安全解析

```typescript
import Parser from 'tree-sitter'
import Bash from 'tree-sitter-bash'

const parser = new Parser()
parser.setLanguage(Bash)

const ALLOWED_NODE_TYPES = new Set([
  'command', 'simple_command', 'command_name',
  'word', 'string', 'raw_string', 'concatenation',
  'variable_expansion', 'command_substitution',
  'pipeline', 'list', 'redirected_statement',
])

function parseForSecurity(command: string):
  | { status: 'parsed'; argv: string[] }
  | { status: 'too-complex' }
{
  const tree = parser.parse(command)
  const violations = findViolations(tree.rootNode, ALLOWED_NODE_TYPES)
  
  if (violations.length > 0) {
    return { status: 'too-complex' }
  }
  
  const argv = extractArgv(tree.rootNode)
  return { status: 'parsed', argv }
}
```

### 14.3 命令分类器

```typescript
const LOW_RISK_PATTERNS = [
  /^ls\b/, /^cat\b/, /^head\b/, /^tail\b/,
  /^grep\b/, /^find\b/, /^git status\b/,
  /^npm list\b/, /^node --version\b/,
]

const HIGH_RISK_PATTERNS = [
  /^rm\s+-rf\s+\//, /^rm\s+-rf\s+~/,
  /curl.*\|\s*bash/, /wget.*\|\s*bash/,
  /^sudo\b/, /^chmod\s+777/,
  />\s*\/dev\/sd/, /^mkfs\b/,
]

function classifyBashCommand(command: string, description: string): 
  | 'allow' | 'deny' | 'ask' 
{
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(command)) return 'deny'
  }
  
  for (const pattern of LOW_RISK_PATTERNS) {
    if (pattern.test(command)) return 'allow'
  }
  
  return 'ask'
}
```

---

## 15. 沙箱隔离

### 15.1 沙箱配置

```typescript
interface SandboxConfig {
  allowedReadPaths: string[]
  allowedWritePaths: string[]
  allowedHosts: string[]
  blockedHosts: string[]
  allowedCommands: string[]
  maxProcesses: number
}
```

### 15.2 沙箱接口

```typescript
class Sandbox {
  constructor(config: SandboxConfig)
  
  canRead(path: string): boolean
  canWrite(path: string): boolean
  canAccess(host: string): boolean
  canExecute(command: string): boolean
  
  async executeInSandbox<T>(fn: () => Promise<T>): Promise<T>
}
```

### 15.3 沙箱使用策略

```typescript
function shouldUseSandbox(command: string, config: SandboxConfig): boolean {
  const writeOperations = ['>', '>>', 'tee', 'install', 'cp', 'mv']
  for (const op of writeOperations) {
    if (command.includes(op)) return true
  }
  return false
}

async function executeInSandbox(command: string, config: SandboxConfig): Promise<ShellResult> {
  const sandbox = new SandboxRuntime({
    filesystem: {
      readable: config.allowedReadPaths,
      writable: config.allowedWritePaths,
    },
    network: {
      allow: config.allowedHosts,
      deny: config.blockedHosts,
    },
  })
  
  return sandbox.execute(command)
}
```

---

# 第六部分：上下文管理

## 16. 上下文预算模式

### 16.1 上下文窗口构成

```
上下文窗口构成（200K tokens）：

┌─────────────────────────────────────────────────────────────────┐
│ 系统提示 + 工具定义 (~20-40K)  │  对话历史 (最大 ~127K)  │ 输出预留 (~20K) │ 安全缓冲 (~13K) │
└─────────────────────────────────────────────────────────────────┘
         │                              │                    │              │
         └── 固定成本                   └── 可变成本         └── 必要成本   └── 安全边际
```

### 16.2 五层压缩管道

```
原始消息 → 工具结果预算 → Snip压缩 → Microcompact → ContextCollapse → AutoCompact → 最终上下文
    │           │             │            │              │               │
    │           │             │            │              │               └─ 摘要替换旧消息
    │           │             │            │              └─ 渐进式坍缩
    │           │             │            └─ 缓存编辑/清除标记
    │           │             └─ 丢弃式压缩
    │           └─ 限制每个工具结果大小
    └─ 对话历史
```

### 16.3 第一层：工具结果预算

```typescript
const TOOL_RESULT_BUDGETS = {
  BashTool: 100_000,
  GrepTool: 100_000,
  FileReadTool: Infinity,
}

function applyToolResultBudget(messages: Message[]): Message[] {
  return messages.map(msg => {
    if (msg.type === 'tool_result' && msg.content.length > budget) {
      const filePath = saveToDisk(msg.content)
      return { ...msg, content: `[Tool output saved to ${filePath}]`, truncated: true }
    }
    return msg
  })
}
```

### 16.4 第二层：Snip 压缩

```typescript
function snipCompactIfNeeded(messages: Message[]): SnipResult {
  const recentMessages = messages.slice(-KEEP_RECENT_COUNT)
  const tokensFreed = countTokens(messages) - countTokens(recentMessages)
  
  return { messages: recentMessages, tokensFreed }
}
```

### 16.5 第三层：Microcompact

```typescript
const COMPACTABLE_TOOLS = new Set([
  'FileRead', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch',
])

const TIME_BASED_MC_CLEARED_MESSAGE = '[Old tool result content cleared]'

function microCompact(messages: Message[]): Message[] {
  return messages.map(msg => {
    if (msg.type === 'tool_result' && COMPACTABLE_TOOLS.has(msg.toolName)) {
      if (isOlderThan(msg, AGE_THRESHOLD)) {
        return { ...msg, content: TIME_BASED_MC_CLEARED_MESSAGE }
      }
    }
    return msg
  })
}
```

### 16.6 第四层：Context Collapse

```typescript
function applyCollapsesIfNeeded(messages: Message[]): Message[] {
  const collapsible = findCollapsibleSequences(messages)
  
  for (const seq of collapsible) {
    const summary = generateSummary(seq.messages)
    collapsedMessages.push({
      type: 'collapsed',
      summary,
      originalCount: seq.messages.length,
      expandable: true,
    })
  }
  
  return replaceWithCollapsed(messages, collapsedMessages)
}
```

### 16.7 第五层：AutoCompact

```typescript
async function autoCompact(
  messages: Message[],
  context: AgentContext
): Promise<CompactResult> {
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    throw new Error('AutoCompact circuit breaker triggered')
  }
  
  const summary = await createSummaryAgent(messages, context)
  
  const recentMessages = messages.slice(-KEEP_RECENT_TURNS)
  const compactedMessages = [
    { type: 'summary', content: summary, compressedFrom: messages.length - recentMessages.length },
    ...recentMessages,
  ]
  
  return { messages: compactedMessages, tokensSaved }
}
```

### 16.8 渐进式回收原则

| 原则 | 说明 |
|------|------|
| 从轻到重 | 先用最轻量的方式回收空间，不够再用更重的方式 |
| 信息保留优先级 | CLAUDE.md > 最近消息 > 工具结果 > 早期对话 |
| 熔断保护 | 连续失败后停止尝试，避免浪费 API 调用 |
| 传递释放量 | 每层释放的 token 数传递给下一层阈值计算 |

---

# 第七部分：可观测性

## 17. 监控系统

### 17.1 监控架构

```
监控架构：

┌─────────────────────────────────────────────────────────────────┐
│                        监控 UI 层                                │
│  Dashboard | TaskView | AgentMonitor | LogViewer | AlertPanel   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      事件聚合层                                  │
│  EventBus | StateAggregator | MetricsAggregator | AlertEngine   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据收集层                                  │
│  AgentMonitor | TaskMonitor | SystemMonitor | CostTracker       │
└─────────────────────────────────────────────────────────────────┘
```

### 17.2 事件总线

```typescript
type SchedulerEvent =
  | { type: 'task_submitted'; taskId: TaskId }
  | { type: 'task_started'; taskId: TaskId; agentId: AgentId }
  | { type: 'task_completed'; taskId: TaskId; result: TaskResult }
  | { type: 'task_failed'; taskId: TaskId; error: Error }
  | { type: 'agent_created'; agentId: AgentId }
  | { type: 'agent_disposed'; agentId: AgentId }

type AgentEvent =
  | { type: 'context_built'; messages: Message[] }
  | { type: 'llm_response'; delta: string }
  | { type: 'tool_call'; tool: string; input: unknown }
  | { type: 'tool_result'; tool: string; result: unknown }
  | { type: 'error'; error: Error }

class EventEmitter<EventMap> {
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void
  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): () => void
}
```

### 17.3 实时状态追踪

```typescript
interface AgentMonitorState {
  agentId: AgentId
  status: AgentStatus
  currentTask: TaskId | null
  lastActivity: Date
  metrics: {
    tokensUsed: number
    cost: number
    toolCalls: number
    turns: number
  }
  recentEvents: AgentEvent[]
}

class AgentMonitor {
  private states: Map<AgentId, AgentMonitorState>
  
  update(agentId: AgentId, event: AgentEvent): void {
    const state = this.states.get(agentId)
    if (!state) return
    
    state.lastActivity = new Date()
    state.recentEvents.push(event)
    
    if (state.recentEvents.length > 100) {
      state.recentEvents = state.recentEvents.slice(-100)
    }
  }
}
```

### 17.4 告警规则

```typescript
interface AlertRule {
  name: string
  condition: (metrics: Metrics) => boolean
  severity: 'info' | 'warning' | 'critical'
  channels: AlertChannel[]
}

const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    name: 'high_error_rate',
    condition: m => m.errorRate > 0.1,
    severity: 'warning',
    channels: ['console', 'email'],
  },
  {
    name: 'cost_threshold',
    condition: m => m.totalCost > 100,
    severity: 'warning',
    channels: ['console'],
  },
  {
    name: 'agent_stuck',
    condition: m => m.maxAgentIdleTime > 300000,
    severity: 'info',
    channels: ['console'],
  },
]
```

---

## 18. 日志系统

### 18.1 日志结构

```typescript
interface LogEntry {
  timestamp: Date
  level: 'debug' | 'info' | 'warn' | 'error'
  source: 'scheduler' | 'agent' | 'tool' | 'system'
  message: string
  metadata?: Record<string, unknown>
}
```

### 18.2 日志接口

```typescript
class Logger {
  private store: LogStore
  private level: LogLevel
  
  debug(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
  error(message: string, error?: Error, metadata?: Record<string, unknown>): void
}
```

### 18.3 日志聚合

```typescript
class LogAggregator {
  private logs: LogEntry[]
  private maxSize: number
  
  add(entry: LogEntry): void {
    this.logs.push(entry)
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize)
    }
  }
  
  query(filter: LogFilter): LogEntry[] {
    return this.logs.filter(entry => {
      if (filter.level && entry.level < filter.level) return false
      if (filter.source && entry.source !== filter.source) return false
      if (filter.startTime && entry.timestamp < filter.startTime) return false
      if (filter.endTime && entry.timestamp > filter.endTime) return false
      return true
    })
  }
}
```

---

## 19. 遥测与性能分析

### 19.1 遥测事件定义

```typescript
type TelemetryEventName =
  | 'cline_started'
  | 'cline_startup_telemetry'
  | 'cline_task_submitted'
  | 'cline_task_started'
  | 'cline_task_completed'
  | 'cline_task_failed'
  | 'cline_agent_spawned'
  | 'cline_agent_terminated'
  | 'cline_query_error'
  | 'cline_auto_compact_succeeded'
  | 'cline_auto_compact_failed'
  | 'cline_model_fallback_triggered'
  | 'cline_streaming_tool_execution_used'
  | 'cline_token_budget_completed'
  | 'cline_exit'

interface TelemetryEvent {
  name: TelemetryEventName
  timestamp: Date
  properties: Record<string, unknown>
}
```

### 19.2 性能检查点

```typescript
const STARTUP_CHECKPOINTS: Record<string, number> = {
  cli_entry: 0,
  imports_loaded: 0,
  setup_start: 0,
  setup_end: 0,
  ui_render_start: 0,
  ui_render_end: 0,
}

function recordCheckpoint(name: string): void {
  STARTUP_CHECKPOINTS[name] = Date.now()
}

function getStartupMetrics(): StartupMetrics {
  return {
    totalStartupTime: STARTUP_CHECKPOINTS.ui_render_end - STARTUP_CHECKPOINTS.cli_entry,
    importTime: STARTUP_CHECKPOINTS.imports_loaded - STARTUP_CHECKPOINTS.cli_entry,
    setupTime: STARTUP_CHECKPOINTS.setup_end - STARTUP_CHECKPOINTS.setup_start,
    renderTime: STARTUP_CHECKPOINTS.ui_render_end - STARTUP_CHECKPOINTS.ui_render_start,
  }
}
```

### 19.3 指标收集

```typescript
interface Metrics {
  tasksSubmitted: Counter
  tasksCompleted: Counter
  tasksFailed: Counter
  taskDuration: Histogram
  
  agentsActive: Gauge
  agentsIdle: Gauge
  agentUtilization: Gauge
  
  tokensUsed: Counter
  tokensByModel: Counter
  
  totalCost: Counter
  costByModel: Counter
  
  queueLength: Gauge
  queueWaitTime: Histogram
}

class MetricsCollector {
  private metrics: Metrics
  private exporters: MetricsExporter[]
  
  recordTaskStart(taskId: TaskId): void
  recordTaskComplete(taskId: TaskId, duration: number): void
  recordTokenUsage(model: string, tokens: number): void
  recordCost(model: string, cost: number): void
  
  export(): Promise<void>
}
```

---

# 第八部分：扩展机制

## 20. Hook 系统

### 20.1 Hook 类型

```typescript
type HookType = 
  | 'PreToolUse'     // 工具执行前
  | 'PostToolUse'    // 工具执行后
  | 'Stop'           // 查询终止时
  | 'Notification'   // 通知发送时
  | 'PreCommit'      // Git 提交前

interface HookConfig {
  type: HookType
  command: string
  timeout?: number
  matchers?: string[]
}
```

### 20.2 Hook 执行

```typescript
interface HookContext {
  tool_name?: string
  tool_input?: unknown
  tool_result?: unknown
  message?: string
  cwd: string
}

interface HookResult {
  proceed: boolean
  modifiedInput?: unknown
  modifiedResult?: unknown
  message?: string
}

async function executeHook(
  hook: HookConfig,
  context: HookContext
): Promise<HookResult> {
  try {
    const result = await execWithTimeout(hook.command, {
      env: {
        ...process.env,
        HOOK_TYPE: hook.type,
        HOOK_CONTEXT: JSON.stringify(context),
      },
      timeout: hook.timeout ?? 60000,
      cwd: context.cwd,
    })
    
    if (result.stdout) {
      const parsed = JSON.parse(result.stdout)
      return {
        proceed: parsed.proceed ?? true,
        modifiedInput: parsed.input,
        modifiedResult: parsed.result,
        message: parsed.message,
      }
    }
    
    return { proceed: result.exitCode === 0 }
  } catch (error) {
    console.error(`Hook execution failed: ${error}`)
    return { proceed: true }
  }
}
```

### 20.3 Hook 集成点

```typescript
async function executeToolWithHooks(tool: Tool, input: unknown, context: AgentContext) {
  const preHooks = getHooks('PreToolUse', tool.name)
  for (const hook of preHooks) {
    const result = await executeHook(hook, {
      tool_name: tool.name,
      tool_input: input,
      cwd: context.cwd,
    })
    
    if (!result.proceed) {
      return { blocked: true, reason: result.message }
    }
    
    if (result.modifiedInput) {
      input = result.modifiedInput
    }
  }
  
  let toolResult = await tool.execute(input, context)
  
  const postHooks = getHooks('PostToolUse', tool.name)
  for (const hook of postHooks) {
    const result = await executeHook(hook, {
      tool_name: tool.name,
      tool_input: input,
      tool_result: toolResult,
      cwd: context.cwd,
    })
    
    if (result.modifiedResult) {
      toolResult = result.modifiedResult
    }
  }
  
  return toolResult
}
```

---

## 21. MCP 集成

### 21.1 MCP 服务器接口

```typescript
interface MCPServer {
  name: string
  tools: Tool[]
  resources: Resource[]
}

class MCPManager {
  private servers: Map<string, MCPServer>
  
  async connect(config: MCPConfig): Promise<MCPServer>
  async disconnect(name: string): Promise<void>
  
  getTools(): Tool[]
  getResources(): Resource[]
}
```

### 21.2 MCP 工具集成

```typescript
async function loadMCPTools(config: MCPConfig[]): Promise<Map<string, Tool>> {
  const tools = new Map<string, Tool>()
  
  for (const serverConfig of config) {
    try {
      const server = await mcpManager.connect(serverConfig)
      for (const tool of server.tools) {
        tools.set(tool.name, tool)
      }
    } catch (error) {
      console.warn(`Failed to connect to MCP server ${serverConfig.name}: ${error}`)
    }
  }
  
  return tools
}
```

### 21.3 MCP 依赖声明

```typescript
interface AgentDefinition {
  requiredMcpServers?: string[]
}

async function waitForMcpServers(
  servers: string[],
  options: { timeout: number }
): Promise<void> {
  const deadline = Date.now() + options.timeout
  
  for (const serverName of servers) {
    while (!mcpManager.isConnected(serverName)) {
      if (Date.now() > deadline) {
        throw new Error(`Timeout waiting for MCP server: ${serverName}`)
      }
      await sleep(100)
    }
  }
}
```

---

## 22. 插件系统

### 22.1 插件接口

```typescript
interface Plugin {
  name: string
  version: string
  
  onLoad?(): Promise<void>
  onUnload?(): Promise<void>
  
  tools?: Tool[]
  commands?: Command[]
  strategies?: LoadBalanceStrategy[]
  exporters?: MetricsExporter[]
}
```

### 22.2 插件管理器

```typescript
class PluginManager {
  private plugins: Map<string, Plugin>
  
  async load(plugin: Plugin): Promise<void> {
    await plugin.onLoad?.()
    this.plugins.set(plugin.name, plugin)
  }
  
  async unload(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (plugin) {
      await plugin.onUnload?.()
      this.plugins.delete(name)
    }
  }
  
  getTools(): Tool[] {
    return [...this.plugins.values()].flatMap(p => p.tools ?? [])
  }
  
  getCommands(): Command[] {
    return [...this.plugins.values()].flatMap(p => p.commands ?? [])
  }
}
```

---

# 第九部分：实施计划

## 23. 技术选型

### 23.1 核心技术栈

| 领域 | 技术选择 | 理由 |
|------|----------|------|
| 语言 | TypeScript | 类型安全、与 Claude Code 一致 |
| UI 框架 | React | 组件化、声明式、生态丰富 |
| 终端 UI | Ink (可选) | 如需终端界面，与 Claude Code 一致 |
| 状态管理 | 自定义 Store | 轻量、可控、与 Claude Code 一致 |
| API 客户端 | Anthropic SDK | 官方支持、类型完整 |
| 验证 | Zod | 运行时类型验证、与 Claude Code 一致 |
| 日志 | Pino / Winston | 结构化日志、性能好 |
| 指标 | Prometheus client | 标准化、可扩展 |

---

## 24. 项目结构

```
cline/
├── src/
│   ├── scheduler/              # 调度引擎（§6）
│   │   ├── Scheduler.ts        # 调度器核心
│   │   ├── TaskQueue.ts        # 任务队列 + 依赖图
│   │   ├── AgentPool.ts        # Agent 实例池
│   │   ├── LoadBalancer.ts     # 负载均衡策略接口
│   │   ├── Coordinator.ts      # 多 Agent 协调器（§4.2）
│   │   └── strategies/         # 调度策略实现
│   │       ├── PriorityStrategy.ts
│   │       ├── DependencyStrategy.ts
│   │       └── FairShareStrategy.ts
│   │
│   ├── agent/                  # Agent 实例层（§9）
│   │   ├── AgentInstance.ts    # Agent 实例封装
│   │   ├── QueryEngine.ts      # 查询引擎 + AgentLoop（§4.1）
│   │   ├── StreamingToolExecutor.ts  # 流式工具执行器（§4.1.1）
│   │   ├── ContextManager.ts   # 上下文管理
│   │   ├── CompactService.ts   # 五层压缩管道（§16）
│   │   └── SubAgentRunner.ts   # 子 Agent 调度（§12）
│   │
│   ├── tools/                  # 工具系统（§10）
│   │   ├── Tool.ts             # 工具接口定义
│   │   ├── ToolRegistry.ts     # 工具注册表
│   │   └── implementations/    # 内置工具实现
│   │       ├── ReadTool.ts
│   │       ├── WriteTool.ts
│   │       ├── EditTool.ts
│   │       ├── GlobTool.ts
│   │       ├── GrepTool.ts
│   │       ├── BashTool.ts     # 含安全链（§14）
│   │       ├── WebFetchTool.ts
│   │       ├── WebSearchTool.ts
│   │       ├── AskUserQuestionTool.ts
│   │       ├── EnterPlanModeTool.ts  # Plan Mode（§11）
│   │       └── ExitPlanModeTool.ts
│   │
│   ├── backend/                # Backend 抽象层（§7）
│   │   ├── AgentBackend.ts     # Backend 接口
│   │   ├── InProcessBackend.ts
│   │   ├── TmuxBackend.ts
│   │   ├── DockerBackend.ts
│   │   └── BackendSelector.ts
│   │
│   ├── permissions/            # 权限系统（§13）
│   │   ├── PermissionSystem.ts # 权限中间件
│   │   ├── RuleEngine.ts       # 规则引擎
│   │   ├── PermissionMode.ts   # 模式定义
│   │   ├── BashClassifier.ts   # Bash 命令分类器（§14.3）
│   │   └── BashParser.ts       # AST 安全解析（§14.2）
│   │
│   ├── sandbox/                # 沙箱隔离（§15）
│   │   ├── Sandbox.ts
│   │   └── SandboxRuntime.ts
│   │
│   ├── hooks/                  # Hook 系统（§20）
│   │   ├── HookSystem.ts
│   │   └── HookExecutor.ts
│   │
│   ├── mcp/                    # MCP 集成（§21）
│   │   ├── MCPManager.ts
│   │   └── MCPServer.ts
│   │
│   ├── plugins/                # 插件系统（§22）
│   │   └── PluginManager.ts
│   │
│   ├── infrastructure/         # 基础设施
│   │   ├── state/              # 状态管理（§5）
│   │   │   ├── Store.ts        # 响应式 Store
│   │   │   └── AppState.ts     # 全局状态定义
│   │   ├── logging/            # 日志系统（§18）
│   │   │   ├── Logger.ts
│   │   │   ├── LogStore.ts
│   │   │   └── LogAggregator.ts
│   │   ├── metrics/            # 指标与遥测（§19）
│   │   │   ├── MetricsCollector.ts
│   │   │   ├── CostTracker.ts
│   │   │   └── TelemetryClient.ts
│   │   ├── monitoring/         # 监控系统（§17）
│   │   │   ├── AgentMonitor.ts
│   │   │   ├── AlertManager.ts
│   │   │   └── EventEmitter.ts
│   │   └── errors/             # 错误处理（§8）
│   │       ├── CircuitBreaker.ts
│   │       └── ErrorClassifier.ts
│   │
│   └── ui/                     # 监控 UI 层（§3.1）
│       ├── Dashboard/
│       ├── TaskView/
│       ├── AgentMonitor/
│       ├── LogViewer/
│       └── Settings/
│
├── tests/
├── docs/
│   └── architecture.md         # 本文档
└── package.json
```

---

## 25. 实施路线图

### Phase 1: 核心框架 (MVP)

- [ ] 基础项目结构
- [ ] 响应式状态管理
- [ ] 单 Agent 实例
- [ ] 基础工具系统
- [ ] 简单任务队列

### Phase 2: 调度能力

- [ ] 多 Agent 池管理
- [ ] 任务优先级队列
- [ ] 负载均衡策略
- [ ] 任务依赖管理

### Phase 3: 安全与权限

- [ ] 权限模型实现
- [ ] 沙箱隔离
- [ ] Bash 安全链
- [ ] Hook 系统

### Phase 4: 可观测性

- [ ] 日志系统
- [ ] 指标收集
- [ ] 监控 UI
- [ ] 告警系统

### Phase 5: 扩展性

- [ ] 插件系统
- [ ] MCP 集成
- [ ] API 接口
- [ ] Backend 抽象层

---

## 26. 架构决策记录（ADR）

### ADR-001: 选择 AsyncGenerator 作为核心流式原语

| 项目 | 内容 |
|------|------|
| **状态** | 已采纳 |
| **背景** | Agent 循环需要同时处理 LLM 流式响应、工具执行结果和用户中断 |
| **决策** | 使用 `AsyncGenerator` 而非回调、Promise 或 EventEmitter |
| **理由** | 1) 天然支持 pull-based 背压控制；2) 循环状态可通过闭包保持；3) `for await...of` 语法清晰；4) 与 Claude Code 源码一致 |
| **替代方案** | EventEmitter（推模式，无背压）、Observable（需引入 RxJS）、回调（回调地狱） |

### ADR-002: Backend 抽象层支持多种执行环境

| 项目 | 内容 |
|------|------|
| **状态** | 已采纳 |
| **背景** | 需要调度多个 Claude Code 实例，不同环境有不同的隔离需求 |
| **决策** | 设计 `AgentBackend` 抽象接口，支持 InProcess / Tmux / Docker 三种实现 |
| **理由** | 1) 开发阶段用 InProcess 快速迭代；2) 生产环境用 Tmux 获得进程级隔离；3) 安全要求高的场景用 Docker 获得最强隔离；4) 自动检测可用性，用户无需关心底层实现 |
| **替代方案** | 仅用 Tmux（开发体验差）、仅用 InProcess（无隔离）、仅用 Docker（启动慢） |

### ADR-003: 五层渐进式上下文压缩

| 项目 | 内容 |
|------|------|
| **状态** | 已采纳 |
| **背景** | LLM 有 200K token 上下文窗口限制，长对话会超出限制 |
| **决策** | 采用五层渐进式压缩管道：工具结果预算 → Snip → Microcompact → Context Collapse → AutoCompact |
| **理由** | 1) 从轻到重，优先使用低成本方案；2) 每层独立，可单独测试和调优；3) 熔断保护防止级联失败；4) 与 Claude Code 源码一致，经过生产验证 |
| **替代方案** | 单层压缩（信息损失大）、固定窗口滑动（无法保留关键上下文） |

### ADR-004: 权限系统通过模式切换而非工具黑名单

| 项目 | 内容 |
|------|------|
| **状态** | 已采纳 |
| **背景** | 需要在灵活性和安全性之间取得平衡 |
| **决策** | 采用四种权限模式（default/plan/auto/bypass），通过模式切换控制工具可用性 |
| **理由** | 1) Plan Mode 强制只读，防止未充分理解就执行写入；2) Auto 模式用 AI 分类器减少用户打扰；3) 模式切换比逐个工具配置更直观；4) 与 Claude Code 源码一致 |
| **替代方案** | 纯黑名单（不够灵活）、纯白名单（配置繁琐）、无权限控制（不安全） |

### ADR-005: 选择 TypeScript + React 技术栈

| 项目 | 内容 |
|------|------|
| **状态** | 已采纳 |
| **背景** | 需要选择项目的技术栈 |
| **决策** | TypeScript 作为核心语言，React 作为 UI 框架 |
| **理由** | 1) 与 Claude Code 技术栈一致，便于参考和复用模式；2) TypeScript 类型系统保障复杂架构的可维护性；3) React 生态丰富，Ink 可选支持终端 UI；4) Zod 运行时验证与 TS 类型系统互补 |
| **替代方案** | Python（动态类型，大型项目难维护）、Go（UI 生态弱）、Rust（开发效率低） |

---

## 参考资料

- Claude Code 源码分析 (reference/claude-code-source-analysis)
- Anthropic API 文档
- Model Context Protocol 规范

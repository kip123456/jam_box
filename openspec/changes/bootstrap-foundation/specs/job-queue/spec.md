## Purpose

提供轻量消息队列基础设施，用于处理后端长耗时异步任务（Phase 4 AI 智能编曲、Phase 7 音频导出），解耦 API 接口与耗时操作，让前端提交任务后立即获得响应，通过轮询或 Socket.IO 接收完成通知。

## ADDED Requirements

### Requirement: 任务持久化存储
后端 MUST 在 SQLite 数据库中提供 `job_queue` 表，持久化所有异步任务的生命周期数据。

#### Scenario: 新任务入库
- **WHEN** API 层提交一个新的异步任务
- **THEN** `job_queue` 表插入一条新记录，状态为 `pending`
- **AND** 返回唯一的 `job_id` 供前端查询

#### Scenario: 服务重启后任务恢复
- **WHEN** 后端服务重启（无论原因）
- **AND** 数据库中存在 `pending` 或 `running` 状态的任务
- **THEN** worker 进程在启动时自动加载这些未完成任务，继续处理

### Requirement: Worker 进程异步执行
后端 MUST 有独立的 worker 进程（可与主 API 进程同进程 fork 或独立运行），周期性轮询 `job_queue` 表并执行 `pending` 状态的任务。

#### Scenario: Worker 轮询并执行任务
- **WHEN** worker 检测到 `pending` 状态的任务
- **THEN** 该任务状态更新为 `running`
- **AND** 调用已注册的对应类型处理器执行任务逻辑
- **AND** 执行成功后更新为 `success` 并写入结果
- **AND** 执行失败后更新为 `failed` 并记录错误信息

#### Scenario: 多任务并发控制
- **WHEN** 同时有多个 `pending` 任务
- **THEN** worker 按 FIFO 顺序依次执行（MVP 单 worker 串行）
- **AND** 单个任务执行超时后标记为失败，不阻塞后续任务

### Requirement: 任务提交接口
后端 MUST 提供一个 API 端点供业务代码提交异步任务，返回任务唯一标识。

#### Scenario: 提交 AI 编曲任务
- **WHEN** 业务代码（Phase 4 AI 模块）提交 `type: "ai-compose"` 类型的任务，payload 包含自然语言指令和轨道上下文
- **THEN** 接口立即返回 `{ code: 0, msg: "ok", data: { job_id: "xxx" } }`
- **AND** 不等待 AI 执行完成

### Requirement: 任务状态查询接口
后端 MUST 提供一个 API 端点供前端按 `job_id` 查询任务状态、进度和结果。

#### Scenario: 查询 pending 任务
- **WHEN** 前端查询一个 `pending` 状态的任务
- **THEN** 返回 `{ code: 0, msg: "ok", data: { status: "pending", progress: 0, result: null, error: null } }`

#### Scenario: 查询 success 任务
- **WHEN** 前端查询一个 `success` 状态的任务
- **THEN** 返回 `{ code: 0, msg: "ok", data: { status: "success", progress: 100, result: <任务结果>, error: null } }`

#### Scenario: 查询 failed 任务
- **WHEN** 前端查询一个 `failed` 状态的任务
- **THEN** 返回 `{ code: 0, msg: "ok", data: { status: "failed", progress: <失败前进度>, result: null, error: <错误信息> } }`

### Requirement: 任务类型注册机制
后端 MUST 提供任务处理器注册机制，允许不同 Phase 注册自己的任务类型及对应处理函数。

#### Scenario: 注册新任务类型
- **WHEN** Phase 4 注册 `type: "ai-compose"` 的处理器
- **THEN** worker 在执行到该类型任务时调用 Phase 4 注册的处理函数
- **AND** 未注册类型的任务被标记为 `failed` 并记录错误

### Requirement: 失败重试机制
后端 MUST 提供任务执行失败后的重试能力。

#### Scenario: 任务自动重试
- **WHEN** 任务执行失败（进程异常或处理器抛错）
- **THEN** 该任务最多自动重试 3 次
- **AND** 每次重试之间间隔递增（如 1s、2s、4s）
- **AND** 超过最大重试次数后标记为最终 `failed`
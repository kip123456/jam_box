# backend-foundation Specification

## Purpose

为后续 Phase 1-7 的所有业务功能提供可运行、可扩展的后端基础设施——数据库层（Prisma + SQLite）、统一 API 响应格式、全局错误处理、安全中间件和输入校验工具库，确保后续功能开发有统一的架构模式。

## Requirements

### Requirement: Prisma ORM 与 SQLite 初始化
后端 MUST 配置 Prisma ORM，使用 SQLite 作为持久化数据库，Prisma schema 文件位于 `backend/prisma/schema.prisma`。

#### Scenario: Prisma schema 存在
- **WHEN** 用户检查 backend 目录结构
- **THEN** 存在 `backend/prisma/schema.prisma` 文件
- **AND** 存在 `backend/prisma/migrations/` 目录（初始迁移）
- **AND** `backend/package.json` 包含 `@prisma/client` 和 `prisma` 依赖

#### Scenario: 数据库可迁移
- **WHEN** 用户在 backend 目录执行 `npx prisma migrate dev --name init`
- **THEN** 数据库迁移成功应用，SQLite 数据库文件创建在 `.env` 配置的路径下

### Requirement: 服务启动时数据库可用
后端服务启动时 MUST 尝试连接 SQLite 数据库，连接失败时输出明确错误并终止启动。

#### Scenario: 数据库连接成功
- **WHEN** 后端服务启动
- **THEN** Prisma 客户端成功连接 SQLite
- **AND** 日志输出包含数据库连接成功标识（不含敏感配置）

#### Scenario: 数据库文件不存在
- **WHEN** SQLite 数据库文件尚未创建（首次运行）
- **THEN** Prisma 自动创建数据库文件和所有表结构
- **AND** 服务正常启动

### Requirement: 统一 API 响应格式
所有后端 API 端点 MUST 返回统一格式的 JSON 响应：`{ code: number, msg: string, data: T }`。禁止返回裸数据或裸错误消息。

#### Scenario: 成功响应格式
- **WHEN** 一个 API 端点处理请求成功
- **THEN** 返回 `{ code: 0, msg: "ok", data: <业务数据> }`

#### Scenario: 错误响应格式
- **WHEN** 一个 API 端点处理请求失败
- **THEN** 返回 `{ code: <非零业务错误码>, msg: <人类可读错误描述>, data: null }`
- **AND** HTTP 状态码与业务错误码对应（如 400、401、403、404、500）

### Requirement: 全局错误处理中间件
后端 MUST 配置全局错误处理中间件，业务代码只抛错误对象，由中间件统一映射到业务错误码和消息。禁止在业务代码里拼装错误响应。

#### Scenario: 业务代码抛错后中间件处理
- **WHEN** 业务代码 `throw` 一个 Error 对象（如 zod 校验失败、业务逻辑校验失败）
- **THEN** 全局错误中间件捕获该错误
- **AND** 映射为统一格式的错误响应返回给客户端
- **AND** 错误信息同时记录到日志

#### Scenario: 未捕获异常
- **WHEN** 发生未预期的异常（如数据库连接丢失、进程异常）
- **THEN** 全局错误中间件返回通用 500 错误响应
- **AND** 日志中记录完整错误堆栈（仅服务端可见，不返回给客户端）

### Requirement: 安全中间件
后端 MUST 配置 CORS（允许前端跨域）、Helmet（安全响应头）、dotenv（环境变量加载）三个中间件。

#### Scenario: CORS 允许前端跨域
- **WHEN** 前端（5173 端口）向后端（3000 端口）发起请求
- **THEN** 请求成功，响应中包含正确的 CORS 头
- **AND** 非允许来源的跨域请求被拒绝

#### Scenario: Helmet 安全头
- **WHEN** 后端返回任何 HTTP 响应
- **THEN** 响应中包含 Helmet 设置的安全头（X-Content-Type-Options、X-Frame-Options 等）

#### Scenario: 环境变量加载
- **WHEN** 后端服务启动
- **THEN** dotenv 成功加载根目录 `.env` 文件
- **AND** 环境变量可通过 `process.env` 访问
- **AND** 敏感配置（密码、API Key）仅从环境变量读取，不硬编码在代码中

### Requirement: zod 输入校验
所有后端 API 端点的请求输入 MUST 经过 zod schema 校验，校验失败返回 `code: 400` 的错误响应。

#### Scenario: 校验成功
- **WHEN** 请求参数符合 zod schema
- **THEN** 请求继续传递到业务处理逻辑

#### Scenario: 校验失败
- **WHEN** 请求参数不符合 zod schema（如字段缺失、类型错误、长度超限）
- **THEN** 全局错误中间件捕获 zod ValidationError
- **AND** 返回 `{ code: 400, msg: <zod 生成的人类可读描述>, data: null }`

### Requirement: 日志输出到 stdout/stderr
后端所有日志 MUST 输出到 stdout 或 stderr，禁止在容器内写日志文件。

#### Scenario: 开发模式日志
- **WHEN** 后端以 dev 模式启动
- **THEN** 日志输出到终端 stdout
- **AND** 包含请求级别信息（请求路径、状态码、耗时）

#### Scenario: Docker 环境日志
- **WHEN** 后端运行在 Docker 容器中
- **THEN** 所有日志可通过 `docker compose logs` 查看
- **AND** 不创建任何日志文件

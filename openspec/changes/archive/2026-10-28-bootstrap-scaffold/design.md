## Context

See proposal.md - Why. 仓库当前只有规划文档（README.md、AGENTS.md、GOAL.md），没有任何可执行的代码文件。README 定义了两条启动路径但都无法运行。当前终端环境为 Windows 下的 Git Bash，shell 脚本需要兼容 bash 环境。deploy.md 规则要求：多阶段构建、非 root 用户、健康检查、stdout 日志、volume 持久化预留、.dockerignore。backend.md 规则要求：API 版本化（/api/v1/...）、统一响应格式（{ code, msg, data }）。

## Goals / Non-Goals

**Goals:**
- 让 `docker compose up --build` 成功执行并启动两个服务
- 让 `./setup.sh` + `./start.sh` 成功执行并启动两个服务
- 满足 deploy.md 和 backend.md 中的所有结构性规则（多阶段构建、非 root、健康检查、API 规范等）
- 保持骨架足够小，不引入任何业务功能

**Non-Goals:**
- 不实现任何业务功能（用户、房间、AI、协同编辑等）
- 不配置数据库、缓存等中间服务（本次变更中 docker-compose 只编排 backend 和 frontend）
- 不实现生产级别的部署配置（如 k8s、CI/CD）
- 不引入测试框架、lint 工具等额外质量保障工具链（TypeScript 已包含在内）

## Decisions

### 后端技术栈：Node.js + Express + TypeScript

**选择**: Node.js ≥ 20 + Express 4 + TypeScript 5
**替代方案**: Fastify、Koa、NestJS
**理由**: Express 是 Node.js 生态最成熟的 Web 框架，无额外运行时开销，适合作为最小骨架。项目要求 Node.js ≥ 20，Express 完全兼容。Fastify 性能更好但生态稍小；NestJS 过重不适合 hello world。TypeScript 提供类型安全，后端作为 API 层类型边界清晰，收益明显。

### 前端技术栈：Vite + React + TypeScript

**选择**: Vite + React + TypeScript 5
**替代方案**: Next.js、纯 HTML/JS、Vue
**理由**: Vite 启动快、配置简单，React 是主流选择。README 声明了 Node.js 技术栈，React 与之匹配。TypeScript 在组件 props、API 调用等场景提供类型约束，减少运行时错误。不需要 Next.js 的 SSR 能力。

### TypeScript 编译策略

**选择**: 后端开发用 ts-node-dev 直接运行 .ts 文件，生产构建用 tsc 编译到 dist/ 再 node dist/；前端由 Vite 内置 esbuild 处理 .tsx 编译，开发和生产统一走 Vite
**替代方案**: 后端全量用 tsc + tsc-node，前端用独立 tsc 检查
**理由**: ts-node-dev 热重载体验好，适合开发阶段；生产用纯 tsc 编译后用 node 跑，镜像里不需要 TypeScript 运行时，体积更小。前端 Vite 已内置 TypeScript 支持，不需要额外工具。tsc 严格模式在 tsconfig.json 中开启。

### start.sh 使用 concurrently 或手动后台进程

**选择**: 使用 bash 后台进程（`&`）+ trap 清理
**替代方案**: concurrently、npm-run-all
**理由**: 避免在 setup.sh 之外增加额外依赖。纯 bash 实现在 Git Bash 下可用，Ctrl+C 通过 trap 传播到子进程。后续如果需要更复杂的并行管理再引入 concurrently。

### Docker Compose 只编排 backend + frontend

**选择**: docker-compose.yml 只定义两个服务，不引入 db/redis
**替代方案**: 预先搭建完整的中间件栈
**理由**: Non-Goals 明确排除了中间服务。deploy 规则要求"有状态服务必须用 volume 持久化"，但当前没有有状态服务，所以不声明 volumes。后续引入 db 时再加。

### 后端健康检查实现

**选择**: `/health` 返回 `{ code: 0, msg: "ok", data: { status: "UP" } }`
**替代方案**: 纯文本 "OK"
**理由**: 遵循 backend.md 规则的统一响应格式 `{ code, msg, data }`。虽然健康检查通常返回简单文本，但保持格式一致性有利于后续扩展。

### 前端 Dockerfile 使用 nginx 托管静态文件

**选择**: 多阶段构建，第二阶段用 nginx:alpine 托管 dist
**替代方案**: Node 生产服务器 serve
**理由**: nginx 性能更好、镜像更小、是前端生产部署的标准做法。deploy 规则要求最终镜像不包含源码，nginx 方案天然满足。

## Risks / Trade-offs

**[start.sh 在 Windows Git Bash 下的兼容性]** → 使用 bash 后台进程 + trap 是 Git Bash 支持的语法，setup.sh 和 start.sh 开头加 `#!/usr/bin/env bash` 确保正确解析。如果用户用 cmd.exe 执行会失败，但 README 已声明这是 bash 命令。

**[Vite dev server host 配置]** → Vite 默认只监听 localhost，Docker 容器内需要 `--host 0.0.0.0`。在 start.sh 和 Dockerfile 的 CMD 中都需要显式指定 host。

**[最小骨架后续可能需要重构]** → hello world 的目录结构（backend/src/、frontend/src/）可能与未来的业务代码组织不一致。但当前阶段先跑通启动路径更重要，后续可以调整。

**[没有数据库所以 docker-compose 没有 volumes]** → deploy 规则要求有状态服务声明 volumes，但当前没有有状态服务。这不是违规，是当前阶段的合理状态。
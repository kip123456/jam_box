## Why

项目经过 bootstrap-scaffold 变更后，后端只有一个 Express 健康检查骨架，**完全缺失前端工程、构建脚本、数据库层、中间件栈和消息队列**。后续 Phase 1-7 的所有功能（用户、房间、编曲、AI、协同）都依赖这些基础设施。现在补全骨架，为后续每个 Phase 的功能开发提供可运行、可验证、可部署的基础。

## What Changes

- **前端工程从零创建**：Vite + React 18 + TypeScript 脚手架，配置 Tailwind CSS + shadcn/ui，搭建 Zustand store 模板、Axios 实例、React Router
- **后端数据库层**：引入 Prisma ORM + SQLite，初始化 `prisma/schema.prisma`，建立 `job_queue` 表（供 Phase 4 AI 长耗时任务使用）
- **后端中间件栈**：统一响应格式中间件（`{ code, msg, data }`）、全局错误处理中间件、CORS、Helmet 安全头、dotenv 环境变量加载
- **后端基础工具**：bcryptjs（密码加密预留）、jsonwebtoken（JWT 预留）、输入校验（zod）
- **轻量消息队列**：基于 SQLite 的 `job_queue` 表 + 独立 worker 进程，提供任务提交/状态查询接口，Phase 4 AI 和 Phase 7 导出任务直接复用
- **构建和启动脚本**：根目录 `setup.sh`（安装前后端依赖）、`start.sh`（并行启动 dev server）
- **Docker 编排**：完整 `docker-compose.yml`（backend + frontend），frontend 多阶段 Dockerfile（node 构建 → nginx 运行），backend 补充已有 Dockerfile
- **补充 .env.example**：扩展后端端口外，加入 Prisma 数据库路径、LLM API 预留字段

## Capabilities

### New Capabilities
- `frontend-foundation`: 前端 Vite + React + TypeScript 脚手架、Tailwind CSS + shadcn/ui、Zustand/Axios/Router 基础配置
- `backend-foundation`: 后端 Prisma + SQLite 初始化、统一响应/错误中间件、CORS/Helmet/dotenv/zod 基础中间件和工具库
- `job-queue`: 轻量消息队列基础设施（SQLite 表 + worker 进程 + 任务接口封装）

### Modified Capabilities
- `project-scaffold`: 补全并扩展骨架定义——新增 frontend 完整脚手架要求、setup.sh/start.sh 实际实现要求、docker-compose.yml 完整编排、frontend Dockerfile、.env.example 扩展变量

## Impact

- **新增目录**：`frontend/`（完整 Vite 项目）、`backend/prisma/`（Prisma schema）
- **新增依赖**：后端新增 `@prisma/client`、`prisma`、`bcryptjs`、`jsonwebtoken`、`cors`、`helmet`、`dotenv`、`zod`；前端新增 `react-router-dom`、`zustand`、`axios`、`tailwindcss`、`shadcn/ui` 等
- **新增进程**：独立 job queue worker（由 backend 启动时 fork 或独立运行）
- **新增文件**：根目录 `setup.sh`、`start.sh`、`docker-compose.yml`；frontend Dockerfile
- **环境变量变更**：`.env.example` 需扩展
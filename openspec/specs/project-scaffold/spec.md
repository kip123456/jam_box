# project-scaffold Specification

## Purpose

定义项目骨架的行为契约——让 README 中声明的两条部署路径（Docker 和本地开发）都能成功执行，为后续功能开发提供可运行的基础设施。

## Requirements

### Requirement: 目录结构完整性
仓库 MUST 包含 `backend/` 和 `frontend/` 两个一级目录，每个目录都有自己独立的 `package.json`，且 frontend 是完整的 Vite + React + TypeScript 脚手架。

#### Scenario: 后端目录存在
- **WHEN** 用户检查仓库根目录
- **THEN** 存在 `backend/package.json`，声明 name 为 `jam-box-backend`

#### Scenario: 前端目录存在
- **WHEN** 用户检查仓库根目录
- **THEN** 存在 `frontend/package.json`，声明 name 为 `jam-box-frontend`
- **AND** 存在 `frontend/vite.config.ts`、`frontend/tsconfig.json`、`frontend/tsconfig.node.json`
- **AND** 存在 `frontend/index.html`、`frontend/src/main.tsx`、`frontend/src/App.tsx`
- **AND** 存在 `frontend/tailwind.config.js`、`frontend/postcss.config.js`、`frontend/.env`

#### Scenario: 前端可构建可运行
- **WHEN** 用户在 `frontend/` 目录执行 `npm run dev`
- **THEN** 开发服务器在 5173 端口成功启动，可通过 `http://localhost:5173` 访问

- **WHEN** 用户在 `frontend/` 目录执行 `npm run build`
- **THEN** 生产产物成功构建到 `dist/` 目录

### Requirement: setup.sh 安装依赖
根目录 MUST 提供可执行的 `setup.sh` 脚本，依次在 backend/ 和 frontend/ 目录下运行 `npm install`，并输出两个项目的安装结果。

#### Scenario: 首次安装依赖
- **WHEN** 用户在仓库根目录执行 `bash setup.sh`
- **THEN** backend 和 frontend 的 node_modules 目录被创建
- **AND** 终端输出显示 "Installing backend dependencies..." 和 "Installing frontend dependencies..."
- **AND** 脚本执行成功（exit code 0）
- **AND** 两个子项目的依赖均安装完成

### Requirement: start.sh 并行启动开发服务
根目录 MUST 提供可执行的 `start.sh` 脚本，使用后台进程并行启动 backend 和 frontend 的 dev server，终端输出用前缀区分来源，用户通过 Ctrl+C 可同时终止两个进程。

#### Scenario: 启动开发服务
- **WHEN** 用户在仓库根目录执行 `bash start.sh`（依赖已通过 setup.sh 安装）
- **THEN** 后端服务在 3000 端口启动，前端服务在 5173 端口启动
- **AND** 终端日志中 backend 输出以 `[backend]` 前缀标记，frontend 输出以 `[frontend]` 前缀标记
- **AND** 用户按 Ctrl+C 时，两个进程（含后台子进程）均被终止

### Requirement: backend 健康检查端点
后端 MUST 提供 `/health` HTTP 端点，返回 HTTP 200。

#### Scenario: 健康检查正常
- **WHEN** 向 `http://localhost:3000/health` 发送 GET 请求
- **THEN** 返回 HTTP 200，响应体包含健康状态标识

### Requirement: backend hello 端点
后端 MUST 提供 `/api/v1/hello` HTTP 端点，返回统一格式的 JSON 响应。

#### Scenario: 调用 hello 接口
- **WHEN** 向 `http://localhost:3000/api/v1/hello` 发送 GET 请求
- **THEN** 返回 HTTP 200，响应体格式为 `{ code: 0, msg: "ok", data: ... }`

### Requirement: frontend 可访问
前端开发服务器 MUST 在 5173 端口提供可访问的页面。

#### Scenario: 浏览器访问前端
- **WHEN** 用户打开 `http://localhost:5173`
- **THEN** 页面成功加载，显示 "Hello World" 或类似内容

### Requirement: Docker Compose 编排
根目录 MUST 提供完整的 `docker-compose.yml`，定义 backend 和 frontend 两个服务，backend 挂载 SQLite 数据卷。

#### Scenario: Docker 一键启动
- **WHEN** 用户执行 `docker compose up --build`
- **THEN** backend 和 frontend 镜像成功构建并启动
- **AND** frontend 可通过 `http://localhost:5173` 访问
- **AND** 后端健康检查可通过 `http://localhost:3000/health` 访问
- **AND** backend 服务挂载名为 `jam_box_data` 的持久化存储卷用于存放 SQLite 数据库文件

### Requirement: Dockerfile 多阶段构建
backend 和 frontend 各 MUST 有独立的 Dockerfile，使用多阶段构建，最终运行时镜像不包含源码和 devDependencies。frontend 运行时使用 nginx 提供静态文件服务。

#### Scenario: backend Dockerfile 构建
- **WHEN** 用 backend/Dockerfile 构建镜像
- **THEN** 构建阶段 MUST 使用 node:20-alpine 安装依赖（含 devDependencies）并执行 `npm run build`
- **AND** 运行阶段 MUST 使用 node:20-alpine-slim，仅复制 `dist/` 和 `node_modules/`（生产依赖），镜像中不包含源码目录中的开发依赖
- **AND** 运行阶段 MUST 以非 root 用户运行

#### Scenario: frontend Dockerfile 构建
- **WHEN** 用 frontend/Dockerfile 构建镜像
- **THEN** 构建阶段 MUST 使用 node:20-alpine 安装依赖并执行 `npm run build`
- **AND** 运行阶段 MUST 使用 nginx:alpine，仅复制 `dist/` 到 nginx 的静态资源目录（`/usr/share/nginx/html`），使用 nginx 非 root 用户运行

### Requirement: Docker 健康检查
backend 容器 MUST 配置健康检查，定时访问 `/health` 端点。

#### Scenario: 容器不健康时自动重启
- **WHEN** backend 服务变得不可达
- **THEN** Docker 的健康检查检测到失败，容器自动重启

### Requirement: 日志输出到 stdout
所有容器 MUST 将日志输出到 stdout/stderr，禁止在容器内写日志文件。

#### Scenario: 日志收集
- **WHEN** 用户运行 `docker compose logs`
- **THEN** 能看到 backend 和 frontend 的运行日志

### Requirement: 根目录 .dockerignore
根目录 MUST 提供 `.dockerignore`，排除 node_modules、.git、.env、dist 等文件。

#### Scenario: .dockerignore 存在
- **WHEN** 用户检查仓库根目录
- **THEN** 存在 `.dockerignore` 文件，内容包含 node_modules、.git、.env、dist 等排除规则

### Requirement: .env.example 模板
根目录 MUST 提供 `.env.example` 文件，包含所有需要的环境变量模板。

#### Scenario: 环境变量模板
- **WHEN** 用户执行 `cp .env.example .env`
- **THEN** .env 文件创建成功，包含占位变量和注释说明

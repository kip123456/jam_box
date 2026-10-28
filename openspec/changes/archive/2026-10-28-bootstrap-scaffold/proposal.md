## Why

「合奏盒子」项目已有 README、AGENTS.md、GOAL.md 等规划文档，但代码仓库中没有任何实际代码文件或目录结构。README 中定义了两条启动路径（`docker compose up --build` 和 `./setup.sh` + `./start.sh`），但这些命令目前无法执行。现在需要先搭建一个最小可运行的骨架，让 README 中描述的所有命令路径都能跑通，为后续功能开发打下基础。

## What Changes

- 创建 `backend/` 目录：基于 Node.js + Express + TypeScript 的最小 HTTP 服务，提供 `/health` 健康检查端点和 `/api/v1/hello` 接口，监听 3000 端口
- 创建 `frontend/` 目录：基于 Vite + React + TypeScript 的最小前端应用，包含 hello world 页面，开发服务器监听 5173 端口
- 创建根目录 `setup.sh`：安装 backend 和 frontend 各自的依赖（`npm install`）
- 创建根目录 `start.sh`：并行启动 backend 和 frontend 的 dev server
- 创建根目录 `docker-compose.yml`：定义 backend、frontend 两个服务，使用 Dockerfile 构建
- 创建 backend/Dockerfile、frontend/Dockerfile：多阶段构建，最终镜像以非 root 用户运行
- 创建 `.dockerignore`、`backend/.dockerignore`、`frontend/.dockerignore`：排除不需要进入镜像的文件
- 创建 `.env.example`：占位环境变量模板
- 后端 `/health` 端点返回 200，供 Docker 健康检查使用
- 保持 deploy 规则的所有约束（多阶段构建、非 root 用户、健康检查、stdout 日志、volume 持久化预留）

## Capabilities

### New Capabilities
- `project-scaffold`: 项目骨架搭建能力——定义目录结构、启动脚本、Docker 配置，使 README 中声明的两条部署路径（Docker 和本地开发）都能成功执行

### Modified Capabilities

## Impact

- 新增文件：backend/、frontend/ 目录树，setup.sh、start.sh、docker-compose.yml、.dockerignore、.env.example
- 依赖：Node.js ≥ 20、npm ≥ 10（外部依赖，不在本次变更中安装）；TypeScript 5.x、ts-node-dev、@types/node、@types/express、@types/react、@types/react-dom（npm 安装）
- 端口：backend 3000、frontend 5173（与 README 和 AGENTS.md 声明一致）
- 无破坏性变更，仓库当前为空
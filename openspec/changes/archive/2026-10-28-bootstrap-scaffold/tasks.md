## 1. 后端骨架（TypeScript）

- [x] 1.1 创建 `backend/package.json`，声明 name=jam-box-backend、main=dist/index.js、scripts 含 `dev`（ts-node-dev src/index.ts）、`build`（tsc）、`start`（node dist/index.js）、dependencies 含 express、devDependencies 含 typescript、@types/express、@types/node、ts-node-dev（验证：文件存在且 JSON 格式合法）
- [x] 1.2 创建 `backend/tsconfig.json`，target ES2022、module commonjs、outDir dist、rootDir src、strict true、esModuleInterop true、skipLibCheck true（验证：`npx tsc --noEmit` 无报错）
- [x] 1.3 创建 `backend/src/index.ts`，实现 Express 应用：监听 PORT 环境变量（默认 3000）、提供 `/health` 返回 `{ code: 0, msg: "ok", data: { status: "UP" } }`、提供 `/api/v1/hello` 返回 `{ code: 0, msg: "ok", data: "Hello from Jam Box backend" }`，所有 handler 参数加 Request/Response 类型标注（验证：执行 `npm run dev` 后 curl 两个端点都返回预期 JSON）
- [x] 1.4 创建 `backend/.gitignore`，排除 node_modules、.env、dist（验证：文件存在且内容包含 dist）

## 2. 前端骨架（TypeScript）

- [x] 2.1 创建 `frontend/package.json`，声明 name=jam-box-frontend、scripts 含 `dev`（vite）、`build`（tsc -b && vite build）、`preview`（vite preview）、dependencies 含 react 和 react-dom、devDependencies 含 vite、@vitejs/plugin-react、typescript、@types/react、@types/react-dom（验证：文件存在且 JSON 格式合法）
- [x] 2.2 创建 `frontend/tsconfig.json`，target ES2020、module esnext、jsx react-jsx、strict true、skipLibCheck true（验证：`npx tsc --noEmit` 无报错）
- [x] 2.3 创建 `frontend/vite.config.ts`，配置 React 插件、server.port=5173、server.host="0.0.0.0"（验证：文件存在且导出 UserConfig）
- [x] 2.4 创建 `frontend/index.html`，包含 `<div id="root">` 和 main.tsx 入口脚本（验证：文件存在且含 root div）
- [x] 2.5 创建 `frontend/src/main.tsx` 和 `frontend/src/App.tsx`，main.tsx 渲染 `<App />` 到 root，App.tsx 组件渲染 "Hello World" 标题（验证：文件存在且 App.tsx 导出函数组件）
- [x] 2.6 创建 `frontend/.gitignore`，排除 node_modules、dist、.env（验证：文件存在且内容包含 dist）

## 3. Shell 启动脚本

- [x] 3.1 创建根目录 `setup.sh`：`#!/usr/bin/env bash`，在 backend/ 和 frontend/ 目录分别执行 `npm install`，打印安装进度（验证：执行 `bash setup.sh` 后两个 node_modules 目录存在，exit code 0）
- [x] 3.2 创建根目录 `start.sh`：`#!/usr/bin/env bash`，使用后台进程（`&`）并行启动 backend 的 `npm run dev`（ts-node-dev）和 frontend 的 `npm run dev`（vite），用 trap 捕获 SIGINT/SIGTERM 清理子进程，打印两个服务的地址（验证：执行 `bash start.sh` 后能同时访问 localhost:3000/health 和 localhost:5173，Ctrl+C 能终止两个进程）
- [x] 3.3 给 setup.sh 和 start.sh 添加可执行权限 `chmod +x`（验证：Git Bash 下 `ls -la` 显示 x 权限）

## 4. Docker 配置

- [x] 4.1 创建根目录 `.dockerignore`，排除 node_modules、.git、.env、dist、openspec、*.md（验证：文件存在且内容包含 node_modules 和 .git）
- [x] 4.2 创建根目录 `.env.example`，声明 `BACKEND_PORT=3000`、`FRONTEND_PORT=5173`，每个变量带注释说明用途（验证：文件存在且包含所有变量模板）
- [x] 4.3 创建 `backend/Dockerfile`：多阶段构建——第一阶段 node:20-alpine 安装所有依赖（含 dev）+ 复制源码 + 执行 `npm run build`（tsc）；第二阶段 node:20-alpine 只复制生产依赖和 dist/ 产物，创建 appuser 并用 USER 切换，暴露 3000，CMD 用 `node dist/index.js`，配置 HEALTHCHECK 访问 /health（验证：`docker build -t jam-box-backend ./backend` 成功，镜像内以非 root 用户运行）
- [x] 4.4 创建 `backend/.dockerignore`，排除 node_modules、.env、.git、dist（验证：文件存在）
- [x] 4.5 创建 `frontend/Dockerfile`：多阶段构建——第一阶段 node:20-alpine 安装依赖 + 构建（npm run build，已含 tsc -b）；第二阶段 nginx:alpine，把 dist/ 复制到 /usr/share/nginx/html，暴露 80，CMD 启动 nginx（验证：`docker build -t jam-box-frontend ./frontend` 成功）
- [x] 4.6 创建 `frontend/.dockerignore`，排除 node_modules、.env、.git、dist（验证：文件存在）
- [x] 4.7 创建根目录 `docker-compose.yml`：定义 backend 服务（build: ./backend、ports: "3000:3000"、healthcheck、restart: unless-stopped、日志到 stdout）和 frontend 服务（build: ./frontend、ports: "5173:80"、depends_on backend、restart: unless-stopped、日志到 stdout），version "3.8"（验证：`docker compose config` 输出合法 YAML，`docker compose up --build` 成功启动两个服务）

## 5. 集成验证

- [x] 5.1 本地开发路径验证：执行 `bash setup.sh` 安装依赖，然后 `bash start.sh` 启动服务，确认 curl localhost:3000/health 返回 200，浏览器访问 localhost:5173 看到 Hello World（验证：两个端点都可达，exit code 正常）
- [x] 5.2 Docker 路径验证：执行 `docker compose up --build`，等待容器启动后确认 curl localhost:3000/health 返回 200，浏览器访问 localhost:5173 看到 Hello World，`docker compose ps` 显示两个服务 healthy（验证：容器 healthy，两个端点都可达）
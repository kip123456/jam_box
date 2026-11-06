## 1. 后端依赖与 Prisma 初始化

- [x] 1.1 扩展 backend/package.json，安装 Prisma + SQLite + 安全/校验中间件：`@prisma/client`、`prisma`、`bcryptjs`、`@types/bcryptjs`、`jsonwebtoken`、`@types/jsonwebtoken`、`cors`、`@types/cors`、`helmet`、`dotenv`、`zod`；验证：backend 目录下 `npm install` 成功，node_modules 中存在以上包
- [x] 1.2 初始化 Prisma schema：在 `backend/prisma/schema.prisma` 中定义 `provider = "sqlite"`、DATABASE_URL 占位、Job model（含 id/type/payload/status/retryCount/maxRetries/result/error/startedAt/completedAt/createdAt/updatedAt 字段）和 JobStatus enum（pending/running/success/failed）；验证：`cd backend && npx prisma validate` 输出 "The Prisma schema is valid"
- [x] 1.3 执行初始迁移：`cd backend && npx prisma migrate dev --name init`；验证：生成 `backend/prisma/migrations/YYYYMMDDHHMMSS_init/` 目录，backend 目录下创建 `.env` 文件含 DATABASE_URL，backend/dev.db 文件存在（SQLite 数据库）
- [x] 1.4 创建 PrismaClient 单例：`backend/src/lib/prisma.ts` 导出单一 PrismaClient 实例（使用 `globalThis` 防止热重启重复创建连接）；验证：TypeScript 编译通过，import prisma from '@/lib/prisma'（或对应路径）在 tsconfig path alias 下能正确解析

## 2. 后端目录结构与中间件栈

- [x] 2.1 创建后端标准化目录结构：`backend/src/middleware/`、`backend/src/routes/`、`backend/src/lib/`、`backend/src/queues/`、`backend/src/zod/`、`backend/src/utils/`；验证：各目录存在且能被 TypeScript 识别
- [x] 2.2 配置 tsconfig.json 的路径别名：添加 `"@/*": ["./src/*"]`；验证：在任意文件中 `import { prisma } from '@/lib/prisma'` 无类型错误
- [x] 2.3 创建环境变量加载工具 `backend/src/utils/env.ts`：使用 zod 校验必要环境变量（BACKEND_PORT、DATABASE_URL、JWT_SECRET 预留），导出类型安全的 config 对象；验证：TypeScript 编译通过，启动时缺失必要变量输出明确错误
- [x] 2.4 配置 dotenv + Helmet + CORS 中间件：在 `backend/src/middleware/cors-helmet.ts` 中导出函数，加载 `.env` → 应用 Helmet → 应用 CORS（开发模式允许 `http://localhost:5173`）；验证：curl 请求后端时响应头包含 X-Content-Type-Options、CORS 头正确
- [x] 2.5 实现统一响应格式中间件 `backend/src/middleware/response.ts`：包装 `res.json`，业务代码传什么数据就自动包装为 `{ code: 0, msg: "ok", data: <数据> }`；验证：新路由 `res.json("hello")` 实际返回 `{"code":0,"msg":"ok","data":"hello"}`
- [x] 2.6 定义自定义错误类 `backend/src/lib/errors.ts`：`BusinessError`（含 code 字段）、`AuthError`（code 401）、`ValidationError`（code 400）；验证：TypeScript 编译通过，各错误类可独立 throw
- [x] 2.7 实现全局错误处理中间件 `backend/src/middleware/error.ts`：按顺序捕获 zod ValidationError → code 400；Prisma P2002（唯一约束）→ code 409；BusinessError → 其自身 code；其他 → code 500；服务端日志记录完整堆栈；验证：curl 触发各种错误场景时返回统一格式 `{ code, msg, data: null }`，HTTP 状态码正确
- [x] 2.8 重写 Express 入口 `backend/src/index.ts`：使用 `express.json()` body parser → 加载 cors/helmet/dotenv 中间件 → 加载 response 中间件 → 挂载 routes（目前只有 health） → 加载 error 中间件（必须在最后）；移除旧的裸健康检查路由；验证：`npm run dev` 启动后 curl `/health` 返回 `{"code":0,"msg":"ok","data":{"status":"UP"}}`

## 3. 消息队列基础设施

- [x] 3.1 实现任务处理器注册机制 `backend/src/queues/handlers.ts`：导出 `registerHandler(type, handler)` 函数（handler 签名 `(payload: Json) => Promise<Json | void>`）和内部 `handlers` Map；验证：可通过 `registerHandler('test', async (p) => p)` 注册新 handler
- [x] 3.2 实现 worker 进程 `backend/src/queues/worker.ts`：独立 TypeScript 文件，启动时查询所有 pending/running 状态任务 → 逐条原子更新 status 为 running → 调用已注册 handler → 成功写入 result → 失败检查 retryCount 递增并重置 pending（递增间隔 1s/2s/4s）或标记 failed；用 `setInterval` 每 2 秒扫描一次 pending；超时保护（单任务 120s 超时）；验证：直接运行 `npx ts-node src/queues/worker.ts` 不报错，日志输出等待任务中
- [x] 3.3 实现任务 API 逻辑 `backend/src/queues/client.ts`：导出 `submitJob(type, payload)` → 返回新 Job 记录（含自动 cuid id）；`getJob(jobId)` → 返回 Job 记录；验证：TypeScript 编译通过，函数签名与 Zod validator 匹配
- [x] 3.4 创建任务 API 路由 `backend/src/routes/jobs.ts`：POST `/api/v1/jobs`（zod 校验 body: `{ type: z.string(), payload: z.any().optional() }`）调用 `submitJob`，GET `/api/v1/jobs/:id` 调用 `getJob`；验证：`curl -X POST http://localhost:3000/api/v1/jobs -H "Content-Type: application/json" -d '{"type":"test","payload":{"foo":"bar"}}'` 返回 `{"code":0,"msg":"ok","data":{"id":"...","status":"pending",...}}`，且 dev.db 的 Job 表有新记录
- [x] 3.5 在 Express 入口挂载 jobs 路由，启动时 fork worker 子进程：`import { fork } from 'child_process'` → `fork('./src/queues/worker.ts', ['--run'])`；验证：`npm run dev` 启动后终端出现 worker 进程日志（如 `[worker] started, waiting for jobs...`）

## 4. 前端脚手架

- [x] 4.1 用 Vite 创建 React + TS 项目：在 `jam_box` 根目录执行 `npm create vite@6 frontend -- --template react-ts`；验证：frontend/package.json 存在（name 非默认的 "jam-box-frontend"，需手动修改），frontend/src/App.tsx 和 frontend/src/main.tsx 存在，`cd frontend && npm run dev` 能启动
- [x] 4.2 安装前端依赖：`react-router-dom`、`zustand`、`axios`、`tailwindcss@3.4.14`、`postcss`、`autoprefixer`、`@types/node`；验证：frontend/node_modules 中存在以上包
- [x] 4.3 配置 Tailwind CSS：创建 `frontend/tailwind.config.js`（content 指向 `./index.html` 和 `./src/**/*.{ts,tsx}`）、创建 `frontend/postcss.config.js`、在 `frontend/src/index.css` 顶部添加 Tailwind 指令 `@tailwind base; @tailwind components; @tailwind utilities;`；验证：任意组件写 `<div className="bg-blue-500 text-white">Test</div>` 浏览器显示蓝色背景白字
- [x] 4.4 配置 shadcn/ui：在 frontend 目录执行 `npx shadcn@latest init -y -b natural`（选择默认参数）；验证：`frontend/src/components/ui/` 出现基础组件（button、input 等），`frontend/src/lib/utils.ts` 存在
- [x] 4.5 配置 React Router：创建 `frontend/src/router/index.tsx`，定义路由表（`/login` → Login 占位页，`/register` → Register 占位页，`/rooms` → Rooms 占位页，`/` → 重定向，`*` → NotFound）；在 `App.tsx` 中用 `<BrowserRouter>` 包裹 `<Routes>`；Auth Guard 逻辑简化为检查 Zustand user store 是否有 token；验证：浏览器访问 `/login` 显示"登录"文字，访问 `/` 自动跳转 `/login`
- [x] 4.6 创建 Zustand user store `frontend/src/store/user.ts`：初始状态 `{ token: null, user: null }`，导出 `useUserStore` hook；验证：组件中 `const token = useUserStore((s) => s.token)` 能正确读写状态
- [x] 4.7 配置统一 Axios 实例 `frontend/src/api/client.ts`：baseURL 从 `import.meta.env.VITE_API_BASE_URL` 读取；请求拦截器自动附加 `Authorization: Bearer <token>`（从 user store 取）；响应拦截器：code 0 自动解包到 data，非 0 抛出 Error（message 为后端 msg 字段），401 时清除 user store 并跳转 `/login`；验证：浏览器 DevTools Network 面板看到 `/api/v1/hello` 请求成功且数据正确解包
- [x] 4.8 创建前端环境变量文件：创建 `frontend/.env`（`VITE_API_BASE_URL=http://localhost:3000/api/v1`）、`frontend/.env.example`（模板）；验证：`console.log(import.meta.env.VITE_API_BASE_URL)` 输出正确值

## 5. 环境变量与 .env.example 扩展

- [x] 5.1 扩展根目录 `.env.example`：在现有 BACKEND_PORT / FRONTEND_PORT 基础上追加 DATABASE_URL（`file:./backend/dev.db`，说明 SQLite 数据库路径）、JWT_SECRET（占位，说明 Phase 1 使用）、LLM_BASE_URL / LLM_MODEL / LLM_API_KEY（占位，说明 Phase 4 使用）；验证：cp .env.example .env 后文件包含所有变量模板和中文注释
- [x] 5.2 根目录 `.env`（开发用）：复制 `.env.example` 并填入实际值（DATABASE_URL=file:./backend/dev.db，JWT_SECRET=dev-secret-change-me，LLM 三个留空或填占位）；验证：后端启动能读取所有变量

## 6. Docker Compose 与 Dockerfile 完成

- [x] 6.1 创建根目录 `docker-compose.yml`：定义 backend 服务（build: ./backend，ports ["3000:3000"]，volumes 挂载 jam_box_data 卷到 /app/prisma，environment 配置 DATABASE_URL/BACKEND_PORT，healthcheck curl /health）、frontend 服务（build: ./frontend，ports ["5173:80"]，depends_on backend）、volumes 定义 jam_box_data；验证：`docker compose config` 能输出正确的服务定义 JSON
- [x] 6.2 补全 backend/Dockerfile（多阶段）：构建阶段 node:20-alpine → COPY package*.json → npm ci（含 devDependencies）→ 复制源码 → npx prisma migrate deploy && npm run build；运行阶段 node:20-alpine-slim → 只 COPY dist/ 和 node_modules/（生产依赖，用 npm ci --omit=dev 重新装一遍或用 npm prune --omit=dev）→ 添加非 root 用户（node）→ USER node；验证：Docker 构建成功，运行时用户为 node 非 root
- [x] 6.3 创建 frontend/Dockerfile（多阶段）：构建阶段 node:20-alpine → npm ci → npm run build；运行阶段 nginx:alpine → COPY dist/ 到 /usr/share/nginx/html → COPY nginx.conf 到 /etc/nginx/conf.d/default.conf；验证：Docker 构建成功，nginx 服务启动，静态文件可访问
- [x] 6.4 创建 frontend/nginx.conf：配置 `/` → 静态文件服务，`/api/` → `proxy_pass http://backend:3000`，SSE/WebSocket header 支持（Phase 5 用）；验证：Docker 部署后浏览器能从 frontend:5173 直接调用后端 API

## 7. 构建与启动脚本

- [x] 7.1 创建根目录 `setup.sh`：先输出 "Installing backend dependencies..." → `cd backend && npm install` → 输出 "Installing frontend dependencies..." → `cd ../frontend && npm install` → 输出完成提示；验证：`bash setup.sh` 执行成功（exit 0），backend 和 frontend node_modules 都创建完成
- [x] 7.2 创建根目录 `start.sh`：后台启动 backend（`cd backend && npm run dev &` 记录 PID）→ 后台启动 frontend（`cd frontend && npm run dev &` 记录 PID）→ `wait` 等待，用 trap EXIT 信号依次 kill 两个子进程；验证：`bash start.sh` 后两个服务都启动，按 Ctrl+C 两个进程都终止

## 8. 阶段性验证

- [x] 8.1 后端 API 验证：启动后端 dev server 后，curl `/health` 返回 `{"code":0,"msg":"ok","data":{"status":"UP"}}`；curl `/api/v1/hello` 返回 `{"code":0,"msg":"ok","data":"Hello from Jam Box backend"}`；curl POST `/api/v1/jobs` 返回正确 task 创建结果；验证脚本：依次执行三个 curl 命令，全部 HTTP 200 且 JSON 格式正确
- [x] 8.2 前端页面验证：启动前端 dev server 后，浏览器访问 `http://localhost:5173` → 自动跳转到 `/login` 显示"登录"占位页；访问 `/register` 显示"注册"占位页；访问 `/rooms` 显示"房间列表"占位页；Tailwind 样式正确渲染（按钮等组件用 bg/px/rounded 类验证）
- [x] 8.3 前后端联调验证：启动两个 dev server，前端页面中如果有测试按钮（可选临时加一个测试调用 Axios 实例的组件）→ 点击后前端 DevTools Network 面板看到 `/api/v1/jobs` POST 请求 → 响应数据自动解包并显示在页面；验证跨域代理正常
- [x] 8.4 Docker 一键启动验证：`docker compose up --build` 成功构建并启动 backend 和 frontend 容器 → `curl http://localhost:3000/health` 返回健康状态 → 浏览器 `http://localhost:5173` 可访问前端页面 → 前端 `/api/v1/hello` 调用走 nginx proxy 正确到达 backend；验证全部路径可访问
- [x] 8.5 代码质量验证：`cd backend && npx tsc --noEmit` 无 TypeScript 编译错误；`cd frontend && npx tsc --noEmit` 无 TypeScript 编译错误；`.env.example` 中无敏感值、所有变量有中文注释；backend 所有路由文件按资源分模块（不堆在 index.ts）

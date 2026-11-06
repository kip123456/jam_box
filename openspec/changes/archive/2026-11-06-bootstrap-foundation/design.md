## Context

See proposal.md - Why. 当前仓库只有后端 Express 健康检查骨架，前端、数据库、中间件、构建脚本全部缺失。本 change 一次性补全所有 Phase 1-7 共用的基础设施。

## Goals / Non-Goals

**Goals:**
- 建立可运行的前后端全 TypeScript 工程骨架，`docker compose up --build` 和 `bash start.sh` 两条路径都能跑通
- 引入 Prisma + SQLite 作为统一数据库层，初始 schema 包含 `job_queue` 表（Phase 4 AI、Phase 7 导出共用）
- 搭建统一响应格式、全局错误处理、CORS、Helmet、dotenv、zod 输入校验等后端中间件栈
- 搭建 Vite + React 18 + Tailwind + shadcn/ui + React Router + Zustand + Axios 前端骨架
- 实现轻量 SQLite 消息队列基础设施（表结构 + worker + 任务提交/查询 API + 处理器注册机制），Phase 4/7 直接接入

**Non-Goals:**
- 不实现 Phase 1-7 的业务功能（用户、房间、编曲、AI、协同、WebRTC、导出）—— 每个 Phase 独立 change 实现
- 不实现 Redis 或其他外部消息队列—— MVP 阶段 SQLite 队列完全够用，后续高并发时替换
- 不实现 Jest/Vitest 单元测试框架—— 每个 Phase 实现阶段各自引入测试
- 不引入 Socket.IO / Yjs / WebRTC 依赖—— Phase 5/6 再引入
- 不引入 bcryptjs / jsonwebtoken 的具体使用（只安装依赖，Phase 1 再用）

## Decisions

### Decision: SQLite 消息队列作为 MVP 队列方案
**选择**：在 Prisma schema 中定义 `Job` 模型作为队列表，独立 worker 进程通过 Prisma 事务 + 原子状态更新执行任务。

**备选方案**：
- Redis + BullMQ：成熟但引入新依赖新服务，MVP 阶段任务量小，过度设计
- 纯内存队列（数组 + setInterval）：服务重启丢任务，不满足持久化需求

**理由**：项目已确定用 SQLite，零额外中间件成本。Prisma schema：
```prisma
model Job {
  id          String   @id @default(cuid())
  type        String
  payload     Json?
  status      JobStatus @default(pending) // pending/running/success/failed
  retryCount  Int      @default(0)
  maxRetries  Int      @default(3)
  result      Json?
  error       String?
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

enum JobStatus { pending running success failed }
```

Worker 执行流程：
1. 启动时查询所有 `pending` 或 `running`（进程重启恢复）的任务
2. 按 FIFO 顺序，逐条 `UPDATE ... SET status = 'running' WHERE id = ? AND status = 'pending'`（原子条件更新，避免并发重复执行）
3. 调用已注册的 handler，执行成功 → `success` + 写入 result；执行失败 → 检查 `retryCount < maxRetries`，递增 retryCount 后重置为 `pending`（间隔 1s/2s/4s 递增），否则标记为 `failed`

**并发限制**：SQLite 单写者，MVP 单 worker 串行执行足够。后续需要高并发时，把 job_queue 表和 worker 迁移到 Redis + BullMQ，处理器注册接口保持不变，Phase 4/7 业务代码零改动。

### Decision: 后端目录结构
```
backend/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts                 # Express 入口：加载中间件、挂载路由、启动服务、fork worker
│   ├── middleware/
│   │   ├── response.ts          # 统一响应格式中间件
│   │   ├── error.ts             # 全局错误处理中间件
│   │   └── cors-helmet.ts       # CORS + Helmet 配置
│   ├── lib/
│   │   ├── prisma.ts            # PrismaClient 单例
│   │   └── errors.ts            # 自定义 BusinessError 类
│   ├── routes/
│   │   └── health.ts            # 保留已有 health 端点（迁移到模块化路由）
│   ├── queues/
│   │   ├── worker.ts            # 独立 worker 进程（同进程 fork 或独立启动）
│   │   ├── client.ts            # 任务提交/查询 API 逻辑（导出供 routes 层调用）
│   │   └── handlers.ts         # 任务处理器注册机制
│   ├── zod/
│   │   └── validators.ts        # 共享的 zod schema（Phase 1+ 补充）
│   └── utils/
│       └── env.ts               # 环境变量类型安全加载
```

**理由**：符合 backend rules（路由按资源分模块、接口版本化、错误统一处理）。`index.ts` 极薄，只负责"启动什么"；业务逻辑全部在 routes/middleware/lib/queues 里。后续 Phase 每个业务域（users、rooms、tracks...）在 `routes/` 下加独立文件即可。

### Decision: 前端目录结构
```
frontend/
├── src/
│   ├── main.tsx                 # React + ReactDOM.createRoot
│   ├── App.tsx                  # Router 根组件（Auth Guard 内嵌）
│   ├── router/
│   │   └── index.tsx            # React Router 路由表定义
│   ├── api/
│   │   └── client.ts            # Axios 实例（拦截器 + 自动解包 + 401 跳转）
│   ├── store/
│   │   └── user.ts              # Zustand useUserStore
│   ├── pages/                   # 每个路由对应一个页面组件
│   │   ├── Login.tsx            # 占位
│   │   ├── Register.tsx         # 占位
│   │   ├── Rooms.tsx            # 占位
│   │   └── NotFound.tsx         # 404
│   ├── components/              # 业务复用组件（后续 Phase 填充）
│   └── lib/
│       └── utils.ts             # shadcn/ui 生成的 cn() 工具函数
├── public/
├── index.html
├── vite.config.ts               # server.port=5173, proxy /api → backend:3000
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.node.json
└── package.json
```

**理由**：前后端通过 Vite dev server proxy 通信（`/api` 请求代理到 `http://localhost:3000`），开发时不需要前端显式配置跨域。生产时由 nginx 统一处理前端静态文件 + `/api` 反向代理，避免 CORS 问题。

### Decision: Docker Compose 服务编排
```yaml
services:
  backend:
    build: ./backend
    ports: ["3000:3000"]
    volumes:
      - jam_box_data:/app/prisma   # SQLite 数据持久化
    environment:
      - DATABASE_URL=file:/app/prisma/dev.db
      - BACKEND_PORT=3000
    healthcheck:                   # 已有 scaffold spec 要求
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]

  frontend:
    build: ./frontend
    ports: ["5173:80"]
    depends_on: [backend]
    # nginx.conf 配置 /api/* proxy_pass → backend:3000

volumes:
  jam_box_data:
```

**理由**：SQLite 数据库文件需要持久化，通过命名卷挂载。frontend 用 nginx，nginx.conf 里配置 `/api/` 反向代理到 backend:3000，生产时前后端同域，完全规避 CORS。backend 在 compose 网络内不需要额外暴露，`ports` 仅用于本地 `docker compose run` 调试。

### Decision: 统一响应格式中间件实现
Express middleware：在业务路由处理函数之前，包装 `res.json` 方法。业务代码正常 `res.json(data)` → 中间件拦截并包装为 `{ code: 0, msg: "ok", data }`；业务代码 `next(error)` → 全局错误中间件处理。

**理由**：禁止业务代码重复写包装逻辑，确保所有成功响应格式一致。全局错误中间件处理所有失败场景（zod 校验失败、Prisma 错误、自定义 BusinessError、未知异常）。

### Decision: start.sh 和 setup.sh 的实现
- `setup.sh`：先 `cd backend && npm install`，再 `cd ../frontend && npm install`，两个目录都输出完成标记
- `start.sh`：后台运行 backend 和 frontend 的 `npm run dev`，前缀标记 `[backend]`/`[frontend]`，用 `trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait' EXIT` 确保 Ctrl+C 时清理所有子进程

**理由**：`start.sh` 必须后台启动，这样 Ctrl+C 才能被 trap 正确捕获。如果用 `npm run dev &` 然后等，两个进程可能会吞掉终端输入信号。

## Risks / Trade-offs

**[风险] SQLite 作为消息队列的局限性** → SQLite 单写者，worker 并发上限 1 个串行执行。Phase 4 AI 任务（LLM 调用本身可能耗时 10-30s）如果多用户同时提交，后面的任务要排队等前面的。缓解：Phase 4 实现时加入任务级超时 + 主动取消机制；如果 Phase 5 或 Phase 4 后期用户量上来，直接迁移 Redis + BullMQ，处理器注册接口保持不变。

**[风险] Docker Compose 的 SQLite 卷挂载** → 容器重建（`docker compose down && up`）时数据不会丢，但手动 `docker compose down -v` 会丢。缓解：backend Dockerfile 里有 `npx prisma migrate deploy`，如果丢失卷后能自动重建 schema（但数据丢了）。MVP 阶段接受这个 trade-off，后续加数据库定期备份。

**[风险] Worker 在同一个 Express 进程 fork** → 如果 Express 进程 crash，worker 也 crash。SQLite 事务会自动回滚 `running` 状态的任务（因为进程挂了没执行完），重启后 worker 会重新拾取。这是可接受的行为（crash-safe）。

**[风险] 前端 Vite dev server 的 proxy 与生产 nginx proxy 行为一致性** → Vite dev server proxy 可能不完全等同于 nginx 的行为（如 WebSocket、SSE）。缓解：Phase 5 引入 Socket.IO 时，如果 dev proxy 有问题再单独调；MVP 阶段纯 HTTP 不会有问题。

## Open Questions

- **Worker 是独立进程还是同进程 fork？** 先在 tasks 里写"实现独立 worker.ts，index.ts 启动时 fork 它"—— Phase 4 实现时验证是否需要改独立启动。如果同进程 fork 没问题就不用改 Dockerfile。如果需要独立启动（比如未来拆成独立服务），再调。
- **.env.example 需要包含哪些变量？** 除了 BACKEND_PORT / FRONTEND_PORT，还需要 DATABASE_URL（SQLite 路径）、JWT_SECRET（Phase 1 用，Phase 0 先加占位）、LLM_BASE_URL / LLM_MODEL / LLM_API_KEY（Phase 4 用，Phase 0 先加占位）。design 里先列出来，tasks 里实现。
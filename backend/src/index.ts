import "./utils/env";
import path from "path";
import fs from "fs";
import express, { type Express } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fork } from "child_process";
import { applySecurityMiddleware } from "./middleware/cors-helmet";
import { responseMiddleware } from "./middleware/response";
import { errorMiddleware } from "./middleware/error";
import healthRouter from "./routes/health";
import jobsRouter from "./routes/jobs";
import authRouter from "./routes/auth";
import roomsRouter from "./routes/rooms";
import shareRouter, { publicShareRouter } from "./routes/share";
import exportRouter from "./routes/export";
import { roomTracksRouter, tracksRouter } from "./routes/tracks";
import notesRouter from "./routes/notes";
import aiRouter from "./routes/ai";
import { authenticateAccessToken } from "./middleware/auth";
import { requireRoomMember, requireTrackAccess } from "./middleware/roomMember";
import { config } from "./utils/env";
import prisma from "./lib/prisma";
import { BusinessError } from "./lib/errors";
import { setupSocketIO } from "./socket";
import { flushAllPendingSaves } from "./lib/yjs";

/** 导出文件目录（开发态 src/... 与构建产物 dist/... 均指向 backend/storage/exports） */
const exportsDir = path.join(__dirname, "..", "storage", "exports");

/** 组装 Express 应用（不监听端口，供测试与运行时复用） */
export function createApp(): Express {
  const app = express();

  // 启动时自动创建导出目录，避免首次导出失败
  fs.mkdirSync(exportsDir, { recursive: true });

  // body parser
  app.use(express.json());

  // 安全中间件（Helmet + CORS）
  applySecurityMiddleware(app);

  // 统一响应格式
  app.use(responseMiddleware);

  // 导出文件静态访问（仅允许访问该目录，文件名做规范化）
  app.use(
    "/exports",
    express.static(exportsDir, {
      setHeaders: (res, filePath) => {
        res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
      },
    })
  );

  // 路由
  app.use("/", healthRouter);
  app.use("/api/v1", healthRouter);
  app.use("/api/v1/jobs", jobsRouter);
  app.use("/api/v1/auth", authRouter);
  // 分享：POST 房间分享需登录+成员，GET /shared/:token 公开
  app.use("/api/v1", shareRouter);
  app.use("/", publicShareRouter);
  // 导出任务
  app.use("/api/v1/rooms", exportRouter);
  app.use("/api/v1/rooms", roomsRouter);
  // 轨道/音符：先鉴权，再按房间（或轨道所属房间）校验成员身份
  app.use(
    "/api/v1/rooms/:roomId/tracks",
    authenticateAccessToken,
    requireRoomMember,
    roomTracksRouter
  );
  app.use("/api/v1/tracks/:trackId/notes", authenticateAccessToken, requireTrackAccess, notesRouter);
  app.use("/api/v1/tracks", authenticateAccessToken, tracksRouter);
  // AI 能力：全部路由需要登录；compose/fix 在路由内按 body.roomId 校验成员身份
  app.use("/api/v1/ai", authenticateAccessToken, aiRouter);

  // 未匹配路由统一返回 404 JSON，而非 Express 默认 HTML
  app.use((_req, _res, next) => {
    next(new BusinessError("接口不存在", 404));
  });

  // 全局错误处理（必须最后）
  app.use(errorMiddleware);

  return app;
}

function startWorker(): void {
  const jsPath = path.join(__dirname, "queues", "worker.js");
  const tsPath = path.join(__dirname, "queues", "worker.ts");
  const workerPath = fs.existsSync(jsPath) ? jsPath : fs.existsSync(tsPath) ? tsPath : null;

  if (!workerPath) {
    console.error("[backend] worker entry not found, job queue disabled");
    return;
  }

  // 开发态直接 fork .ts 时用 ts-node 注册器；构建产物 fork .js
  const execArgv = workerPath.endsWith(".ts") ? ["-r", "ts-node/register"] : [];
  const child = fork(workerPath, ["--run"], { execArgv, stdio: "inherit" });

  child.on("exit", (code) => {
    console.log(`[backend] worker exited with code ${code ?? 0}`);
  });
}

async function start(): Promise<void> {
  await prisma.$connect();
  console.log("[backend] database connected");

  const app = createApp();

  // Express + Socket.IO 复用同一个 HTTP server
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: config.frontendOrigin,
      credentials: true,
    },
  });

  setupSocketIO(io);

  httpServer.listen(config.backendPort, () => {
    console.log(`[backend] listening on port ${config.backendPort}`);
    startWorker();
  });
}

const isEntryPoint = typeof require !== "undefined" && require.main === module;

// 进程退出前强制保存所有待保存的 Yjs 文档
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[backend] received ${signal}, flushing pending Yjs saves...`);
  await flushAllPendingSaves();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));

if (isEntryPoint) {
  start().catch(async (err) => {
    console.error("[backend] failed to start", err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
}

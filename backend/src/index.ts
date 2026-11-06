import "./utils/env";
import path from "path";
import fs from "fs";
import express, { type Express } from "express";
import { fork } from "child_process";
import { applySecurityMiddleware } from "./middleware/cors-helmet";
import { responseMiddleware } from "./middleware/response";
import { errorMiddleware } from "./middleware/error";
import healthRouter from "./routes/health";
import jobsRouter from "./routes/jobs";
import authRouter from "./routes/auth";
import { config } from "./utils/env";
import prisma from "./lib/prisma";
import { BusinessError } from "./lib/errors";

/** 组装 Express 应用（不监听端口，供测试与运行时复用） */
export function createApp(): Express {
  const app = express();

  // body parser
  app.use(express.json());

  // 安全中间件（Helmet + CORS）
  applySecurityMiddleware(app);

  // 统一响应格式
  app.use(responseMiddleware);

  // 路由
  app.use("/", healthRouter);
  app.use("/api/v1", healthRouter);
  app.use("/api/v1/jobs", jobsRouter);
  app.use("/api/v1/auth", authRouter);

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
  app.listen(config.backendPort, () => {
    console.log(`[backend] listening on port ${config.backendPort}`);
    startWorker();
  });
}

const isEntryPoint = typeof require !== "undefined" && require.main === module;

if (isEntryPoint) {
  start().catch(async (err) => {
    console.error("[backend] failed to start", err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
}

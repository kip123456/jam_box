import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { getHandler, JobHandler, registerAll } from "./handlers";

const POLL_INTERVAL_MS = 2000;
const TASK_TIMEOUT_MS = 120_000;
const MAX_BATCH = 10;

let scanning = false;
let shuttingDown = false;

function retryDelayMs(retryCount: number): number {
  // 1s、2s、4s 递增
  return 1000 * 2 ** Math.max(retryCount - 1, 0);
}

async function executeHandler(handler: JobHandler, payload: unknown): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`任务执行超时（${TASK_TIMEOUT_MS}ms）`)), TASK_TIMEOUT_MS);
  });

  try {
    return await Promise.race([handler(payload as never), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runJob(jobId: string): Promise<void> {
  // 原子条件更新：只有 pending 状态的任务才能被领取，避免重复执行
  const claimed = await prisma.job.updateMany({
    where: { id: jobId, status: "pending" },
    data: { status: "running", startedAt: new Date() },
  });

  if (claimed.count === 0) {
    return;
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  const handler = getHandler(job.type);
  if (!handler) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: `未注册的任务类型: ${job.type}`,
        completedAt: new Date(),
      },
    });
    console.error(`[worker] job ${job.id} has no registered handler for type "${job.type}"`);
    return;
  }

  try {
    const result = await executeHandler(handler, job.payload);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "success",
        completedAt: new Date(),
        error: null,
        result: result === undefined ? Prisma.JsonNull : (result as Prisma.InputJsonValue),
      },
    });
    console.log(`[worker] job ${job.id} (${job.type}) succeeded`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const nextRetryCount = job.retryCount + 1;

    if (job.retryCount < job.maxRetries) {
      const delay = retryDelayMs(nextRetryCount);
      console.warn(
        `[worker] job ${job.id} (${job.type}) failed, retry ${nextRetryCount}/${job.maxRetries} in ${delay}ms: ${message}`
      );

      // 延迟后重新放回 pending（间隔递增），不阻塞当前 worker
      setTimeout(() => {
        prisma.job
          .update({
            where: { id: job.id },
            data: { status: "pending", retryCount: nextRetryCount, error: message, startedAt: null },
          })
          .catch((updateErr) => console.error(`[worker] reset job ${job.id} failed`, updateErr));
      }, delay);
    } else {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "failed",
          retryCount: job.retryCount,
          error: message,
          completedAt: new Date(),
        },
      });
      console.error(`[worker] job ${job.id} (${job.type}) failed permanently: ${message}`);
    }
  }
}

async function scanPending(): Promise<void> {
  if (scanning || shuttingDown) return;
  scanning = true;

  try {
    const jobs = await prisma.job.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: MAX_BATCH,
    });

    for (const job of jobs) {
      if (shuttingDown) break;
      await runJob(job.id);
    }
  } catch (err) {
    console.error("[worker] scan failed", err);
  } finally {
    scanning = false;
  }
}

async function main(): Promise<void> {
  await prisma.$connect();
  console.log("[worker] database connected");

  registerAll();

  // 进程重启恢复：running 状态的任务重置为 pending 重新执行
  const recovered = await prisma.job.updateMany({
    where: { status: "running" },
    data: { status: "pending", startedAt: null },
  });
  if (recovered.count > 0) {
    console.log(`[worker] recovered ${recovered.count} unfinished job(s)`);
  }

  console.log("[worker] started, waiting for jobs...");

  await scanPending();
  setInterval(scanPending, POLL_INTERVAL_MS);
}

function shutdown(): void {
  shuttingDown = true;
  prisma
    .$disconnect()
    .catch(() => undefined)
    .finally(() => process.exit(0));
}

const isEntryPoint = typeof require !== "undefined" && require.main === module;

if (isEntryPoint) {
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("disconnect", shutdown);

  main().catch(async (err) => {
    console.error("[worker] failed to start", err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
}

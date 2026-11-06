import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../backend/src/lib/prisma";
import { registerHandler } from "../../backend/src/queues/handlers";
import { runJob } from "../../backend/src/queues/worker";

beforeEach(async () => {
  await prisma.job.deleteMany({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("任务状态流转", () => {
  it("已注册 handler 执行成功后状态 pending → running → success 并写入结果", async () => {
    const type = "test:echo";
    registerHandler(type, async (payload) => payload);

    const job = await prisma.job.create({ data: { type, payload: { value: 42 } } });
    expect(job.status).toBe("pending");

    await runJob(job.id);

    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("success");
    expect(after.result).toEqual({ value: 42 });
    expect(after.retryCount).toBe(0);
    expect(after.error).toBeNull();
    expect(after.startedAt).not.toBeNull();
    expect(after.completedAt).not.toBeNull();
  });

  it("未注册类型直接标记 failed 并记录错误", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const job = await prisma.job.create({ data: { type: "test:unregistered" } });

    await runJob(job.id);

    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("failed");
    expect(after.retryCount).toBe(0);
    expect(after.error).toBe("未注册的任务类型: test:unregistered");
    expect(after.completedAt).not.toBeNull();
  });

  it("重试次数耗尽后标记最终 failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const type = "test:always-fail";
    registerHandler(type, async () => {
      throw new Error("boom");
    });

    const job = await prisma.job.create({
      data: { type, retryCount: 3, maxRetries: 3 },
    });

    await runJob(job.id);

    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("failed");
    expect(after.retryCount).toBe(3);
    expect(after.error).toBe("boom");
    expect(after.completedAt).not.toBeNull();
  });

  it("并发重复领取同一任务时 handler 只执行一次", async () => {
    const type = "test:concurrent-once";
    let calls = 0;
    registerHandler(type, async () => {
      calls += 1;
      return { ok: true };
    });

    const job = await prisma.job.create({ data: { type } });

    await Promise.all([runJob(job.id), runJob(job.id)]);

    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(calls).toBe(1);
    expect(after.status).toBe("success");
    expect(after.result).toEqual({ ok: true });
  });
});

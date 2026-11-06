import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { BusinessError } from "../lib/errors";

/** 提交异步任务，立即返回任务记录（状态 pending） */
export async function submitJob(type: string, payload?: unknown) {
  return prisma.job.create({
    data: {
      type,
      payload: payload === undefined ? undefined : (payload as Prisma.InputJsonValue),
    },
  });
}

/** 按 id 查询任务，不存在时抛出 404 业务错误 */
export async function getJob(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new BusinessError("任务不存在", 404);
  }
  return job;
}

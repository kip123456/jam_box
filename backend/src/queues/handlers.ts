import { Prisma } from "@prisma/client";

export type JobPayload = Prisma.JsonValue;
export type JobResult = Prisma.JsonValue | void;
export type JobHandler = (payload: JobPayload) => Promise<JobResult>;

/** 任务类型 -> 处理器映射，各 Phase 通过 registerHandler 注册自己的任务类型 */
const handlers = new Map<string, JobHandler>();

/** 注册任务处理器（同类型重复注册会被覆盖） */
export function registerHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

/** 获取已注册的处理器，未注册返回 undefined */
export function getHandler(type: string): JobHandler | undefined {
  return handlers.get(type);
}

/** 当前已注册的任务类型列表 */
export function getRegisteredTypes(): string[] {
  return Array.from(handlers.keys());
}

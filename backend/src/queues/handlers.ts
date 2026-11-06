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

/** 集中注册所有任务处理器，worker 启动时调用一次 */
export function registerAll(): void {
  // 延迟 require 避免 handlers.ts（注册表）与具体 handler 之间形成循环依赖
  const { composeHandler, fixHandler } = require("./handlers/aiHandlers") as typeof import("./handlers/aiHandlers");
  registerHandler("ai-compose", composeHandler);
  registerHandler("ai-fix", fixHandler);

  const { exportHandler } = require("./handlers/exportHandler") as typeof import("./handlers/exportHandler");
  registerHandler("export-audio", exportHandler);
  console.log(`[worker] registered handlers: ${getRegisteredTypes().join(", ")}`);
}

import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient 单例。
 * 开发时 ts-node-dev 热重启会重复执行模块，用 globalThis 缓存实例避免连接泄漏。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;

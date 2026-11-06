import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const testDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        // 测试从根目录直接引用 Prisma 类型时，复用 backend 已生成的 client
        find: /^@prisma\/client$/,
        replacement: path.resolve(testDir, "../backend/node_modules/@prisma/client"),
      },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // SQLite 单文件不能被多个测试进程并发写入，顺序执行
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});

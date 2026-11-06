import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(testDir, "../backend");
const prismaCli = path.resolve(backendDir, "node_modules/prisma/build/index.js");

/**
 * 让「单独复跑某条用例」（npx vitest run <file> -t <title>）也能直接工作：
 * 测试进程启动前先把独立测试库迁移到最新。
 */
export default function globalSetup(): void {
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: "file:./test.db", NODE_ENV: "test" },
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `[tests] 测试数据库迁移失败：\n${result.stdout ?? ""}\n${result.stderr ?? ""}`
    );
  }
}

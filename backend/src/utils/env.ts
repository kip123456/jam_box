import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

// 先加载环境变量：backend/.env 优先，再尝试仓库根目录 .env（不覆盖已有值）
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const envSchema = z.object({
  BACKEND_PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_PORT: z.coerce.number().int().positive().default(5173),
  DATABASE_URL: z.string().min(1, "DATABASE_URL 未配置"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET 未配置"),
  LLM_BASE_URL: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
});

/** 校验任意环境变量对象，便于单元测试注入 */
export function parseEnv(raw: NodeJS.ProcessEnv) {
  return envSchema.safeParse(raw);
}

const parsed = parseEnv(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  console.error(`[env] 环境变量配置错误：${details}`);
  process.exit(1);
}

const env = parsed.data;

/** 类型安全的环境变量配置对象 */
export const config = {
  backendPort: env.BACKEND_PORT,
  frontendPort: env.FRONTEND_PORT,
  frontendOrigin: `http://localhost:${env.FRONTEND_PORT}`,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  llm: {
    baseUrl: env.LLM_BASE_URL ?? "",
    model: env.LLM_MODEL ?? "",
    apiKey: env.LLM_API_KEY ?? "",
  },
} as const;

export type Config = typeof config;

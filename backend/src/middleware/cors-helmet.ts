import { Express } from "express";
import helmet from "helmet";
import cors from "cors";
import { config } from "../utils/env";

/**
 * 安全中间件：Helmet 安全响应头 + CORS 跨域控制。
 * 开发模式允许本地前端（默认 5173）访问。
 */
export function applySecurityMiddleware(app: Express): void {
  app.use(helmet());

  const allowedOrigins = new Set<string>([config.frontendOrigin]);
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:5173");
  }

  app.use(
    cors({
      origin(origin, callback) {
        // 无 Origin 的请求（curl、服务端调用）直接放行
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS: 不允许的来源 ${origin}`));
      },
      credentials: true,
    })
  );
}

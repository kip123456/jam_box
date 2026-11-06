import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { BusinessError } from "../lib/errors";

/**
 * 全局错误处理中间件（必须挂载在所有路由之后）。
 * 映射顺序：zod 校验错误 -> 400；Prisma 唯一约束 -> 409；BusinessError -> 自身 code；其他 -> 500。
 */
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let status = 500;
  let code = 500;
  let msg = "服务器内部错误";

  if (err instanceof ZodError) {
    status = 400;
    code = 400;
    msg = err.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    status = 409;
    code = 409;
    msg = "资源已存在（唯一约束冲突）";
  } else if (err instanceof BusinessError) {
    code = err.code;
    status = err.code >= 400 && err.code < 600 ? err.code : 400;
    msg = err.message;
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err instanceof Error ? err.stack : err);

  res.locals.rawResponse = true;
  res.status(status).json({ code, msg, data: null });
}

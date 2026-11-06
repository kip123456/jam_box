import { NextFunction, Request, Response } from "express";

/**
 * 统一响应格式中间件。
 * 业务代码直接 res.json(data)，此处自动包装为 { code: 0, msg: "ok", data }。
 * 错误中间件通过 res.locals.rawResponse 标记跳过包装。
 */
export function responseMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = function wrappedJson(body?: unknown) {
    if (res.locals.rawResponse) {
      return originalJson(body);
    }
    return originalJson({ code: 0, msg: "ok", data: body === undefined ? null : body });
  } as Response["json"];

  next();
}

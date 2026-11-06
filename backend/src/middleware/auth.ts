import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AuthError } from "../lib/errors";
import { verifyToken, type TokenType } from "../lib/auth";
import { refreshSchema } from "../zod/auth";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

/** 从 Authorization: Bearer <token> 中提取 token */
function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  return token;
}

/**
 * 校验 token 并注入 req.user。
 * 缺失/格式错误 -> 401 未登录；过期 -> 401 令牌已过期；签名或 payload 非法 -> 401 令牌无效。
 */
function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
  token: string | null,
  expectedType: TokenType
): void {
  if (!token) {
    next(new AuthError("未登录"));
    return;
  }

  try {
    const payload = verifyToken(token);
    if (payload.type !== expectedType) {
      throw new jwt.JsonWebTokenError("unexpected token type");
    }
    req.user = { id: payload.sub };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new AuthError("令牌已过期"));
    } else if (err instanceof jwt.JsonWebTokenError) {
      next(new AuthError("令牌无效"));
    } else {
      next(err);
    }
  }
}

/** 受保护路由中间件：仅接受 access token */
export function authenticateAccessToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  authenticate(req, res, next, readBearerToken(req), "access");
}

/** refresh 中间件：仅接受 refresh token（优先 Authorization header，其次请求体 refreshToken） */
export function authenticateRefreshToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let token = readBearerToken(req);

  if (!token) {
    const parsed = refreshSchema.safeParse(req.body);
    token = parsed.success ? parsed.data.refreshToken : null;
  }

  authenticate(req, res, next, token, "refresh");
}

import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { BusinessError, AuthError, ValidationError } from "../lib/errors";
import { hashPassword, comparePassword, signAccessToken, signRefreshToken } from "../lib/auth";
import { registerSchema, loginSchema } from "../zod/auth";
import { authenticateAccessToken, authenticateRefreshToken } from "../middleware/auth";

const router = Router();

/** 取 zod 第一条错误信息，保证响应 msg 与 spec 完全一致 */
function firstIssueMessage(error: ZodErrorLike): string {
  return error.issues[0]?.message ?? "参数校验失败";
}

type ZodErrorLike = { issues: { message: string }[] };

/** 注册 */
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error));
    }

    const { username, password, email } = parsed.data;
    const passwordHash = await hashPassword(password);

    try {
      const user = await prisma.user.create({
        data: { username, passwordHash, email },
      });

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new BusinessError("用户名已被占用", 409);
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/** 登录 */
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error));
    }

    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      throw new AuthError("用户名或密码错误");
    }

    const matched = await comparePassword(password, user.passwordHash);
    if (!matched) {
      throw new AuthError("用户名或密码错误");
    }

    res.json({
      accessToken: signAccessToken(user.id),
      refreshToken: signRefreshToken(user.id),
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (err) {
    next(err);
  }
});

/** 刷新令牌 */
router.post("/refresh", authenticateRefreshToken, (req: Request, res: Response) => {
  const userId = req.user!.id;

  res.json({
    accessToken: signAccessToken(userId),
    refreshToken: signRefreshToken(userId),
  });
});

/** 获取当前用户 */
router.get(
  "/me",
  authenticateAccessToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

      if (!user) {
        throw new AuthError("未登录");
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

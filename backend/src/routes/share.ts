import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { RoomStatus } from "@prisma/client";
import prisma from "../lib/prisma";
import { BusinessError } from "../lib/errors";
import { config } from "../utils/env";
import { authenticateAccessToken } from "../middleware/auth";
import { requireRoomMember } from "../middleware/roomMember";

/** 分享链接有效期：30 天 */
const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const router = Router();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 为已结束房间生成分享链接（要求登录且是房间成员） */
router.post(
  "/rooms/:roomId/share",
  authenticateAccessToken,
  requireRoomMember,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const room = req.room!;
      if (room.status !== RoomStatus.ended) {
        throw new BusinessError("合奏尚未结束，无法分享", 400);
      }

      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + SHARE_TTL_MS);

      await prisma.shareLink.create({
        data: { token, roomId: room.id, expiresAt },
      });

      res.json({ shareUrl: `/shared/${token}`, expiresAt });
    } catch (err) {
      next(err);
    }
  }
);

/** 公开分享页：免登录，仅展示只读房间信息 */
const sharedPageHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const link = await prisma.shareLink.findUnique({ where: { token: req.params.token } });
    const expired = link?.expiresAt ? link.expiresAt.getTime() <= Date.now() : false;

    if (!link || expired) {
      res.status(404).type("html").send("<!doctype html><html><body><p>分享链接不存在或已过期。</p></body></html>");
      return;
    }

    const room = await prisma.room.findUnique({
      where: { id: link.roomId },
      include: {
        owner: { select: { username: true } },
        _count: { select: { tracks: true } },
      },
    });

    if (!room) {
      res.status(404).type("html").send("<!doctype html><html><body><p>房间不存在。</p></body></html>");
      return;
    }

    const roomUrl = `${config.frontendOrigin}/rooms/${room.id}`;
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(room.name)} · 合奏盒子</title>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
  main { max-width: 640px; margin: 10vh auto; padding: 32px; background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
  h1 { margin: 0 0 8px; font-size: 24px; }
  .meta { color: #64748b; font-size: 14px; line-height: 1.8; }
  .actions { margin-top: 24px; }
  a.button { display: inline-block; padding: 10px 18px; border-radius: 8px; background: #2563eb; color: #fff; text-decoration: none; font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(room.name)}</h1>
  <div class="meta">
    <div>房间号：${escapeHtml(room.roomNumber)}</div>
    <div>房主：${escapeHtml(room.owner?.username ?? "未知")}</div>
    <div>轨道数：${room._count.tracks}</div>
  </div>
  <div class="actions">
    <a class="button" href="${escapeHtml(roomUrl)}">查看乐谱</a>
  </div>
</main>
</body>
</html>`;

    res.type("html").send(html);
  } catch (err) {
    next(err);
  }
};

/** 公开分享页挂在根路径 /shared/:token，不走 /api/v1 前缀 */
export const publicShareRouter = Router();
publicShareRouter.get("/shared/:token", sharedPageHandler);

export default router;

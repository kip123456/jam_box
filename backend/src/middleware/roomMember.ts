import { NextFunction, Request, Response } from "express";
import type { Track } from "@prisma/client";
import prisma from "../lib/prisma";
import { BusinessError } from "../lib/errors";
import { requireRoomRole } from "./room";
import { MemberRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      track?: Track;
    }
  }
}

/**
 * 只要求「是房间成员」的中间件（不校验角色），用于轨道/音符 API。
 * 复用 requireRoomRole：requiredRole 为 member 时不做角色进一步校验。
 */
export const requireRoomMember = requireRoomRole(MemberRole.member);

/**
 * 轨道访问中间件：按 :trackId 定位轨道 → 校验当前用户属于该轨道所在房间。
 * 轨道不存在 404「轨道不存在」；非成员 403「不是房间成员」。
 */
export async function requireTrackAccess(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const track = await prisma.track.findUnique({ where: { id: req.params.trackId } });

    if (!track) {
      next(new BusinessError("轨道不存在", 404));
      return;
    }

    const room = await prisma.room.findUnique({ where: { id: track.roomId } });
    if (!room) {
      next(new BusinessError("轨道不存在", 404));
      return;
    }

    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: req.user!.id } },
    });

    if (!member) {
      next(new BusinessError("不是房间成员", 403));
      return;
    }

    req.track = track;
    req.room = room;
    req.memberRole = member.role;
    next();
  } catch (err) {
    next(err);
  }
}

import { NextFunction, Request, Response } from "express";
import { MemberRole, type Room } from "@prisma/client";
import prisma from "../lib/prisma";
import { BusinessError } from "../lib/errors";

declare global {
  namespace Express {
    interface Request {
      room?: Room;
      memberRole?: MemberRole;
    }
  }
}

/**
 * 房间权限中间件：查房间 → 查当前用户的 RoomMember → 注入 req.room / req.memberRole。
 * 房间不存在 404「房间不存在」；非成员 403「不是房间成员」；角色不足 403「无权限」。
 */
export function requireRoomRole(requiredRole: MemberRole) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });

      if (!room) {
        next(new BusinessError("房间不存在", 404));
        return;
      }

      const member = await prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: req.user!.id } },
      });

      if (!member) {
        next(new BusinessError("不是房间成员", 403));
        return;
      }

      if (member.role !== requiredRole && requiredRole !== MemberRole.member) {
        next(new BusinessError("无权限", 403));
        return;
      }

      req.room = room;
      req.memberRole = member.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

import { Router, Request, Response, NextFunction } from "express";
import { Prisma, MemberRole, RoomStatus } from "@prisma/client";
import prisma from "../lib/prisma";
import { BusinessError, ValidationError } from "../lib/errors";
import { hashPassword, comparePassword } from "../lib/auth";
import { createRoomSchema, joinRoomSchema } from "../zod/room";
import {
  authenticateAccessToken,
  optionalAuthenticateAccessToken,
} from "../middleware/auth";
import { requireRoomRole } from "../middleware/room";
import {
  generateRoomNumber,
  serializeRoom,
  findRoomByParam,
  roomInclude,
} from "../lib/room";
import { serializeTrack } from "../lib/track";

const router = Router();

/** 取 zod 第一条错误信息，保证响应 msg 与 spec 完全一致 */
function firstIssueMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "参数校验失败";
}

/** 创建房间：创建者自动成为 owner 成员 */
router.post("/", authenticateAccessToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error));
    }

    const { name, isPublic } = parsed.data;
    const passwordHash = isPublic ? null : await hashPassword(parsed.data.password!);
    const roomNumber = await generateRoomNumber();

    const room = await prisma.room.create({
      data: {
        roomNumber,
        name,
        isPublic,
        passwordHash,
        ownerId: req.user!.id,
        members: { create: { userId: req.user!.id, role: MemberRole.owner } },
      },
      include: roomInclude,
    });

    res.json(serializeRoom(room));
  } catch (err) {
    next(err);
  }
});

/** 公开房间列表：无需登录，最多 20 条 active 公开房间，按创建时间倒序 */
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { isPublic: true, status: RoomStatus.active },
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { id: true, username: true } },
        _count: { select: { members: true } },
      },
    });

    res.json(
      rooms.map((room) => ({
        id: room.id,
        roomNumber: room.roomNumber,
        name: room.name,
        isPublic: room.isPublic,
        status: room.status,
        createdAt: room.createdAt,
        owner: { id: room.owner.id, username: room.owner.username },
        memberCount: room._count.members,
      }))
    );
  } catch (err) {
    next(err);
  }
});

/** 房间详情：可选登录，成员额外获得 isMember / role */
router.get(
  "/:roomId",
  optionalAuthenticateAccessToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const room = await findRoomByParam(req.params.roomId);
      if (!room) {
        throw new BusinessError("房间不存在", 404);
      }

      const member = req.user
        ? room.members.find((item) => item.userId === req.user!.id)
        : undefined;

      // 私有房间不向非成员暴露编曲数据（对应前端「不加载轨道数据」）
      const canViewTracks = room.isPublic || Boolean(member);

      res.json({
        ...serializeRoom(room),
        isMember: Boolean(member),
        role: member?.role ?? null,
        tracks: canViewTracks ? (room.tracks ?? []).map(serializeTrack) : [],
      });
    } catch (err) {
      next(err);
    }
  }
);

/** 加入房间：公开直接加入，私有需校验密码；房间号或 id 均可作为路径参数 */
router.post(
  "/:roomId/join",
  authenticateAccessToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = joinRoomSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError(firstIssueMessage(parsed.error));
      }

      const room = await findRoomByParam(req.params.roomId);
      if (!room) {
        throw new BusinessError("房间不存在", 404);
      }
      if (room.status === RoomStatus.ended) {
        throw new BusinessError("合奏已结束", 403);
      }
      if (room.status === RoomStatus.locked) {
        throw new BusinessError("房间已锁定，无法加入", 403);
      }

      const existing = await prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: req.user!.id } },
      });
      if (existing) {
        throw new BusinessError("你已是该房间成员", 409);
      }

      if (!room.isPublic) {
        const password = parsed.data.password;
        const matched =
          Boolean(password) &&
          Boolean(room.passwordHash) &&
          (await comparePassword(password!, room.passwordHash!));

        if (!matched) {
          throw new BusinessError("房间密码错误", 401);
        }
      }

      try {
        await prisma.roomMember.create({
          data: { roomId: room.id, userId: req.user!.id, role: MemberRole.member },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new BusinessError("你已是该房间成员", 409);
        }
        throw err;
      }

      const updated = await prisma.room.findUnique({
        where: { id: room.id },
        include: roomInclude,
      });

      res.json(serializeRoom(updated!));
    } catch (err) {
      next(err);
    }
  }
);

/** 房主踢人 */
router.delete(
  "/:roomId/members/:userId",
  authenticateAccessToken,
  requireRoomRole(MemberRole.owner),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const room = req.room!;
      const { userId } = req.params;

      if (userId === req.user!.id) {
        throw new BusinessError("不能踢房主", 400);
      }

      const target = await prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId: room.id, userId } },
      });
      if (!target) {
        throw new BusinessError("该成员不在房间中", 404);
      }

      await prisma.roomMember.delete({ where: { id: target.id } });

      const updated = await prisma.room.findUnique({
        where: { id: room.id },
        include: roomInclude,
      });

      res.json(serializeRoom(updated!));
    } catch (err) {
      next(err);
    }
  }
);

/** 房主加锁：加锁后禁止新成员加入 */
router.post(
  "/:roomId/lock",
  authenticateAccessToken,
  requireRoomRole(MemberRole.owner),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.room!.status === RoomStatus.ended) {
        throw new BusinessError("房间已结束", 400);
      }

      const updated = await prisma.room.update({
        where: { id: req.room!.id },
        data: { status: RoomStatus.locked },
        include: roomInclude,
      });

      res.json(serializeRoom(updated));
    } catch (err) {
      next(err);
    }
  }
);

/** 房主结束合奏：结束后房间只读 */
router.post(
  "/:roomId/end",
  authenticateAccessToken,
  requireRoomRole(MemberRole.owner),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.room!.status === RoomStatus.ended) {
        throw new BusinessError("房间已结束", 400);
      }

      const updated = await prisma.room.update({
        where: { id: req.room!.id },
        data: { status: RoomStatus.ended },
        include: roomInclude,
      });

      res.json(serializeRoom(updated));
    } catch (err) {
      next(err);
    }
  }
);

export default router;

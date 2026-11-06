import type { Room, RoomMember, User } from "@prisma/client";
import prisma from "./prisma";
import { trackInclude, type TrackWithNotes } from "./track";

/** 房间号取值范围：100000-999999（避免前置零被截断，见 design 决策） */
const ROOM_NUMBER_MIN = 100000;
const ROOM_NUMBER_MAX = 999999;
const MAX_GENERATE_ATTEMPTS = 10;

/**
 * 生成 6 位唯一数字房间号。
 * 碰撞时最多重试 10 次，仍失败则抛错（极端情况：号段接近占满）。
 */
export async function generateRoomNumber(): Promise<string> {
  for (let i = 0; i < MAX_GENERATE_ATTEMPTS; i += 1) {
    const value = Math.floor(
      ROOM_NUMBER_MIN + Math.random() * (ROOM_NUMBER_MAX - ROOM_NUMBER_MIN + 1)
    );
    const exists = await prisma.room.findUnique({ where: { roomNumber: String(value) } });
    if (!exists) {
      return String(value);
    }
  }
  throw new Error("Failed to generate unique room number after 10 attempts");
}

type RoomOwner = Pick<User, "id" | "username">;

type RoomWithRelations = Room & {
  owner?: RoomOwner | null;
  members?: (RoomMember & { user?: Pick<User, "id" | "username"> | null })[];
  tracks?: TrackWithNotes[];
};

/** 房间对外序列化：移除 passwordHash，仅暴露必要字段 */
export function serializeRoom(room: RoomWithRelations) {
  return {
    id: room.id,
    roomNumber: room.roomNumber,
    name: room.name,
    isPublic: room.isPublic,
    status: room.status,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    owner: room.owner ? { id: room.owner.id, username: room.owner.username } : null,
    members: (room.members ?? []).map((member) => ({
      id: member.id,
      userId: member.userId,
      username: member.user?.username ?? null,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
  };
}

/** 查询房间时统一携带的关系，保证 serializeRoom 可用；details 一并带上轨道与音符 */
export const roomInclude = {
  owner: { select: { id: true, username: true } },
  members: { include: { user: { select: { id: true, username: true } } } },
  tracks: { include: trackInclude, orderBy: { position: "asc" } },
} as const;

/** 按 id 或 6 位房间号解析房间（前端加入弹窗以房间号提交） */
export async function findRoomByParam(param: string) {
  const byId = await prisma.room.findUnique({ where: { id: param }, include: roomInclude });
  if (byId) return byId;
  return prisma.room.findUnique({ where: { roomNumber: param }, include: roomInclude });
}

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { MemberRole } from "@prisma/client";
import prisma from "../../backend/src/lib/prisma";
import { requireRoomRole } from "../../backend/src/middleware/room";
import { BusinessError } from "../../backend/src/lib/errors";

const ROOM_ID = "room_test_01";

beforeEach(async () => {
  await prisma.roomMember.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.user.deleteMany({});

  await prisma.user.create({
    data: { id: "user_owner", username: "owner_01", passwordHash: "hash" },
  });
  await prisma.user.create({
    data: { id: "user_member", username: "member_01", passwordHash: "hash" },
  });
  await prisma.room.create({
    data: { id: ROOM_ID, roomNumber: "500001", name: "测试房间", ownerId: "user_owner" },
  });
  await prisma.roomMember.create({
    data: { roomId: ROOM_ID, userId: "user_owner", role: MemberRole.owner },
  });
  await prisma.roomMember.create({
    data: { roomId: ROOM_ID, userId: "user_member", role: MemberRole.member },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function invoke(roomId: string, userId: string, requiredRole: MemberRole) {
  const req = { params: { roomId }, user: { id: userId } } as unknown as Request;
  const res = {} as Response;
  let error: unknown;
  let called = false;

  const next = ((err?: unknown) => {
    called = true;
    error = err;
  }) as NextFunction;

  await requireRoomRole(requiredRole)(req, res, next);

  return { req, error, called };
}

describe("requireRoomRole", () => {
  it("requireRoomRole：房间不存在返回 404 房间不存在", async () => {
    const { error, called } = await invoke("missing_room", "user_owner", MemberRole.owner);

    expect(called).toBe(true);
    expect(error).toBeInstanceOf(BusinessError);
    expect((error as BusinessError).code).toBe(404);
    expect((error as BusinessError).message).toBe("房间不存在");
  });

  it("非成员返回 403 不是房间成员", async () => {
    const { error } = await invoke(ROOM_ID, "user_owner_2", MemberRole.owner);

    expect(error).toBeInstanceOf(BusinessError);
    expect((error as BusinessError).code).toBe(403);
    expect((error as BusinessError).message).toBe("不是房间成员");
  });

  it("普通成员调用房主操作返回 403 无权限", async () => {
    const { error } = await invoke(ROOM_ID, "user_member", MemberRole.owner);

    expect(error).toBeInstanceOf(BusinessError);
    expect((error as BusinessError).code).toBe(403);
    expect((error as BusinessError).message).toBe("无权限");
  });

  it("房主调用房主操作通过并注入 req.room 与 memberRole", async () => {
    const { req, error, called } = await invoke(ROOM_ID, "user_owner", MemberRole.owner);

    expect(called).toBe(true);
    expect(error).toBeUndefined();
    expect(req.room?.id).toBe(ROOM_ID);
    expect(req.memberRole).toBe(MemberRole.owner);
  });

  it("普通成员调用 member 级操作通过，房主同样通过", async () => {
    const member = await invoke(ROOM_ID, "user_member", MemberRole.member);
    const owner = await invoke(ROOM_ID, "user_owner", MemberRole.member);

    expect(member.error).toBeUndefined();
    expect(member.req.memberRole).toBe(MemberRole.member);
    expect(owner.error).toBeUndefined();
    expect(owner.req.memberRole).toBe(MemberRole.owner);
  });
});

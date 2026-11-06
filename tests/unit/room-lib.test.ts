import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Room } from "@prisma/client";
import prisma from "../../backend/src/lib/prisma";
import { generateRoomNumber, serializeRoom } from "../../backend/src/lib/room";

beforeEach(async () => {
  await prisma.roomMember.deleteMany({});
  await prisma.room.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("generateRoomNumber", () => {
  it("生成 6 位数字房间号，100 次调用均在 100000-999999 且不重复", async () => {
    const numbers: string[] = [];

    for (let i = 0; i < 100; i += 1) {
      numbers.push(await generateRoomNumber());
    }

    expect(numbers).toHaveLength(100);
    for (const number of numbers) {
      expect(number).toMatch(/^\d{6}$/);
      expect(Number(number)).toBeGreaterThanOrEqual(100000);
      expect(Number(number)).toBeLessThanOrEqual(999999);
    }
    expect(new Set(numbers).size).toBe(100);
  });
});

describe("serializeRoom", () => {
  const room = {
    id: "room_1",
    roomNumber: "123456",
    name: "我的乐队",
    isPublic: false,
    passwordHash: "$2b$12$hidden-hash",
    status: "active",
    ownerId: "user_1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:01Z"),
    owner: { id: "user_1", username: "alice" },
    members: [
      {
        id: "member_1",
        roomId: "room_1",
        userId: "user_1",
        role: "owner",
        joinedAt: new Date("2026-01-01T00:00:02Z"),
        user: { id: "user_1", username: "alice" },
      },
    ],
  } as unknown as Room;

  it("移除 passwordHash 并保留房间与成员信息", () => {
    const result = serializeRoom(room);

    expect(result).not.toHaveProperty("passwordHash");
    expect(result).toMatchObject({
      id: "room_1",
      roomNumber: "123456",
      name: "我的乐队",
      isPublic: false,
      status: "active",
      owner: { id: "user_1", username: "alice" },
    });
    expect(result.members).toEqual([
      {
        id: "member_1",
        userId: "user_1",
        username: "alice",
        role: "owner",
        joinedAt: new Date("2026-01-01T00:00:02Z"),
      },
    ]);
  });

  it("无 owner / members 关系时返回 null 与空数组（边界）", () => {
    const bare = { ...room, owner: undefined, members: undefined } as unknown as Room;
    const result = serializeRoom(bare);

    expect(result.owner).toBeNull();
    expect(result.members).toEqual([]);
    expect(result).not.toHaveProperty("passwordHash");
  });
});

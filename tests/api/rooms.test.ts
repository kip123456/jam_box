import { afterAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../../backend/src/index";
import prisma from "../../backend/src/lib/prisma";

const request = supertest(createApp());
const BASE = "/api/v1/rooms";
const AUTH_BASE = "/api/v1/auth";

const PLAYER = { username: "player_01", password: "Passw0rd123" };
const OTHER = { username: "player_02", password: "Passw0rd123" };
const THIRD = { username: "player_03", password: "Passw0rd123" };

async function registerAndLogin(user: { username: string; password: string }) {
  await request.post(`${AUTH_BASE}/register`).send(user);
  const login = await request.post(`${AUTH_BASE}/login`).send(user);
  return {
    token: login.body.data.accessToken as string,
    id: login.body.data.user.id as string,
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

beforeEach(async () => {
  await prisma.roomMember.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/rooms 创建房间", () => {
  it("创建公开房间：创建者为 owner，房间号为 6 位数字", async () => {
    const { token, id } = await registerAndLogin(PLAYER);

    const res = await request
      .post(BASE)
      .set(auth(token))
      .send({ name: "我的乐队", isPublic: true });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.name).toBe("我的乐队");
    expect(res.body.data.isPublic).toBe(true);
    expect(res.body.data.status).toBe("active");
    expect(res.body.data.roomNumber).toMatch(/^[1-9]\d{5}$/);
    expect(res.body.data.owner).toEqual({ id, username: PLAYER.username });
    expect(res.body.data.members).toHaveLength(1);
    expect(res.body.data.members[0]).toMatchObject({ userId: id, role: "owner" });
    expect(res.body.data.passwordHash).toBeUndefined();

    const members = await prisma.roomMember.findMany();
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
  });

  it("创建私有房间：密码以 bcrypt 哈希落库且响应不含 passwordHash", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(BASE)
      .set(auth(token))
      .send({ name: "秘密合奏", isPublic: false, password: "secret123" });

    expect(res.status).toBe(200);
    expect(res.body.data.isPublic).toBe(false);
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.password).toBeUndefined();

    const room = await prisma.room.findUnique({ where: { id: res.body.data.id } });
    expect(room?.passwordHash).not.toBe("secret123");
    expect(room?.passwordHash?.startsWith("$2")).toBe(true);
  });

  it("创建房间名为空返回 400 且消息与 spec 一致", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request.post(BASE).set(auth(token)).send({ name: "", isPublic: true });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 400,
      msg: "房间名长度必须在 1-50 字符之间",
      data: null,
    });
    expect(await prisma.room.count()).toBe(0);
  });

  it("创建房间名超过 50 字符返回 400（边界）", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(BASE)
      .set(auth(token))
      .send({ name: "x".repeat(51), isPublic: true });

    expect(res.status).toBe(400);
    expect(res.body.msg).toBe("房间名长度必须在 1-50 字符之间");
  });

  it("未登录创建房间返回 401 未登录", async () => {
    const res = await request.post(BASE).send({ name: "我的乐队", isPublic: true });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "未登录", data: null });
  });

  it("私有房间缺少密码返回 400", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(BASE)
      .set(auth(token))
      .send({ name: "秘密合奏", isPublic: false });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 400,
      msg: "私有房间密码长度必须在 8-32 位之间",
      data: null,
    });
  });
});

describe("GET /api/v1/rooms 列出公开房间", () => {
  it("列出公开房间：仅 active 公开房间并按创建时间倒序", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);

    const oldRoom = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "旧房间", isPublic: true });
    const newRoom = await request
      .post(BASE)
      .set(auth(other.token))
      .send({ name: "新房间", isPublic: true });
    const privateRoom = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "私有房间", isPublic: false, password: "secret123" });

    // SQLite CURRENT_TIMESTAMP 精度为秒，显式错开时间才能校验排序
    await prisma.room.update({
      where: { id: oldRoom.body.data.id },
      data: { createdAt: new Date(Date.now() - 3_600_000) },
    });

    const res = await request.get(BASE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((room: { id: string }) => room.id)).toEqual([
      newRoom.body.data.id,
      oldRoom.body.data.id,
    ]);
    expect(
      res.body.data.some((room: { id: string }) => room.id === privateRoom.body.data.id)
    ).toBe(false);

    const first = res.body.data[0];
    expect(first).toMatchObject({
      id: newRoom.body.data.id,
      name: "新房间",
      roomNumber: newRoom.body.data.roomNumber,
      memberCount: 1,
      owner: { id: other.id, username: OTHER.username },
    });
    expect(first.passwordHash).toBeUndefined();
  });

  it("没有活跃公开房间时返回空数组", async () => {
    const res = await request.get(BASE);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 0, msg: "ok", data: [] });
  });

  it("列出公开房间最多返回 20 条（边界）", async () => {
    const { token } = await registerAndLogin(PLAYER);
    for (let i = 0; i < 21; i += 1) {
      const res = await request
        .post(BASE)
        .set(auth(token))
        .send({ name: `房间 ${i}`, isPublic: true });
      expect(res.status).toBe(200);
    }

    const res = await request.get(BASE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
  });
});

describe("GET /api/v1/rooms/:roomId 房间详情", () => {
  it("房间详情：成员返回 isMember=true 与 role", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const created = await request
      .post(BASE)
      .set(auth(token))
      .send({ name: "我的乐队", isPublic: true });

    const res = await request
      .get(`${BASE}/${created.body.data.id}`)
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.isMember).toBe(true);
    expect(res.body.data.role).toBe("owner");
    expect(res.body.data.members).toHaveLength(1);
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it("私有房间详情对非成员不返回 passwordHash", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "秘密合奏", isPublic: false, password: "secret123" });

    const res = await request
      .get(`${BASE}/${created.body.data.id}`)
      .set(auth(other.token));

    expect(res.status).toBe(200);
    expect(res.body.data.isPublic).toBe(false);
    expect(res.body.data.owner.username).toBe(PLAYER.username);
    expect(res.body.data.isMember).toBe(false);
    expect(res.body.data.role).toBeNull();
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it("房间不存在返回 404 房间不存在", async () => {
    const res = await request.get(`${BASE}/not-exists`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, msg: "房间不存在", data: null });
  });

  it("已结束房间仍可查看详情且 status=ended", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const created = await request
      .post(BASE)
      .set(auth(token))
      .send({ name: "我的乐队", isPublic: true });
    await request.post(`${BASE}/${created.body.data.id}/end`).set(auth(token));

    const res = await request
      .get(`${BASE}/${created.body.data.id}`)
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ended");
  });
});

describe("POST /api/v1/rooms/:roomId/join 加入房间", () => {
  it("加入公开房间成功并出现在成员列表", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "我的乐队", isPublic: true });

    const res = await request
      .post(`${BASE}/${created.body.data.id}/join`)
      .set(auth(other.token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.members).toHaveLength(2);
    expect(
      res.body.data.members.find((m: { userId: string }) => m.userId === other.id).role
    ).toBe("member");
  });

  it("私有房间密码正确可加入", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "秘密合奏", isPublic: false, password: "secret123" });

    const res = await request
      .post(`${BASE}/${created.body.data.id}/join`)
      .set(auth(other.token))
      .send({ password: "secret123" });

    expect(res.status).toBe(200);
    expect(await prisma.roomMember.count()).toBe(2);
  });

  it("私有房间密码错误返回 401 房间密码错误", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "秘密合奏", isPublic: false, password: "secret123" });

    const res = await request
      .post(`${BASE}/${created.body.data.id}/join`)
      .set(auth(other.token))
      .send({ password: "wrongpass1" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "房间密码错误", data: null });
    expect(await prisma.roomMember.count()).toBe(1);
  });

  it("私有房间未提供密码返回 401 房间密码错误（边界）", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "秘密合奏", isPublic: false, password: "secret123" });

    const res = await request
      .post(`${BASE}/${created.body.data.id}/join`)
      .set(auth(other.token))
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.msg).toBe("房间密码错误");
  });

  it("重复加入返回 409 你已是该房间成员", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const created = await request
      .post(BASE)
      .set(auth(token))
      .send({ name: "我的乐队", isPublic: true });

    const res = await request
      .post(`${BASE}/${created.body.data.id}/join`)
      .set(auth(token))
      .send({});

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 409, msg: "你已是该房间成员", data: null });
    expect(await prisma.roomMember.count()).toBe(1);
  });

  it("加入已锁定房间返回 403 房间已锁定，无法加入", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "我的乐队", isPublic: true });
    await request.post(`${BASE}/${created.body.data.id}/lock`).set(auth(owner.token));

    const res = await request
      .post(`${BASE}/${created.body.data.id}/join`)
      .set(auth(other.token))
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 403, msg: "房间已锁定，无法加入", data: null });
  });

  it("加入已结束房间返回 403 合奏已结束", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "我的乐队", isPublic: true });
    await request.post(`${BASE}/${created.body.data.id}/end`).set(auth(owner.token));

    const res = await request
      .post(`${BASE}/${created.body.data.id}/join`)
      .set(auth(other.token))
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 403, msg: "合奏已结束", data: null });
  });

  it("按房间号加入公开房间成功（边界）", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "我的乐队", isPublic: true });

    const res = await request
      .post(`${BASE}/${created.body.data.roomNumber}/join`)
      .set(auth(other.token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.body.data.id);
    expect(res.body.data.members).toHaveLength(2);
  });

  it("加入不存在的房间返回 404 房间不存在", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request.post(`${BASE}/not-exists/join`).set(auth(token)).send({});

    expect(res.status).toBe(404);
    expect(res.body.msg).toBe("房间不存在");
  });

  it("密码明文不出现在错误日志中", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "秘密合奏", isPublic: false, password: "secret123" });

    const logs: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };

    try {
      await request
        .post(`${BASE}/${created.body.data.id}/join`)
        .set(auth(other.token))
        .send({ password: "leak-check-pwd" });
    } finally {
      console.error = original;
    }

    expect(logs.join("\n")).not.toContain("leak-check-pwd");
    expect(logs.join("\n")).not.toContain("secret123");
  });
});

describe("DELETE /api/v1/rooms/:roomId/members/:userId 房主踢人", () => {
  async function setupRoomWithMember() {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "我的乐队", isPublic: true });
    await request
      .post(`${BASE}/${created.body.data.id}/join`)
      .set(auth(other.token))
      .send({});
    return { owner, other, roomId: created.body.data.id as string };
  }

  it("房主踢普通成员后成员列表更新", async () => {
    const { owner, other, roomId } = await setupRoomWithMember();

    const res = await request
      .delete(`${BASE}/${roomId}/members/${other.id}`)
      .set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data.members).toHaveLength(1);
    expect(
      res.body.data.members.some((m: { userId: string }) => m.userId === other.id)
    ).toBe(false);
    expect(
      await prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId, userId: other.id } },
      })
    ).toBeNull();
  });

  it("房主踢自己返回 400 不能踢房主", async () => {
    const { owner, roomId } = await setupRoomWithMember();

    const res = await request
      .delete(`${BASE}/${roomId}/members/${owner.id}`)
      .set(auth(owner.token));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, msg: "不能踢房主", data: null });
  });

  it("普通成员尝试踢人返回 403 无权限", async () => {
    const { other, roomId } = await setupRoomWithMember();

    const res = await request
      .delete(`${BASE}/${roomId}/members/${other.id}`)
      .set(auth(other.token));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 403, msg: "无权限", data: null });
  });

  it("踢不在房间的用户返回 404 该成员不在房间中", async () => {
    const { owner, roomId } = await setupRoomWithMember();
    const third = await registerAndLogin(THIRD);

    const res = await request
      .delete(`${BASE}/${roomId}/members/${third.id}`)
      .set(auth(owner.token));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, msg: "该成员不在房间中", data: null });
  });

  it("非成员调用踢人返回 403 不是房间成员", async () => {
    const { roomId } = await setupRoomWithMember();
    const third = await registerAndLogin(THIRD);

    const res = await request
      .delete(`${BASE}/${roomId}/members/${third.id}`)
      .set(auth(third.token));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 403, msg: "不是房间成员", data: null });
  });
});

describe("POST /api/v1/rooms/:roomId/lock 加锁", () => {
  it("房主加锁成功返回 status=locked", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const created = await request
      .post(BASE)
      .set(auth(token))
      .send({ name: "我的乐队", isPublic: true });

    const res = await request.post(`${BASE}/${created.body.data.id}/lock`).set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("locked");
  });

  it("非房主尝试加锁返回 403 无权限", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const created = await request
      .post(BASE)
      .set(auth(owner.token))
      .send({ name: "我的乐队", isPublic: true });
    await request
      .post(`${BASE}/${created.body.data.id}/join`)
      .set(auth(other.token))
      .send({});

    const res = await request
      .post(`${BASE}/${created.body.data.id}/lock`)
      .set(auth(other.token));

    expect(res.status).toBe(403);
    expect(res.body.msg).toBe("无权限");
  });
});

describe("POST /api/v1/rooms/:roomId/end 结束合奏", () => {
  it("房主结束合奏返回 status=ended", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const created = await request
      .post(BASE)
      .set(auth(token))
      .send({ name: "我的乐队", isPublic: true });

    const res = await request.post(`${BASE}/${created.body.data.id}/end`).set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ended");
  });

  it("已结束房间再次结束返回 400 房间已结束", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const created = await request
      .post(BASE)
      .set(auth(token))
      .send({ name: "我的乐队", isPublic: true });
    await request.post(`${BASE}/${created.body.data.id}/end`).set(auth(token));

    const res = await request.post(`${BASE}/${created.body.data.id}/end`).set(auth(token));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, msg: "房间已结束", data: null });
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../../backend/src/index";
import prisma from "../../backend/src/lib/prisma";

const request = supertest(createApp());
const AUTH_BASE = "/api/v1/auth";
const ROOMS = "/api/v1/rooms";
const TRACKS = "/api/v1/tracks";

const OWNER = { username: "track_owner", password: "Passw0rd123" };
const STRANGER = { username: "track_stranger", password: "Passw0rd123" };

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

async function createRoom(
  token: string,
  body: { name: string; isPublic: boolean; password?: string } = {
    name: "编曲房间",
    isPublic: true,
  }
) {
  const res = await request.post(ROOMS).set(auth(token)).send(body);
  expect(res.status).toBe(200);
  return res.body.data as { id: string; roomNumber: string; isPublic: boolean };
}

function createTrack(
  token: string,
  roomId: string,
  body: Record<string, unknown>
) {
  return request.post(`${ROOMS}/${roomId}/tracks`).set(auth(token)).send(body);
}

beforeEach(async () => {
  await prisma.note.deleteMany({});
  await prisma.track.deleteMany({});
  await prisma.roomMember.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma.note.deleteMany({});
  await prisma.track.deleteMany({});
  await prisma.roomMember.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.$disconnect();
});

describe("POST /api/v1/rooms/:roomId/tracks 创建轨道", () => {
  it("创建四种乐器轨道：position 从 0 递增，默认 solo/mute 为 false、颜色为 #3b82f6", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const instruments = ["piano", "guitar", "bass", "drums"] as const;
    for (const [index, instrumentType] of instruments.entries()) {
      const res = await createTrack(owner.token, room.id, {
        name: `${instrumentType} 轨`,
        instrumentType,
      });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toMatchObject({
        roomId: room.id,
        name: `${instrumentType} 轨`,
        instrumentType,
        color: "#3b82f6",
        solo: false,
        mute: false,
        position: index,
      });
      expect(res.body.data.notes).toEqual([]);
      expect(res.body.data.createdById).toBe(owner.id);
    }

    expect(await prisma.track.count()).toBe(4);
  });

  it("乐器类型非法返回 400 且消息与 spec 一致", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const res = await createTrack(owner.token, room.id, {
      name: "小提琴",
      instrumentType: "violin",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, msg: "不支持的乐器类型", data: null });
    expect(await prisma.track.count()).toBe(0);
  });

  it("轨道名为空 / 超过 50 字符返回 400（边界）", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const empty = await createTrack(owner.token, room.id, {
      name: "",
      instrumentType: "piano",
    });
    const tooLong = await createTrack(owner.token, room.id, {
      name: "x".repeat(51),
      instrumentType: "piano",
    });

    expect(empty.status).toBe(400);
    expect(empty.body.msg).toBe("轨道名长度必须在 1-50 字符之间");
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.msg).toBe("轨道名长度必须在 1-50 字符之间");

    const boundary = await createTrack(owner.token, room.id, {
      name: "x".repeat(50),
      instrumentType: "piano",
    });
    expect(boundary.status).toBe(200);
  });

  it("颜色非十六进制返回 400，合法颜色可写入", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const invalid = await createTrack(owner.token, room.id, {
      name: "钢琴",
      instrumentType: "piano",
      color: "red",
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.msg).toBe("颜色必须是十六进制格式（如 #3b82f6）");

    const valid = await createTrack(owner.token, room.id, {
      name: "钢琴",
      instrumentType: "piano",
      color: "#FF8800",
    });
    expect(valid.status).toBe(200);
    expect(valid.body.data.color).toBe("#FF8800");
  });

  it("非房间成员创建返回 403「不是房间成员」，未登录返回 401", async () => {
    const owner = await registerAndLogin(OWNER);
    const stranger = await registerAndLogin(STRANGER);
    const room = await createRoom(owner.token);

    const forbidden = await createTrack(stranger.token, room.id, {
      name: "钢琴",
      instrumentType: "piano",
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ code: 403, msg: "不是房间成员", data: null });

    const anonymous = await request
      .post(`${ROOMS}/${room.id}/tracks`)
      .send({ name: "钢琴", instrumentType: "piano" });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual({ code: 401, msg: "未登录", data: null });
  });

  it("房间不存在返回 404「房间不存在」", async () => {
    const owner = await registerAndLogin(OWNER);

    const res = await createTrack(owner.token, "not_exist_room", {
      name: "钢琴",
      instrumentType: "piano",
    });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, msg: "房间不存在", data: null });
  });
});

describe("GET /api/v1/rooms/:roomId/tracks 列表", () => {
  it("按 position 升序返回，且每个轨道包含按开始时间升序的音符", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const piano = await createTrack(owner.token, room.id, {
      name: "钢琴",
      instrumentType: "piano",
    });
    const guitar = await createTrack(owner.token, room.id, {
      name: "吉他",
      instrumentType: "guitar",
    });

    await request
      .post(`${TRACKS}/${piano.body.data.id}/notes`)
      .set(auth(owner.token))
      .send({ pitch: 60, startTimeTicks: 480, durationTicks: 480 });
    await request
      .post(`${TRACKS}/${piano.body.data.id}/notes`)
      .set(auth(owner.token))
      .send({ pitch: 62, startTimeTicks: 0, durationTicks: 480 });

    const res = await request.get(`${ROOMS}/${room.id}/tracks`).set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe(piano.body.data.id);
    expect(res.body.data[1].id).toBe(guitar.body.data.id);
    expect(res.body.data[0].notes.map((note: { pitch: number }) => note.pitch)).toEqual([62, 60]);
  });

  it("非房间成员返回 403", async () => {
    const owner = await registerAndLogin(OWNER);
    const stranger = await registerAndLogin(STRANGER);
    const room = await createRoom(owner.token);

    const res = await request.get(`${ROOMS}/${room.id}/tracks`).set(auth(stranger.token));

    expect(res.status).toBe(403);
    expect(res.body.msg).toBe("不是房间成员");
  });
});

describe("GET /api/v1/tracks/:trackId 单轨道", () => {
  it("成员可获取轨道及其音符", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);
    const track = await createTrack(owner.token, room.id, {
      name: "贝斯",
      instrumentType: "bass",
    });

    await request
      .post(`${TRACKS}/${track.body.data.id}/notes`)
      .set(auth(owner.token))
      .send({ pitch: 40, startTimeTicks: 0, durationTicks: 960 });

    const res = await request.get(`${TRACKS}/${track.body.data.id}`).set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(track.body.data.id);
    expect(res.body.data.instrumentType).toBe("bass");
    expect(res.body.data.notes).toHaveLength(1);
    expect(res.body.data.notes[0]).toMatchObject({ pitch: 40, durationTicks: 960 });
  });

  it("轨道不存在返回 404，非成员返回 403", async () => {
    const owner = await registerAndLogin(OWNER);
    const stranger = await registerAndLogin(STRANGER);
    const room = await createRoom(owner.token);
    const track = await createTrack(owner.token, room.id, {
      name: "鼓",
      instrumentType: "drums",
    });

    const missing = await request.get(`${TRACKS}/not_exist`).set(auth(owner.token));
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ code: 404, msg: "轨道不存在", data: null });

    const forbidden = await request
      .get(`${TRACKS}/${track.body.data.id}`)
      .set(auth(stranger.token));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.msg).toBe("不是房间成员");
  });
});

describe("PUT /api/v1/tracks/:trackId 更新轨道", () => {
  it("可更新 name/solo/mute/color/position", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);
    const track = await createTrack(owner.token, room.id, {
      name: "钢琴",
      instrumentType: "piano",
    });

    const res = await request
      .put(`${TRACKS}/${track.body.data.id}`)
      .set(auth(owner.token))
      .send({ name: "主钢琴", solo: true, mute: true, color: "#00FF00", position: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: "主钢琴",
      solo: true,
      mute: true,
      color: "#00FF00",
      position: 5,
    });
  });

  it("不可修改 instrumentType 与 roomId：传入被忽略", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);
    const track = await createTrack(owner.token, room.id, {
      name: "钢琴",
      instrumentType: "piano",
    });

    const res = await request
      .put(`${TRACKS}/${track.body.data.id}`)
      .set(auth(owner.token))
      .send({ instrumentType: "drums", roomId: "hacked_room" });

    expect(res.status).toBe(200);
    expect(res.body.data.instrumentType).toBe("piano");
    expect(res.body.data.roomId).toBe(room.id);
  });

  it("颜色非法 / position 为负返回 400", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);
    const track = await createTrack(owner.token, room.id, {
      name: "钢琴",
      instrumentType: "piano",
    });

    const badColor = await request
      .put(`${TRACKS}/${track.body.data.id}`)
      .set(auth(owner.token))
      .send({ color: "#12345" });
    expect(badColor.status).toBe(400);
    expect(badColor.body.msg).toBe("颜色必须是十六进制格式（如 #3b82f6）");

    const badPosition = await request
      .put(`${TRACKS}/${track.body.data.id}`)
      .set(auth(owner.token))
      .send({ position: -1 });
    expect(badPosition.status).toBe(400);
    expect(badPosition.body.msg).toBe("position 不能为负数");
  });
});

describe("DELETE /api/v1/tracks/:trackId 删除轨道", () => {
  it("删除轨道时级联删除其音符", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);
    const track = await createTrack(owner.token, room.id, {
      name: "钢琴",
      instrumentType: "piano",
    });

    await request
      .post(`${TRACKS}/${track.body.data.id}/notes`)
      .set(auth(owner.token))
      .send({ pitch: 60, startTimeTicks: 0, durationTicks: 480 });

    const res = await request
      .delete(`${TRACKS}/${track.body.data.id}`)
      .set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(await prisma.track.count({ where: { id: track.body.data.id } })).toBe(0);
    expect(await prisma.note.count({ where: { trackId: track.body.data.id } })).toBe(0);
  });

  it("非成员删除返回 403", async () => {
    const owner = await registerAndLogin(OWNER);
    const stranger = await registerAndLogin(STRANGER);
    const room = await createRoom(owner.token);
    const track = await createTrack(owner.token, room.id, {
      name: "钢琴",
      instrumentType: "piano",
    });

    const res = await request
      .delete(`${TRACKS}/${track.body.data.id}`)
      .set(auth(stranger.token));

    expect(res.status).toBe(403);
    expect(await prisma.track.count()).toBe(1);
  });
});

describe("GET /api/v1/rooms/:roomId 房间详情包含轨道", () => {
  it("成员获取详情时返回 tracks（含音符）", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);
    const track = await createTrack(owner.token, room.id, {
      name: "吉他",
      instrumentType: "guitar",
    });
    await request
      .post(`${TRACKS}/${track.body.data.id}/notes`)
      .set(auth(owner.token))
      .send({ pitch: 64, startTimeTicks: 0, durationTicks: 480 });

    const res = await request.get(`${ROOMS}/${room.id}`).set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data.tracks).toHaveLength(1);
    expect(res.body.data.tracks[0].notes).toHaveLength(1);
    expect(res.body.data.tracks[0].instrumentType).toBe("guitar");
  });

  it("公开房间允许非成员只读轨道；私有房间非成员 tracks 为空", async () => {
    const owner = await registerAndLogin(OWNER);
    const stranger = await registerAndLogin(STRANGER);

    const publicRoom = await createRoom(owner.token, { name: "公开房", isPublic: true });
    await createTrack(owner.token, publicRoom.id, {
      name: "钢琴",
      instrumentType: "piano",
    });

    const privateRoom = await createRoom(owner.token, {
      name: "私有房",
      isPublic: false,
      password: "secret123",
    });
    await createTrack(owner.token, privateRoom.id, {
      name: "钢琴",
      instrumentType: "piano",
    });

    const publicDetail = await request.get(`${ROOMS}/${publicRoom.id}`).set(auth(stranger.token));
    expect(publicDetail.status).toBe(200);
    expect(publicDetail.body.data.isMember).toBe(false);
    expect(publicDetail.body.data.tracks).toHaveLength(1);

    const privateDetail = await request
      .get(`${ROOMS}/${privateRoom.id}`)
      .set(auth(stranger.token));
    expect(privateDetail.status).toBe(200);
    expect(privateDetail.body.data.isMember).toBe(false);
    expect(privateDetail.body.data.tracks).toEqual([]);
  });
});

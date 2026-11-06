import { afterAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../../backend/src/index";
import prisma from "../../backend/src/lib/prisma";

const request = supertest(createApp());
const AUTH_BASE = "/api/v1/auth";
const ROOMS = "/api/v1/rooms";
const TRACKS = "/api/v1/tracks";

const OWNER = { username: "note_owner", password: "Passw0rd123" };
const STRANGER = { username: "note_stranger", password: "Passw0rd123" };

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

async function setupTrack() {
  const owner = await registerAndLogin(OWNER);
  const room = await request
    .post(ROOMS)
    .set(auth(owner.token))
    .send({ name: "音符房间", isPublic: true });
  const track = await request
    .post(`${ROOMS}/${room.body.data.id}/tracks`)
    .set(auth(owner.token))
    .send({ name: "钢琴", instrumentType: "piano" });
  return {
    owner,
    roomId: room.body.data.id as string,
    trackId: track.body.data.id as string,
    notesUrl: `${TRACKS}/${track.body.data.id}/notes`,
  };
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

describe("POST /api/v1/tracks/:trackId/notes 创建音符", () => {
  it("创建音符：velocity 默认 100，响应字段完整", async () => {
    const { owner, trackId, notesUrl } = await setupTrack();

    const res = await request
      .post(notesUrl)
      .set(auth(owner.token))
      .send({ pitch: 60, startTimeTicks: 0, durationTicks: 480 });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      trackId,
      pitch: 60,
      startTimeTicks: 0,
      durationTicks: 480,
      velocity: 100,
    });
    expect(await prisma.note.count({ where: { trackId } })).toBe(1);
  });

  it("边界值 pitch 0 / 127、durationTicks 480 合法", async () => {
    const { owner, notesUrl } = await setupTrack();

    const low = await request
      .post(notesUrl)
      .set(auth(owner.token))
      .send({ pitch: 0, startTimeTicks: 0, durationTicks: 480 });
    const high = await request
      .post(notesUrl)
      .set(auth(owner.token))
      .send({ pitch: 127, startTimeTicks: 960, durationTicks: 480 });

    expect(low.status).toBe(200);
    expect(low.body.data.pitch).toBe(0);
    expect(high.status).toBe(200);
    expect(high.body.data.pitch).toBe(127);
    expect(await prisma.note.count()).toBe(2);
  });

  it("pitch 超出 0-127 返回 400 且消息与 spec 一致", async () => {
    const { owner, notesUrl } = await setupTrack();

    for (const pitch of [-1, 128]) {
      const res = await request
        .post(notesUrl)
        .set(auth(owner.token))
        .send({ pitch, startTimeTicks: 0, durationTicks: 480 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 400, msg: "音高必须在 0-127 之间", data: null });
    }
    expect(await prisma.note.count()).toBe(0);
  });

  it("startTimeTicks 为负、durationTicks 小于 480、velocity 超界均返回 400", async () => {
    const { owner, notesUrl } = await setupTrack();

    const negativeStart = await request
      .post(notesUrl)
      .set(auth(owner.token))
      .send({ pitch: 60, startTimeTicks: -1, durationTicks: 480 });
    expect(negativeStart.status).toBe(400);
    expect(negativeStart.body.msg).toBe("开始时间必须 ≥ 0");

    const shortDuration = await request
      .post(notesUrl)
      .set(auth(owner.token))
      .send({ pitch: 60, startTimeTicks: 0, durationTicks: 479 });
    expect(shortDuration.status).toBe(400);
    expect(shortDuration.body.msg).toBe("音符时长至少 480 ticks");

    const badVelocity = await request
      .post(notesUrl)
      .set(auth(owner.token))
      .send({ pitch: 60, startTimeTicks: 0, durationTicks: 480, velocity: 128 });
    expect(badVelocity.status).toBe(400);
    expect(badVelocity.body.msg).toBe("力度必须在 0-127 之间");

    expect(await prisma.note.count()).toBe(0);
  });

  it("非成员创建返回 403，未登录返回 401，轨道不存在返回 404", async () => {
    const { owner, notesUrl } = await setupTrack();
    const stranger = await registerAndLogin(STRANGER);

    const forbidden = await request
      .post(notesUrl)
      .set(auth(stranger.token))
      .send({ pitch: 60, startTimeTicks: 0, durationTicks: 480 });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ code: 403, msg: "不是房间成员", data: null });

    const anonymous = await request
      .post(notesUrl)
      .send({ pitch: 60, startTimeTicks: 0, durationTicks: 480 });
    expect(anonymous.status).toBe(401);

    const missing = await request
      .post(`${TRACKS}/not_exist/notes`)
      .set(auth(owner.token))
      .send({ pitch: 60, startTimeTicks: 0, durationTicks: 480 });
    expect(missing.status).toBe(404);
    expect(missing.body.msg).toBe("轨道不存在");
  });
});

describe("批量音符接口", () => {
  it("bulk 创建 10 个音符一次写入", async () => {
    const { owner, trackId, notesUrl } = await setupTrack();
    const notes = Array.from({ length: 10 }, (_, index) => ({
      pitch: 60 + index,
      startTimeTicks: index * 480,
      durationTicks: 480,
    }));

    const res = await request.post(`${notesUrl}/bulk`).set(auth(owner.token)).send(notes);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.data.map((note: { pitch: number }) => note.pitch)).toEqual(
      Array.from({ length: 10 }, (_, index) => 60 + index)
    );
    expect(await prisma.note.count({ where: { trackId } })).toBe(10);
  });

  it("bulk 创建：非数组 / 空数组 / 数组内非法音符返回 400 且不写入任何数据", async () => {
    const { owner, notesUrl } = await setupTrack();

    const notArray = await request
      .post(`${notesUrl}/bulk`)
      .set(auth(owner.token))
      .send({ pitch: 60 });
    expect(notArray.status).toBe(400);
    expect(notArray.body.msg).toBe("notes 必须是数组");

    const empty = await request.post(`${notesUrl}/bulk`).set(auth(owner.token)).send([]);
    expect(empty.status).toBe(400);
    expect(empty.body.msg).toBe("至少需要一个音符");

    const partialInvalid = await request
      .post(`${notesUrl}/bulk`)
      .set(auth(owner.token))
      .send([
        { pitch: 60, startTimeTicks: 0, durationTicks: 480 },
        { pitch: 200, startTimeTicks: 480, durationTicks: 480 },
      ]);
    expect(partialInvalid.status).toBe(400);
    expect(partialInvalid.body.msg).toBe("音高必须在 0-127 之间");
    expect(await prisma.note.count()).toBe(0);
  });

  it("bulk 更新多个音符并落库", async () => {
    const { owner, trackId, notesUrl } = await setupTrack();
    const created = await request
      .post(`${notesUrl}/bulk`)
      .set(auth(owner.token))
      .send([
        { pitch: 60, startTimeTicks: 0, durationTicks: 480 },
        { pitch: 62, startTimeTicks: 480, durationTicks: 480 },
        { pitch: 64, startTimeTicks: 960, durationTicks: 480 },
      ]);
    const ids = created.body.data.map((note: { id: string }) => note.id);

    const res = await request
      .put(`${notesUrl}/bulk`)
      .set(auth(owner.token))
      .send([
        { id: ids[0], pitch: 72, startTimeTicks: 480 },
        { id: ids[1], velocity: 30, durationTicks: 960 },
      ]);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    const rows = await prisma.note.findMany({ where: { trackId }, orderBy: { pitch: "asc" } });
    const byPitch = new Map(rows.map((row) => [row.pitch, row]));
    expect(byPitch.get(72)?.startTimeTicks).toBe(480);
    expect(byPitch.get(62)?.velocity).toBe(30);
    expect(byPitch.get(62)?.durationTicks).toBe(960);
    expect(byPitch.get(64)?.durationTicks).toBe(480);
  });

  it("bulk 更新引用了别的轨道的音符返回 404，且不产生部分更新", async () => {
    const { owner, roomId, notesUrl } = await setupTrack();
    const otherTrack = await request
      .post(`${ROOMS}/${roomId}/tracks`)
      .set(auth(owner.token))
      .send({ name: "吉他", instrumentType: "guitar" });

    const mine = await request
      .post(notesUrl)
      .set(auth(owner.token))
      .send({ pitch: 60, startTimeTicks: 0, durationTicks: 480 });
    const foreign = await request
      .post(`${TRACKS}/${otherTrack.body.data.id}/notes`)
      .set(auth(owner.token))
      .send({ pitch: 62, startTimeTicks: 0, durationTicks: 480 });

    const res = await request
      .put(`${notesUrl}/bulk`)
      .set(auth(owner.token))
      .send([
        { id: mine.body.data.id, pitch: 90 },
        { id: foreign.body.data.id, pitch: 91 },
      ]);

    expect(res.status).toBe(404);
    expect(res.body.msg).toBe("音符不存在");

    const mineAfter = await prisma.note.findUnique({ where: { id: mine.body.data.id } });
    expect(mineAfter?.pitch).toBe(60);
  });

  it("bulk 删除只删除存在的音符并返回删除数量", async () => {
    const { owner, trackId, notesUrl } = await setupTrack();
    const created = await request
      .post(`${notesUrl}/bulk`)
      .set(auth(owner.token))
      .send([
        { pitch: 60, startTimeTicks: 0, durationTicks: 480 },
        { pitch: 62, startTimeTicks: 480, durationTicks: 480 },
        { pitch: 64, startTimeTicks: 960, durationTicks: 480 },
      ]);
    const ids = created.body.data.map((note: { id: string }) => note.id);

    const res = await request
      .delete(`${notesUrl}/bulk`)
      .set(auth(owner.token))
      .send({ noteIds: [ids[0], ids[2], "not_exist_note"] });

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(2);
    expect(await prisma.note.count({ where: { trackId } })).toBe(1);
    expect((await prisma.note.findFirst())?.pitch).toBe(62);
  });

  it("bulk 删除 noteIds 为空返回 400", async () => {
    const { owner, notesUrl } = await setupTrack();

    const res = await request
      .delete(`${notesUrl}/bulk`)
      .set(auth(owner.token))
      .send({ noteIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.msg).toBe("noteIds 不能为空");
  });
});

describe("单音符更新与删除", () => {
  it("PUT 单个音符更新字段，DELETE 单个音符", async () => {
    const { owner, trackId, notesUrl } = await setupTrack();
    const created = await request
      .post(notesUrl)
      .set(auth(owner.token))
      .send({ pitch: 60, startTimeTicks: 0, durationTicks: 480 });

    const updated = await request
      .put(`${notesUrl}/${created.body.data.id}`)
      .set(auth(owner.token))
      .send({ pitch: 65, startTimeTicks: 960 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ pitch: 65, startTimeTicks: 960 });

    const removed = await request
      .delete(`${notesUrl}/${created.body.data.id}`)
      .set(auth(owner.token));
    expect(removed.status).toBe(200);
    expect(removed.body.data.deleted).toBe(true);
    expect(await prisma.note.count({ where: { trackId } })).toBe(0);
  });

  it("操作不属于该轨道的音符返回 404「音符不存在」", async () => {
    const { owner, roomId, notesUrl } = await setupTrack();
    const otherTrack = await request
      .post(`${ROOMS}/${roomId}/tracks`)
      .set(auth(owner.token))
      .send({ name: "贝斯", instrumentType: "bass" });
    const foreign = await request
      .post(`${TRACKS}/${otherTrack.body.data.id}/notes`)
      .set(auth(owner.token))
      .send({ pitch: 40, startTimeTicks: 0, durationTicks: 480 });

    const update = await request
      .put(`${notesUrl}/${foreign.body.data.id}`)
      .set(auth(owner.token))
      .send({ pitch: 41 });
    expect(update.status).toBe(404);
    expect(update.body).toEqual({ code: 404, msg: "音符不存在", data: null });

    const remove = await request
      .delete(`${notesUrl}/${foreign.body.data.id}`)
      .set(auth(owner.token));
    expect(remove.status).toBe(404);
    expect(remove.body.msg).toBe("音符不存在");

    expect(
      await prisma.note.count({ where: { trackId: otherTrack.body.data.id } })
    ).toBe(1);
  });
});

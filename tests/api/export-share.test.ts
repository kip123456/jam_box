import { afterAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../../backend/src/index";
import prisma from "../../backend/src/lib/prisma";

const request = supertest(createApp());
const AUTH_BASE = "/api/v1/auth";
const BASE = "/api/v1/rooms";

const OWNER = { username: "share_owner", password: "Passw0rd123" };
const MEMBER = { username: "share_member", password: "Passw0rd123" };
const OUTSIDER = { username: "share_outsider", password: "Passw0rd123" };

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

async function createRoom(token: string, name = "合奏房间") {
  const res = await request.post(BASE).set(auth(token)).send({ name, isPublic: true });
  expect(res.status).toBe(200);
  return res.body.data as { id: string; roomNumber: string };
}

async function endRoom(token: string, roomId: string) {
  const res = await request.post(`${BASE}/${roomId}/end`).set(auth(token));
  expect(res.status).toBe(200);
}

beforeEach(async () => {
  await prisma.shareLink.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.note.deleteMany({});
  await prisma.track.deleteMany({});
  await prisma.roomMember.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/rooms/:roomId/export", () => {
  it("未登录返回 401", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const res = await request.post(`${BASE}/${room.id}/export`).send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(401);
  });

  it("非房间成员返回 403", async () => {
    const owner = await registerAndLogin(OWNER);
    const outsider = await registerAndLogin(OUTSIDER);
    const room = await createRoom(owner.token);

    const res = await request
      .post(`${BASE}/${room.id}/export`)
      .set(auth(outsider.token))
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.msg).toBe("不是房间成员");
  });

  it("成员提交合法导出请求：返回 jobId 且任务落库为 export-audio", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const res = await request
      .post(`${BASE}/${room.id}/export`)
      .set(auth(owner.token))
      .send({ format: "mp3", bpm: 100, durationTicks: 960 });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(typeof res.body.data.jobId).toBe("string");

    const job = await prisma.job.findUnique({ where: { id: res.body.data.jobId } });
    expect(job?.type).toBe("export-audio");
    expect(job?.status).toBe("pending");
    expect(job?.payload).toEqual({
      roomId: room.id,
      format: "mp3",
      bpm: 100,
      durationTicks: 960,
    });
  });

  it("format 非法返回 400", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const res = await request
      .post(`${BASE}/${room.id}/export`)
      .set(auth(owner.token))
      .send({ format: "flac" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
    expect(res.body.msg).toContain("format");
    expect(await prisma.job.count()).toBe(0);
  });

  it("bpm 超出 40-240 返回 400（边界）", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const res = await request
      .post(`${BASE}/${room.id}/export`)
      .set(auth(owner.token))
      .send({ bpm: 300 });

    expect(res.status).toBe(400);
    expect(res.body.msg).toContain("bpm");
  });

  it("GET job 返回 pending 状态；跨房间查询返回 404", async () => {
    const owner = await registerAndLogin(OWNER);
    const roomA = await createRoom(owner.token, "A 房间");
    const roomB = await createRoom(owner.token, "B 房间");

    const submitted = await request
      .post(`${BASE}/${roomA.id}/export`)
      .set(auth(owner.token))
      .send({});
    const jobId = submitted.body.data.jobId as string;

    const own = await request
      .get(`${BASE}/${roomA.id}/export/job/${jobId}`)
      .set(auth(owner.token));
    expect(own.status).toBe(200);
    expect(own.body.data.status).toBe("pending");
    expect(own.body.data.result).toBeNull();
    expect(own.body.data.error).toBeNull();

    const cross = await request
      .get(`${BASE}/${roomB.id}/export/job/${jobId}`)
      .set(auth(owner.token));
    expect(cross.status).toBe(404);
    expect(cross.body.msg).toBe("任务不存在");
  });

  it("查询不存在的 job 返回 404", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const res = await request
      .get(`${BASE}/${room.id}/export/job/not-exist`)
      .set(auth(owner.token));

    expect(res.status).toBe(404);
    expect(res.body.msg).toBe("任务不存在");
  });
});

describe("GET /api/v1/rooms?status=ended 历史房间", () => {
  it("未登录返回 401", async () => {
    const res = await request.get(BASE).query({ status: "ended" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(401);
  });

  it("仅返回当前用户参与过的已结束房间，并带 isHost 与 bpm", async () => {
    const owner = await registerAndLogin(OWNER);
    const member = await registerAndLogin(MEMBER);

    const shared = await createRoom(owner.token, "已结束合奏");
    await request
      .post(`${BASE}/${shared.id}/join`)
      .set(auth(member.token))
      .send({});
    await endRoom(owner.token, shared.id);

    const unjoined = await createRoom(owner.token, "未参与的合奏");
    await endRoom(owner.token, unjoined.id);

    const active = await createRoom(owner.token, "进行中的合奏");

    const ownerList = await request.get(BASE).set(auth(owner.token)).query({ status: "ended" });
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.data.rooms).toHaveLength(2);
    const sharedRow = ownerList.body.data.rooms.find(
      (room: { id: string }) => room.id === shared.id
    );
    expect(sharedRow).toMatchObject({
      code: shared.roomNumber,
      name: "已结束合奏",
      bpm: 120,
      status: "ended",
      isHost: true,
    });
    expect(sharedRow.endedAt).toBeTruthy();

    const memberList = await request.get(BASE).set(auth(member.token)).query({ status: "ended" });
    expect(memberList.status).toBe(200);
    expect(memberList.body.data.rooms).toHaveLength(1);
    expect(memberList.body.data.rooms[0].id).toBe(shared.id);
    expect(memberList.body.data.rooms[0].isHost).toBe(false);

    // 进行中的房间不进入历史列表
    expect(active.id).not.toBe(shared.id);
  });
});

describe("POST /api/v1/rooms/:roomId/share 分享链接", () => {
  it("active 房间不可分享，返回 400", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);

    const res = await request.post(`${BASE}/${room.id}/share`).set(auth(owner.token));

    expect(res.status).toBe(400);
    expect(res.body.msg).toBe("合奏尚未结束，无法分享");
  });

  it("非成员不可分享已结束房间，返回 403", async () => {
    const owner = await registerAndLogin(OWNER);
    const outsider = await registerAndLogin(OUTSIDER);
    const room = await createRoom(owner.token);
    await endRoom(owner.token, room.id);

    const res = await request.post(`${BASE}/${room.id}/share`).set(auth(outsider.token));

    expect(res.status).toBe(403);
  });

  it("成员分享已结束房间：生成 32 位 token 并落库", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);
    await endRoom(owner.token, room.id);

    const res = await request.post(`${BASE}/${room.id}/share`).set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data.shareUrl).toMatch(/^\/shared\/[0-9a-f]{32}$/);
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const token = res.body.data.shareUrl.replace("/shared/", "");
    const link = await prisma.shareLink.findUnique({ where: { token } });
    expect(link?.roomId).toBe(room.id);
  });
});

describe("GET /shared/:token 公开分享页", () => {
  it("有效 token 免登录返回 HTML，包含房间名与查看乐谱链接", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token, "公开分享房间");
    await endRoom(owner.token, room.id);

    const created = await request.post(`${BASE}/${room.id}/share`).set(auth(owner.token));
    const token = created.body.data.shareUrl.replace("/shared/", "");
    const res = await request.get(`/shared/${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("公开分享房间");
    expect(res.text).toContain(`/rooms/${room.id}`);
    expect(res.text).toContain("查看乐谱");
  });

  it("token 不存在返回 404", async () => {
    const res = await request.get("/shared/not-a-token");

    expect(res.status).toBe(404);
  });

  it("token 已过期返回 404（边界）", async () => {
    const owner = await registerAndLogin(OWNER);
    const room = await createRoom(owner.token);
    await endRoom(owner.token, room.id);

    const created = await request.post(`${BASE}/${room.id}/share`).set(auth(owner.token));
    const token = created.body.data.shareUrl.replace("/shared/", "") as string;
    await prisma.shareLink.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request.get(`/shared/${token}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /exports 静态目录", () => {
  it("路径穿越请求返回 404", async () => {
    const res = await request.get("/exports/%2e%2e/%2e%2e/package.json");

    expect(res.status).toBe(404);
  });
});

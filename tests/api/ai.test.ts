import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import supertest from "supertest";
import { createApp } from "../../backend/src/index";
import prisma from "../../backend/src/lib/prisma";

// 测试环境未配置 LLM_*（setup.ts 不注入、.env 中为空），getProvider() 返回 null。
// 本文件覆盖 AI 接口的鉴权 / 参数校验 / 房间权限 / 规则检查 / LLM 缺失降级路径。
const request = supertest(createApp());
const BASE = "/api/v1/ai";
const AUTH_BASE = "/api/v1/auth";
const ROOMS_BASE = "/api/v1/rooms";

const PLAYER = { username: "ai_player_01", password: "Passw0rd123" };
const OTHER = { username: "ai_player_02", password: "Passw0rd123" };

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

async function createRoom(token: string, name = "AI 测试房间"): Promise<string> {
  const res = await request.post(ROOMS_BASE).set(auth(token)).send({ name, isPublic: true });
  return res.body.data.id as string;
}

beforeAll(() => {
  // 预期内的 4xx/5xx 会触发错误中间件打印堆栈，keep 测试输出干净
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

beforeEach(async () => {
  await prisma.job.deleteMany({});
  await prisma.roomMember.deleteMany({});
  await prisma.track.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

describe("POST /api/v1/ai/compose 提交智能编曲任务", () => {
  it("未登录提交返回 401 未登录", async () => {
    const res = await request
      .post(`${BASE}/compose`)
      .send({ instruction: "加一段鼓点", roomId: "any-room" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "未登录", data: null });
    expect(await prisma.job.count()).toBe(0);
  });

  it("缺少 instruction 返回 400 且消息匹配", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request.post(`${BASE}/compose`).set(auth(token)).send({ roomId: "any-room" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
    expect(res.body.msg).toContain("instruction 不能为空");
    expect(res.body.data).toBeNull();
  });

  it("instruction 超过 500 字符返回 400（边界）", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(`${BASE}/compose`)
      .set(auth(token))
      .send({ roomId: "any-room", instruction: "x".repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.msg).toContain("instruction 不能超过 500 字符");
  });

  it("房间不存在返回 404 房间不存在", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(`${BASE}/compose`)
      .set(auth(token))
      .send({ roomId: "not-exists", instruction: "加一段鼓点" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, msg: "房间不存在", data: null });
  });

  it("非房间成员提交返回 403 不是房间成员", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const roomId = await createRoom(owner.token);

    const res = await request
      .post(`${BASE}/compose`)
      .set(auth(other.token))
      .send({ roomId, instruction: "加一段鼓点" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 403, msg: "不是房间成员", data: null });
    expect(await prisma.job.count()).toBe(0);
  });

  it("空房间提交成功：job 落库，payload 含默认 bpm=120 与空轨道上下文", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const roomId = await createRoom(token);

    const res = await request
      .post(`${BASE}/compose`)
      .set(auth(token))
      .send({ roomId, instruction: "加一段鼓点" });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(typeof res.body.data.jobId).toBe("string");

    const job = await prisma.job.findUniqueOrThrow({ where: { id: res.body.data.jobId } });
    expect(job.type).toBe("ai-compose");
    expect(job.status).toBe("pending");
    const payload = job.payload as {
      instruction: string;
      bpm: number;
      roomId: string;
      existingTracksContext: string;
    };
    expect(payload.instruction).toBe("加一段鼓点");
    expect(payload.bpm).toBe(120);
    expect(payload.roomId).toBe(roomId);
    expect(payload.existingTracksContext).toBe("（当前房间还没有轨道）");
  });

  it("已有轨道时 existingTracksContext 汇总轨道名与乐器类型，bpm 透传", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const roomId = await createRoom(token);
    await prisma.track.create({
      data: { roomId, name: "Piano 1", instrumentType: "piano", position: 0 },
    });

    const res = await request
      .post(`${BASE}/compose`)
      .set(auth(token))
      .send({ roomId, instruction: "加一段鼓点", bpm: 90 });

    expect(res.status).toBe(200);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: res.body.data.jobId } });
    const payload = job.payload as { bpm: number; existingTracksContext: string };
    expect(payload.bpm).toBe(90);
    expect(payload.existingTracksContext).toBe("- Piano 1（piano）");
  });
});

describe("GET /api/v1/ai/compose/:jobId 轮询编曲任务", () => {
  it("未登录轮询返回 401", async () => {
    const res = await request.get(`${BASE}/compose/some-job-id`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "未登录", data: null });
  });

  it("任务不存在返回 404 任务不存在", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request.get(`${BASE}/compose/not-exists`).set(auth(token));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, msg: "任务不存在", data: null });
  });

  it("查询已提交任务返回完整状态结构", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const roomId = await createRoom(token);
    const created = await request
      .post(`${BASE}/compose`)
      .set(auth(token))
      .send({ roomId, instruction: "加一段鼓点" });

    const res = await request
      .get(`${BASE}/compose/${created.body.data.jobId}`)
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.body.data.jobId);
    expect(res.body.data.type).toBe("ai-compose");
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.result).toBeNull();
    expect(res.body.data.error).toBeNull();
  });
});

describe("POST /api/v1/ai/ask 乐理问答", () => {
  it("未登录提问返回 401", async () => {
    const res = await request.post(`${BASE}/ask`).send({ question: "Cmaj7 是什么" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "未登录", data: null });
  });

  it("空问题返回 400", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request.post(`${BASE}/ask`).set(auth(token)).send({ question: "   " });

    expect(res.status).toBe(400);
    expect(res.body.msg).toContain("question 不能为空");
  });

  it("命中知识库：Cmaj7 是什么 → source=knowledge-base 且答案含组成音", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request.post(`${BASE}/ask`).set(auth(token)).send({ question: "Cmaj7 是什么" });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe("knowledge-base");
    expect(res.body.data.answer).toContain("Cmaj7");
    expect(res.body.data.answer).toContain("C、E、G、B");
  });

  it("知识库未命中且未配置 LLM：返回 503 友好提示", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(`${BASE}/ask`)
      .set(auth(token))
      .send({ question: "怎么做红烧肉好吃" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ code: 503, msg: "AI 服务暂不可用，请稍后再试", data: null });
  });
});

const VALID_NOTE = { pitch: 60, startTimeTicks: 0, durationTicks: 480, velocity: 100 };
const VALID_TRACK = { name: "Piano 1", instrumentType: "piano", notes: [VALID_NOTE] };

describe("POST /api/v1/ai/check 规则检查", () => {
  it("未登录返回 401", async () => {
    const res = await request.post(`${BASE}/check`).send({ tracks: [VALID_TRACK] });

    expect(res.status).toBe(401);
  });

  it("tracks 为空数组返回 400（边界）", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request.post(`${BASE}/check`).set(auth(token)).send({ tracks: [] });

    expect(res.status).toBe(400);
    expect(res.body.msg).toContain("tracks 不能为空");
  });

  it("合法轨道返回空 issues", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request.post(`${BASE}/check`).set(auth(token)).send({ tracks: [VALID_TRACK] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 0, msg: "ok", data: { issues: [] } });
  });

  it("pitch=150 返回 pitch-out-of-range 问题", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(`${BASE}/check`)
      .set(auth(token))
      .send({ tracks: [{ ...VALID_TRACK, notes: [{ ...VALID_NOTE, pitch: 150 }] }] });

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toHaveLength(1);
    const issue = res.body.data.issues[0];
    expect(issue.type).toBe("pitch-out-of-range");
    expect(issue.message).toContain("150");
    expect(issue.message).toContain("0-127");
    expect(issue.trackName).toBe("Piano 1");
    expect(issue.noteIndex).toBe(0);
    expect(issue.suggestion).toContain("0-127");
  });

  it("pitch=30 返回 pitch-out-of-register 问题", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(`${BASE}/check`)
      .set(auth(token))
      .send({ tracks: [{ ...VALID_TRACK, notes: [{ ...VALID_NOTE, pitch: 30 }] }] });

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toHaveLength(1);
    expect(res.body.data.issues[0].type).toBe("pitch-out-of-register");
    expect(res.body.data.issues[0].message).toContain("30");
  });

  it("durationTicks=240 返回 duration-too-short 问题", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(`${BASE}/check`)
      .set(auth(token))
      .send({ tracks: [{ ...VALID_TRACK, notes: [{ ...VALID_NOTE, durationTicks: 240 }] }] });

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toHaveLength(1);
    expect(res.body.data.issues[0].type).toBe("duration-too-short");
    expect(res.body.data.issues[0].message).toContain("240");
  });

  it("velocity=0 返回 velocity-out-of-range 问题", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(`${BASE}/check`)
      .set(auth(token))
      .send({ tracks: [{ ...VALID_TRACK, notes: [{ ...VALID_NOTE, velocity: 0 }] }] });

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toHaveLength(1);
    expect(res.body.data.issues[0].type).toBe("velocity-out-of-range");
  });

  it("同轨道音符时间重叠返回 notes-overlap 问题", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(`${BASE}/check`)
      .set(auth(token))
      .send({
        tracks: [
          {
            ...VALID_TRACK,
            notes: [
              { ...VALID_NOTE, id: "n1", pitch: 60, startTimeTicks: 0 },
              { ...VALID_NOTE, id: "n2", pitch: 64, startTimeTicks: 240 },
            ],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toHaveLength(1);
    const issue = res.body.data.issues[0];
    expect(issue.type).toBe("notes-overlap");
    expect(issue.noteId).toBe("n2");
    expect(issue.message).toContain("重叠");
  });
});

const FIX_ISSUE = {
  trackId: "t1",
  trackName: "Piano 1",
  type: "pitch-out-of-range",
  message: "第 1 个音符音高 150 超出 MIDI 范围（0-127）",
  suggestion: "将音高调整到 0-127 之间",
};

const FIX_TRACK = {
  id: "t1",
  name: "Piano 1",
  instrumentType: "piano",
  color: "#3b82f6",
  notes: [{ id: "n1", pitch: 150, startTimeTicks: 0, durationTicks: 480, velocity: 100 }],
};

describe("POST /api/v1/ai/fix 提交自动修复任务", () => {
  it("未登录提交返回 401", async () => {
    const res = await request
      .post(`${BASE}/fix`)
      .send({ roomId: "any", tracks: [FIX_TRACK], issues: [FIX_ISSUE] });

    expect(res.status).toBe(401);
  });

  it("issues 为空数组返回 400（边界）", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(`${BASE}/fix`)
      .set(auth(token))
      .send({ roomId: "any", tracks: [FIX_TRACK], issues: [] });

    expect(res.status).toBe(400);
    expect(res.body.msg).toContain("issues 不能为空");
  });

  it("房间不存在返回 404", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request
      .post(`${BASE}/fix`)
      .set(auth(token))
      .send({ roomId: "not-exists", tracks: [FIX_TRACK], issues: [FIX_ISSUE] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, msg: "房间不存在", data: null });
  });

  it("非房间成员提交返回 403", async () => {
    const owner = await registerAndLogin(PLAYER);
    const other = await registerAndLogin(OTHER);
    const roomId = await createRoom(owner.token);

    const res = await request
      .post(`${BASE}/fix`)
      .set(auth(other.token))
      .send({ roomId, tracks: [FIX_TRACK], issues: [FIX_ISSUE] });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 403, msg: "不是房间成员", data: null });
  });

  it("提交成功：job 落库且结构化 issues 展开为文本行", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const roomId = await createRoom(token);

    const res = await request
      .post(`${BASE}/fix`)
      .set(auth(token))
      .send({ roomId, tracks: [FIX_TRACK], issues: [FIX_ISSUE] });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.jobId).toBe("string");

    const job = await prisma.job.findUniqueOrThrow({ where: { id: res.body.data.jobId } });
    expect(job.type).toBe("ai-fix");
    expect(job.status).toBe("pending");
    const payload = job.payload as { roomId: string; issues: string[]; tracks: unknown[] };
    expect(payload.roomId).toBe(roomId);
    expect(payload.tracks).toHaveLength(1);
    expect(payload.issues).toEqual([
      "[pitch-out-of-range] 轨道「Piano 1」：第 1 个音符音高 150 超出 MIDI 范围（0-127）（建议：将音高调整到 0-127 之间）",
    ]);
  });
});

describe("GET /api/v1/ai/fix/:jobId 轮询修复任务", () => {
  it("未登录轮询返回 401", async () => {
    const res = await request.get(`${BASE}/fix/some-job-id`);

    expect(res.status).toBe(401);
  });

  it("任务不存在返回 404 任务不存在", async () => {
    const { token } = await registerAndLogin(PLAYER);

    const res = await request.get(`${BASE}/fix/not-exists`).set(auth(token));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, msg: "任务不存在", data: null });
  });
});

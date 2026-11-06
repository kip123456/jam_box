import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

// mock LLM provider：不依赖真实网络与密钥，可控地构造成功 / 失败 / 非法输出
const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  generateJSON: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock("../../backend/src/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../backend/src/lib/llm")>();
  return {
    ...actual,
    getProvider: (...args: unknown[]) => mocks.getProvider(...args),
  };
});

import { createApp } from "../../backend/src/index";
import prisma from "../../backend/src/lib/prisma";
import { LLMError } from "../../backend/src/lib/llm";
import { registerHandler } from "../../backend/src/queues/handlers";
import { composeHandler, fixHandler } from "../../backend/src/queues/handlers/aiHandlers";
import { runJob } from "../../backend/src/queues/worker";

const request = supertest(createApp());
const BASE = "/api/v1/ai";
const AUTH_BASE = "/api/v1/auth";
const ROOMS_BASE = "/api/v1/rooms";

const PLAYER = { username: "llm_player_01", password: "Passw0rd123" };

const VALID_AI_RESULT = {
  tracks: [
    {
      name: "AI Drums",
      instrumentType: "drums",
      color: "#f97316",
      notes: [
        { pitch: 36, startTimeTicks: 0, durationTicks: 480, velocity: 100 },
        { pitch: 38, startTimeTicks: 480, durationTicks: 480, velocity: 90 },
      ],
    },
    {
      name: "AI Bass",
      instrumentType: "bass",
      color: "#10b981",
      notes: [{ pitch: 40, startTimeTicks: 0, durationTicks: 960, velocity: 90 }],
    },
  ],
};

const PITCH_150_RESULT = {
  tracks: [
    {
      name: "AI Piano",
      instrumentType: "piano",
      color: "#3b82f6",
      notes: [{ pitch: 150, startTimeTicks: 0, durationTicks: 480, velocity: 100 }],
    },
  ],
};

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

async function createRoom(token: string, name = "LLM 测试房间"): Promise<string> {
  const res = await request.post(ROOMS_BASE).set(auth(token)).send({ name, isPublic: true });
  return res.body.data.id as string;
}

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  // registerAll() 内部用 CJS require 懒注册，vitest ESM 下直接注册更稳
  registerHandler("ai-compose", composeHandler);
  registerHandler("ai-fix", fixHandler);
});

beforeEach(async () => {
  mocks.generate.mockReset();
  mocks.generateJSON.mockReset();
  mocks.getProvider.mockReset();
  mocks.getProvider.mockReturnValue({
    generate: mocks.generate,
    generateJSON: mocks.generateJSON,
  });
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

describe("POST /api/v1/ai/ask LLM 兜底", () => {
  it("知识库未命中时走 LLM：source=llm 且透传问题", async () => {
    const { token } = await registerAndLogin(PLAYER);
    mocks.generate.mockResolvedValue("红烧肉要小火慢炖，收汁前加盐。你想了解哪种做法？");

    const res = await request
      .post(`${BASE}/ask`)
      .set(auth(token))
      .send({ question: "怎么做红烧肉好吃" });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe("llm");
    expect(res.body.data.answer).toContain("红烧肉");

    expect(mocks.generate).toHaveBeenCalledTimes(1);
    const messages = mocks.generate.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[1]).toEqual({ role: "user", content: "怎么做红烧肉好吃" });
  });

  it("LLM 调用失败：返回 503 通用文案，不泄露上游错误细节", async () => {
    const { token } = await registerAndLogin(PLAYER);
    mocks.generate.mockRejectedValue(new LLMError("LLM 服务返回 500; upstream detail sk-live-key"));

    const res = await request
      .post(`${BASE}/ask`)
      .set(auth(token))
      .send({ question: "怎么做红烧肉好吃" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ code: 503, msg: "AI 服务暂不可用，请稍后再试", data: null });
    expect(res.body.msg).not.toContain("500");
    expect(res.body.msg).not.toContain("sk-live-key");
  });
});

describe("ai-compose 任务全链路（提交 → 执行 → 轮询）", () => {
  it("LLM 返回合法轨道：job 最终 success，result.tracks 结构完整", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const roomId = await createRoom(token);
    mocks.generateJSON.mockResolvedValue(VALID_AI_RESULT);

    const created = await request
      .post(`${BASE}/compose`)
      .set(auth(token))
      .send({ roomId, instruction: "加一段鼓点" });
    expect(created.status).toBe(200);
    const jobId = created.body.data.jobId as string;

    await runJob(jobId);

    const res = await request.get(`${BASE}/compose/${jobId}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("success");
    expect(res.body.data.error).toBeNull();
    expect(res.body.data.result.tracks).toHaveLength(2);
    expect(res.body.data.result.tracks[0]).toMatchObject({
      name: "AI Drums",
      instrumentType: "drums",
      color: "#f97316",
    });
    expect(res.body.data.result.tracks[0].notes).toHaveLength(2);
    expect(res.body.data.result.tracks[0].notes[0]).toEqual({
      pitch: 36,
      startTimeTicks: 0,
      durationTicks: 480,
      velocity: 100,
    });

    // handler 收到的 user 消息即原始 instruction
    const messages = mocks.generateJSON.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1]).toEqual({ role: "user", content: "加一段鼓点" });
  });

  it("LLM 返回 pitch=150：业务校验拦截，job 最终 failed 且错误不含原始输出", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const roomId = await createRoom(token);
    mocks.generateJSON.mockResolvedValue(PITCH_150_RESULT);

    const created = await request
      .post(`${BASE}/compose`)
      .set(auth(token))
      .send({ roomId, instruction: "加一段鼓点" });
    const jobId = created.body.data.jobId as string;
    // 让失败一次到位：retryCount 置为 maxRetries，runJob 后直接 failed
    await prisma.job.update({ where: { id: jobId }, data: { retryCount: 3, maxRetries: 3 } });

    await runJob(jobId);

    const res = await request.get(`${BASE}/compose/${jobId}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("failed");
    expect(res.body.data.result).toBeNull();
    const error = res.body.data.error as string;
    expect(error).toContain("业务校验");
    expect(error).toContain("pitch 150");
    // 错误信息只含校验摘要，不含 LLM 原始 JSON 输出
    expect(error).not.toContain("```");
    expect(error).not.toContain('"tracks"');
    expect(error).not.toContain('"pitch":150');
  });
});

describe("ai-fix 任务全链路（提交 → 执行 → 轮询）", () => {
  const FIX_TRACK = {
    id: "t1",
    name: "Piano 1",
    instrumentType: "piano",
    color: "#3b82f6",
    notes: [{ id: "n1", pitch: 150, startTimeTicks: 0, durationTicks: 480, velocity: 100 }],
  };
  const FIX_ISSUE = {
    trackId: "t1",
    trackName: "Piano 1",
    type: "pitch-out-of-range",
    message: "第 1 个音符音高 150 超出 MIDI 范围（0-127）",
    suggestion: "将音高调整到 0-127 之间",
  };

  it("LLM 修复成功：job success，修复结果保留轨道与音符 id", async () => {
    const { token } = await registerAndLogin(PLAYER);
    const roomId = await createRoom(token);
    mocks.generateJSON.mockResolvedValue({
      tracks: [
        {
          id: "t1",
          name: "Piano 1",
          instrumentType: "piano",
          color: "#3b82f6",
          notes: [{ id: "n1", pitch: 72, startTimeTicks: 0, durationTicks: 480, velocity: 100 }],
        },
      ],
    });

    const created = await request
      .post(`${BASE}/fix`)
      .set(auth(token))
      .send({ roomId, tracks: [FIX_TRACK], issues: [FIX_ISSUE] });
    expect(created.status).toBe(200);
    const jobId = created.body.data.jobId as string;

    await runJob(jobId);

    const res = await request.get(`${BASE}/fix/${jobId}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("success");
    expect(res.body.data.error).toBeNull();
    expect(res.body.data.result.tracks).toHaveLength(1);
    expect(res.body.data.result.tracks[0].id).toBe("t1");
    expect(res.body.data.result.tracks[0].notes[0].id).toBe("n1");
    expect(res.body.data.result.tracks[0].notes[0].pitch).toBe(72);

    // issues 文本渲染进了 system prompt
    const messages = mocks.generateJSON.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("pitch-out-of-range");
    expect(messages[0].content).toContain("Piano 1");
  });
});

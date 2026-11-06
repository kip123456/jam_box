import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// mock LLM provider：单测只关心 handler 的业务校验与错误处理，不依赖真实 LLM
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

import { composeHandler, fixHandler } from "../../backend/src/queues/handlers/aiHandlers";

const COMPOSE_PAYLOAD = {
  instruction: "加一段鼓点",
  existingTracksContext: "（当前房间还没有轨道）",
  bpm: 120,
  roomId: "room-1",
};

const VALID_AI_RESULT = {
  tracks: [
    {
      name: "AI Drums",
      instrumentType: "drums",
      color: "#f97316",
      notes: [{ pitch: 36, startTimeTicks: 0, durationTicks: 480, velocity: 100 }],
    },
  ],
};

const FIX_PAYLOAD = {
  roomId: "room-1",
  tracks: [
    {
      id: "t1",
      name: "Piano 1",
      instrumentType: "piano",
      color: "#3b82f6",
      notes: [{ id: "n1", pitch: 150, startTimeTicks: 0, durationTicks: 480, velocity: 100 }],
    },
  ],
  issues: [
    "[pitch-out-of-range] 轨道「Piano 1」：第 1 个音符音高 150 超出 MIDI 范围（0-127）（建议：将音高调整到 0-127 之间）",
  ],
};

function trackWith(note: Record<string, unknown>, track: Record<string, unknown> = {}) {
  return {
    tracks: [
      {
        name: "AI Piano",
        instrumentType: "piano",
        color: "#3b82f6",
        notes: [{ pitch: 60, startTimeTicks: 0, durationTicks: 480, velocity: 100, ...note }],
        ...track,
      },
    ],
  };
}

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

beforeEach(() => {
  mocks.generate.mockReset();
  mocks.generateJSON.mockReset();
  mocks.getProvider.mockReset();
  mocks.getProvider.mockReturnValue({
    generate: mocks.generate,
    generateJSON: mocks.generateJSON,
  });
});

describe("composeHandler 业务校验", () => {
  it("未配置 LLM（provider=null）抛出友好错误", async () => {
    mocks.getProvider.mockReturnValue(null);

    await expect(composeHandler(COMPOSE_PAYLOAD)).rejects.toThrow("AI 服务暂不可用：未配置 LLM");
    expect(mocks.generateJSON).not.toHaveBeenCalled();
  });

  it("LLM 返回合法轨道：原样返回 tracks，prompt 渲染 instruction 与 bpm", async () => {
    mocks.generateJSON.mockResolvedValue(VALID_AI_RESULT);

    const result = await composeHandler(COMPOSE_PAYLOAD);

    expect(result).toEqual(VALID_AI_RESULT);
    const messages = mocks.generateJSON.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("加一段鼓点");
    expect(messages[0].content).toContain("120");
    expect(messages[1]).toEqual({ role: "user", content: "加一段鼓点" });
  });

  it("pitch=150 被拦截，错误含校验摘要且不含原始 JSON 输出", async () => {
    mocks.generateJSON.mockResolvedValue(trackWith({ pitch: 150 }));

    const err = await composeHandler(COMPOSE_PAYLOAD).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain("业务校验");
    expect(message).toContain("pitch 150 超出 0-127");
    expect(message).toContain("AI Piano");
    expect(message).not.toContain("```");
    expect(message).not.toContain('"tracks"');
    expect(message).not.toContain('"pitch":150');
  });

  it("durationTicks=240 被拦截", async () => {
    mocks.generateJSON.mockResolvedValue(trackWith({ durationTicks: 240 }));

    await expect(composeHandler(COMPOSE_PAYLOAD)).rejects.toThrow(
      "durationTicks 240 小于最小值 480"
    );
  });

  it("velocity=200 被拦截", async () => {
    mocks.generateJSON.mockResolvedValue(trackWith({ velocity: 200 }));

    await expect(composeHandler(COMPOSE_PAYLOAD)).rejects.toThrow("velocity 200 超出 0-127");
  });

  it("startTimeTicks 为负数被拦截", async () => {
    mocks.generateJSON.mockResolvedValue(trackWith({ startTimeTicks: -480 }));

    await expect(composeHandler(COMPOSE_PAYLOAD)).rejects.toThrow(
      "startTimeTicks -480 不能为负数"
    );
  });

  it("instrumentType 不在枚举内被拦截", async () => {
    mocks.generateJSON.mockResolvedValue(trackWith({}, { instrumentType: "violin" }));

    await expect(composeHandler(COMPOSE_PAYLOAD)).rejects.toThrow(
      'instrumentType "violin" 不在允许枚举内'
    );
  });

  it("color 非十六进制被拦截", async () => {
    mocks.generateJSON.mockResolvedValue(trackWith({}, { color: "blue" }));

    await expect(composeHandler(COMPOSE_PAYLOAD)).rejects.toThrow(
      'color "blue" 不是合法的十六进制颜色'
    );
  });
});

describe("fixHandler 业务校验", () => {
  it("未配置 LLM（provider=null）抛出友好错误", async () => {
    mocks.getProvider.mockReturnValue(null);

    await expect(fixHandler(FIX_PAYLOAD)).rejects.toThrow("AI 服务暂不可用：未配置 LLM");
  });

  it("修复结果保留轨道与音符 id，issues 渲染进 prompt", async () => {
    const fixed = {
      tracks: [
        {
          id: "t1",
          name: "Piano 1",
          instrumentType: "piano",
          color: "#3b82f6",
          notes: [{ id: "n1", pitch: 72, startTimeTicks: 0, durationTicks: 480, velocity: 100 }],
        },
      ],
    };
    mocks.generateJSON.mockResolvedValue(fixed);

    const result = await fixHandler(FIX_PAYLOAD);

    expect(result).toEqual(fixed);
    const messages = mocks.generateJSON.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("pitch-out-of-range");
    expect(messages[0].content).toContain("150");
    expect(messages[1]).toEqual({ role: "user", content: "请修复以上轨道并返回完整 JSON。" });
  });

  it("修复结果 velocity=200 仍被业务校验拦截", async () => {
    mocks.generateJSON.mockResolvedValue({
      tracks: [
        {
          id: "t1",
          name: "Piano 1",
          instrumentType: "piano",
          color: "#3b82f6",
          notes: [{ id: "n1", pitch: 72, startTimeTicks: 0, durationTicks: 480, velocity: 200 }],
        },
      ],
    });

    const err = await fixHandler(FIX_PAYLOAD).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain("修复结果未通过业务校验");
    expect(message).toContain("velocity 200 超出 0-127");
  });
});

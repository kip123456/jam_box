import { describe, expect, it } from "vitest";
import {
  bulkCreateNotesSchema,
  bulkDeleteNotesSchema,
  bulkUpdateNotesSchema,
  createNoteSchema,
  updateNoteSchema,
} from "../../backend/src/zod/note";

const PITCH_ERROR = "音高必须在 0-127 之间";
const START_ERROR = "开始时间必须 ≥ 0";
const DURATION_ERROR = "音符时长至少 480 ticks";
const VELOCITY_ERROR = "力度必须在 0-127 之间";

describe("createNoteSchema", () => {
  it("合法音符：velocity 缺省为 100", () => {
    const parsed = createNoteSchema.safeParse({
      pitch: 60,
      startTimeTicks: 0,
      durationTicks: 480,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.velocity).toBe(100);
  });

  it("pitch 0 / 127、velocity 0 / 127、durationTicks 480 为合法边界", () => {
    const low = createNoteSchema.safeParse({
      pitch: 0,
      startTimeTicks: 0,
      durationTicks: 480,
      velocity: 0,
    });
    const high = createNoteSchema.safeParse({
      pitch: 127,
      startTimeTicks: 960,
      durationTicks: 480,
      velocity: 127,
    });

    expect(low.success).toBe(true);
    expect(high.success).toBe(true);
  });

  it("pitch 超出 0-127 返回 spec 指定错误信息", () => {
    for (const pitch of [-1, 128]) {
      const parsed = createNoteSchema.safeParse({
        pitch,
        startTimeTicks: 0,
        durationTicks: 480,
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(parsed.error.issues[0].message).toBe(PITCH_ERROR);
    }
  });

  it("pitch 非整数返回「音高必须是整数」", () => {
    const parsed = createNoteSchema.safeParse({
      pitch: 60.5,
      startTimeTicks: 0,
      durationTicks: 480,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toBe("音高必须是整数");
  });

  it("startTimeTicks 为负、durationTicks 小于 480、velocity 超界分别返回错误", () => {
    const negativeStart = createNoteSchema.safeParse({
      pitch: 60,
      startTimeTicks: -1,
      durationTicks: 480,
    });
    const shortDuration = createNoteSchema.safeParse({
      pitch: 60,
      startTimeTicks: 0,
      durationTicks: 479,
    });
    const badVelocity = createNoteSchema.safeParse({
      pitch: 60,
      startTimeTicks: 0,
      durationTicks: 480,
      velocity: 128,
    });

    expect(negativeStart.success).toBe(false);
    expect(shortDuration.success).toBe(false);
    expect(badVelocity.success).toBe(false);
    if (!negativeStart.success)
      expect(negativeStart.error.issues[0].message).toBe(START_ERROR);
    if (!shortDuration.success)
      expect(shortDuration.error.issues[0].message).toBe(DURATION_ERROR);
    if (!badVelocity.success) expect(badVelocity.error.issues[0].message).toBe(VELOCITY_ERROR);
  });
});

describe("bulkCreateNotesSchema", () => {
  it("数组内任意一个音符非法时整体失败", () => {
    const parsed = bulkCreateNotesSchema.safeParse([
      { pitch: 60, startTimeTicks: 0, durationTicks: 480 },
      { pitch: 200, startTimeTicks: 480, durationTicks: 480 },
    ]);

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toBe(PITCH_ERROR);
  });

  it("空数组与非数组均失败", () => {
    const empty = bulkCreateNotesSchema.safeParse([]);
    const notArray = bulkCreateNotesSchema.safeParse({ pitch: 60, startTimeTicks: 0, durationTicks: 480 });

    expect(empty.success).toBe(false);
    expect(notArray.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0].message).toBe("至少需要一个音符");
    if (!notArray.success) expect(notArray.error.issues[0].message).toBe("notes 必须是数组");
  });
});

describe("bulkUpdateNotesSchema", () => {
  it("缺少 id 返回「音符 id 不能为空」", () => {
    const parsed = bulkUpdateNotesSchema.safeParse([{ pitch: 60 }]);

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toBe("音符 id 不能为空");
  });

  it("空数组失败，单条部分更新成功", () => {
    const empty = bulkUpdateNotesSchema.safeParse([]);
    const partial = bulkUpdateNotesSchema.safeParse([{ id: "note_1", pitch: 64 }]);

    expect(empty.success).toBe(false);
    expect(partial.success).toBe(true);
  });
});

describe("updateNoteSchema", () => {
  it("允许部分更新，且不接受 id 字段", () => {
    const parsed = updateNoteSchema.safeParse({ pitch: 64, velocity: 20 });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ pitch: 64, velocity: 20 });
  });

  it("非法 durationTicks 返回错误信息", () => {
    const parsed = updateNoteSchema.safeParse({ durationTicks: 100 });

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toBe(DURATION_ERROR);
  });
});

describe("bulkDeleteNotesSchema", () => {
  it("空 noteIds 返回「noteIds 不能为空」", () => {
    const parsed = bulkDeleteNotesSchema.safeParse({ noteIds: [] });

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toBe("noteIds 不能为空");
  });

  it("合法 id 列表通过", () => {
    const parsed = bulkDeleteNotesSchema.safeParse({ noteIds: ["a", "b"] });

    expect(parsed.success).toBe(true);
  });
});

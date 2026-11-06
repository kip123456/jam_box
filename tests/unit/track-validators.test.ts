import { describe, expect, it } from "vitest";
import {
  INSTRUMENT_TYPES,
  createTrackSchema,
  updateTrackSchema,
} from "../../backend/src/zod/track";

const NAME_ERROR = "轨道名长度必须在 1-50 字符之间";
const INSTRUMENT_ERROR = "不支持的乐器类型";
const COLOR_ERROR = "颜色必须是十六进制格式（如 #3b82f6）";

describe("createTrackSchema", () => {
  it("四种乐器类型均合法", () => {
    for (const instrumentType of INSTRUMENT_TYPES) {
      const parsed = createTrackSchema.safeParse({ name: "轨道", instrumentType });
      expect(parsed.success).toBe(true);
    }
  });

  it("轨道名 0 / 1 / 50 / 51 字符边界", () => {
    const empty = createTrackSchema.safeParse({ name: "", instrumentType: "piano" });
    const one = createTrackSchema.safeParse({ name: "a", instrumentType: "piano" });
    const fifty = createTrackSchema.safeParse({ name: "a".repeat(50), instrumentType: "piano" });
    const tooLong = createTrackSchema.safeParse({
      name: "a".repeat(51),
      instrumentType: "piano",
    });

    expect(empty.success).toBe(false);
    expect(one.success).toBe(true);
    expect(fifty.success).toBe(true);
    expect(tooLong.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0].message).toBe(NAME_ERROR);
    if (!tooLong.success) expect(tooLong.error.issues[0].message).toBe(NAME_ERROR);
  });

  it("轨道名会 trim 后再校验", () => {
    const parsed = createTrackSchema.safeParse({ name: "  键盘  ", instrumentType: "piano" });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe("键盘");
  });

  it("非法乐器类型返回 spec 指定错误信息", () => {
    const parsed = createTrackSchema.safeParse({ name: "小提琴", instrumentType: "violin" });

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toBe(INSTRUMENT_ERROR);
  });

  it("颜色必须是 6 位十六进制，缺省时允许", () => {
    const missing = createTrackSchema.safeParse({ name: "钢琴", instrumentType: "piano" });
    const valid = createTrackSchema.safeParse({
      name: "钢琴",
      instrumentType: "piano",
      color: "#3b82F6",
    });
    const invalid = createTrackSchema.safeParse({
      name: "钢琴",
      instrumentType: "piano",
      color: "red",
    });
    const shortHex = createTrackSchema.safeParse({
      name: "钢琴",
      instrumentType: "piano",
      color: "#12345",
    });

    expect(missing.success).toBe(true);
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(shortHex.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues[0].message).toBe(COLOR_ERROR);
    if (!shortHex.success) expect(shortHex.error.issues[0].message).toBe(COLOR_ERROR);
  });
});

describe("updateTrackSchema", () => {
  it("允许部分字段更新，position 0 为合法下界", () => {
    const parsed = updateTrackSchema.safeParse({ solo: true, position: 0 });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ solo: true, position: 0 });
    }
  });

  it("position 为负返回 spec 指定错误信息", () => {
    const parsed = updateTrackSchema.safeParse({ position: -1 });

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toBe("position 不能为负数");
  });

  it("非法颜色返回错误信息", () => {
    const parsed = updateTrackSchema.safeParse({ color: "#GGGGGG" });

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toBe(COLOR_ERROR);
  });

  it("instrumentType / roomId 不可修改：未知字段被剥离", () => {
    const parsed = updateTrackSchema.safeParse({ instrumentType: "drums", roomId: "hack" });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({});
      expect("instrumentType" in parsed.data).toBe(false);
      expect("roomId" in parsed.data).toBe(false);
    }
  });
});

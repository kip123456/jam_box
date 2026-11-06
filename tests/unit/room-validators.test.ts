import { describe, expect, it } from "vitest";
import { createRoomSchema, joinRoomSchema } from "../../backend/src/zod/room";

const NAME_ERROR = "房间名长度必须在 1-50 字符之间";
const PASSWORD_ERROR = "私有房间密码长度必须在 8-32 位之间";

describe("createRoomSchema", () => {
  it("公开房间：合法房间名通过并默认 isPublic=true", () => {
    const parsed = createRoomSchema.safeParse({ name: "我的乐队" });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isPublic).toBe(true);
    }
  });

  it("房间名 1 与 50 字符为合法边界", () => {
    const one = createRoomSchema.safeParse({ name: "a", isPublic: true });
    const fifty = createRoomSchema.safeParse({ name: "a".repeat(50), isPublic: true });

    expect(one.success).toBe(true);
    expect(fifty.success).toBe(true);
  });

  it("房间名空串与 51 字符返回错误且消息与 spec 一致", () => {
    const empty = createRoomSchema.safeParse({ name: "", isPublic: true });
    const tooLong = createRoomSchema.safeParse({ name: "a".repeat(51), isPublic: true });

    expect(empty.success).toBe(false);
    expect(tooLong.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0].message).toBe(NAME_ERROR);
    if (!tooLong.success) expect(tooLong.error.issues[0].message).toBe(NAME_ERROR);
  });

  it("私有房间密码 8 与 32 字符为合法边界", () => {
    const eight = createRoomSchema.safeParse({
      name: "秘密合奏",
      isPublic: false,
      password: "a".repeat(8),
    });
    const thirtyTwo = createRoomSchema.safeParse({
      name: "秘密合奏",
      isPublic: false,
      password: "a".repeat(32),
    });

    expect(eight.success).toBe(true);
    expect(thirtyTwo.success).toBe(true);
  });

  it("私有房间缺少密码或密码长度越界返回错误", () => {
    const missing = createRoomSchema.safeParse({ name: "秘密合奏", isPublic: false });
    const tooShort = createRoomSchema.safeParse({
      name: "秘密合奏",
      isPublic: false,
      password: "a".repeat(7),
    });
    const tooLong = createRoomSchema.safeParse({
      name: "秘密合奏",
      isPublic: false,
      password: "a".repeat(33),
    });

    expect(missing.success).toBe(false);
    expect(tooShort.success).toBe(false);
    expect(tooLong.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0].message).toBe(PASSWORD_ERROR);
    if (!tooShort.success) expect(tooShort.error.issues[0].message).toBe(PASSWORD_ERROR);
    if (!tooLong.success) expect(tooLong.error.issues[0].message).toBe(PASSWORD_ERROR);
  });

  it("缺少 name 或 isPublic 非布尔值返回错误", () => {
    const noName = createRoomSchema.safeParse({ isPublic: true });
    const badFlag = createRoomSchema.safeParse({ name: "我的乐队", isPublic: "yes" });

    expect(noName.success).toBe(false);
    expect(badFlag.success).toBe(false);
  });
});

describe("joinRoomSchema", () => {
  it("空对象（公开房间不带密码）通过", () => {
    const parsed = joinRoomSchema.safeParse({});

    expect(parsed.success).toBe(true);
  });

  it("密码 8 与 32 字符为合法边界", () => {
    expect(joinRoomSchema.safeParse({ password: "a".repeat(8) }).success).toBe(true);
    expect(joinRoomSchema.safeParse({ password: "a".repeat(32) }).success).toBe(true);
  });

  it("密码 7 与 33 字符返回错误", () => {
    const tooShort = joinRoomSchema.safeParse({ password: "a".repeat(7) });
    const tooLong = joinRoomSchema.safeParse({ password: "a".repeat(33) });

    expect(tooShort.success).toBe(false);
    expect(tooLong.success).toBe(false);
    if (!tooShort.success) expect(tooShort.error.issues[0].message).toBe(PASSWORD_ERROR);
    if (!tooLong.success) expect(tooLong.error.issues[0].message).toBe(PASSWORD_ERROR);
  });
});

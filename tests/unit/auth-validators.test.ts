import { describe, expect, it } from "vitest";
import { registerSchema, loginSchema, refreshSchema } from "../../backend/src/zod/auth";

describe("registerSchema", () => {
  it("合法输入通过并保留字段", () => {
    const result = registerSchema.parse({
      username: "alice_01",
      password: "Passw0rd123",
      email: "alice@example.com",
    });

    expect(result.username).toBe("alice_01");
    expect(result.password).toBe("Passw0rd123");
    expect(result.email).toBe("alice@example.com");
  });

  it("email 可省略（边界）", () => {
    const result = registerSchema.parse({ username: "alice_01", password: "Passw0rd123" });

    expect(result.email).toBeUndefined();
  });

  it("用户名少于 3 位被拒绝", () => {
    const parsed = registerSchema.safeParse({ username: "ab", password: "Passw0rd123" });

    expect(parsed.success).toBe(false);
    expect(parsed.success ? "" : parsed.error.issues[0].message).toBe(
      "用户名需为 3-32 位字母、数字或下划线"
    );
  });

  it("用户名超过 32 位被拒绝（边界）", () => {
    const parsed = registerSchema.safeParse({
      username: "a".repeat(33),
      password: "Passw0rd123",
    });

    expect(parsed.success).toBe(false);
  });

  it("用户名含非法字符被拒绝", () => {
    const parsed = registerSchema.safeParse({ username: "bad name", password: "Passw0rd123" });

    expect(parsed.success).toBe(false);
  });

  it("密码缺少数字被拒绝", () => {
    const parsed = registerSchema.safeParse({ username: "alice_01", password: "OnlyLetters" });

    expect(parsed.success).toBe(false);
    expect(parsed.success ? "" : parsed.error.issues[0].message).toBe(
      "密码至少 8 位且需包含字母和数字"
    );
  });

  it("密码缺少字母被拒绝", () => {
    const parsed = registerSchema.safeParse({ username: "alice_01", password: "12345678" });

    expect(parsed.success).toBe(false);
  });

  it("密码少于 8 位被拒绝（边界）", () => {
    const parsed = registerSchema.safeParse({ username: "alice_01", password: "Ab1" });

    expect(parsed.success).toBe(false);
  });

  it("非法邮箱被拒绝且消息与 spec 一致", () => {
    const parsed = registerSchema.safeParse({
      username: "alice_01",
      password: "Passw0rd123",
      email: "bad-email",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.success ? "" : parsed.error.issues[0].message).toBe("邮箱格式不正确");
  });
});

describe("loginSchema", () => {
  it("用户名与密码非空时通过", () => {
    const result = loginSchema.parse({ username: "alice_01", password: "Passw0rd123" });

    expect(result.username).toBe("alice_01");
  });

  it("空密码被拒绝（边界）", () => {
    expect(loginSchema.safeParse({ username: "alice_01", password: "" }).success).toBe(false);
  });

  it("缺少用户名被拒绝", () => {
    expect(loginSchema.safeParse({ password: "Passw0rd123" }).success).toBe(false);
  });
});

describe("refreshSchema", () => {
  it("refreshToken 非空时通过", () => {
    const result = refreshSchema.parse({ refreshToken: "token-value" });

    expect(result.refreshToken).toBe("token-value");
  });

  it("空 refreshToken 被拒绝（边界）", () => {
    expect(refreshSchema.safeParse({ refreshToken: "" }).success).toBe(false);
  });
});

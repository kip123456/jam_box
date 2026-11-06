import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import {
  hashPassword,
  comparePassword,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from "../../backend/src/lib/auth";

function decode(token: string): Record<string, unknown> {
  return jwt.decode(token) as Record<string, unknown>;
}

describe("密码哈希", () => {
  it("hashPassword 生成 cost 12 的 bcrypt 哈希且可正确比对", async () => {
    const hash = await hashPassword("Passw0rd123");

    expect(hash.startsWith("$2")).toBe(true);
    expect(hash.split("$")[2]).toBe("12");
    expect(hash).not.toContain("Passw0rd123");
    expect(await comparePassword("Passw0rd123", hash)).toBe(true);
  });

  it("明文不匹配时 comparePassword 返回 false", async () => {
    const hash = await hashPassword("Passw0rd123");

    expect(await comparePassword("WrongPass123", hash)).toBe(false);
  });
});

describe("JWT 签发与校验", () => {
  it("access token 的 payload 仅含 sub/type/iat/exp 且有效期 900 秒", () => {
    const token = signAccessToken("user-1");
    const payload = decode(token);

    expect(payload.sub).toBe("user-1");
    expect(payload.type).toBe("access");
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub", "type"]);
    expect(Number(payload.exp) - Number(payload.iat)).toBe(900);
  });

  it("refresh token 的 type 为 refresh 且有效期 604800 秒", () => {
    const token = signRefreshToken("user-1");
    const payload = decode(token);

    expect(payload.sub).toBe("user-1");
    expect(payload.type).toBe("refresh");
    expect(Number(payload.exp) - Number(payload.iat)).toBe(604800);
  });

  it("verifyToken 返回 sub 与 type", () => {
    const payload = verifyToken(signAccessToken("test"));

    expect(payload.sub).toBe("test");
    expect(payload.type).toBe("access");
  });

  it("被篡改的 token 校验失败", () => {
    const token = signAccessToken("user-1");
    const tampered = `${token.slice(0, -2)}xx`;

    expect(() => verifyToken(tampered)).toThrow(jwt.JsonWebTokenError);
  });

  it("过期 token 校验抛 TokenExpiredError", () => {
    const expired = jwt.sign({ sub: "user-1", type: "access" }, "test-secret", {
      expiresIn: -1,
    });

    expect(() => verifyToken(expired)).toThrow(jwt.TokenExpiredError);
  });
});

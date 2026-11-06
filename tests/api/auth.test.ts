import { afterAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../backend/src/index";
import prisma from "../../backend/src/lib/prisma";
import { config } from "../../backend/src/utils/env";

const request = supertest(createApp());
const BASE = "/api/v1/auth";

const VALID = {
  username: "alice_01",
  password: "Passw0rd123",
  email: "alice@example.com",
};

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** 构造指定过期时间的令牌，用于覆盖过期分支 */
function signExpired(userId: string, type: "access" | "refresh"): string {
  return jwt.sign({ sub: userId, type }, config.jwtSecret, { expiresIn: -1 });
}

function decode(token: string): Record<string, unknown> {
  return jwt.decode(token) as Record<string, unknown>;
}

async function register(overrides: Partial<typeof VALID> = {}) {
  return request.post(`${BASE}/register`).send({ ...VALID, ...overrides });
}

async function login(username = VALID.username, password = VALID.password) {
  return request.post(`${BASE}/login`).send({ username, password });
}

describe("POST /api/v1/auth/register", () => {
  it("注册成功：返回用户信息、密码以 bcrypt cost 12 哈希落库且不回传哈希", async () => {
    const res = await register();

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.msg).toBe("ok");
    expect(typeof res.body.data.id).toBe("string");
    expect(res.body.data.username).toBe(VALID.username);
    expect(res.body.data.email).toBe(VALID.email);
    expect(typeof res.body.data.createdAt).toBe("string");
    expect(res.body.data.passwordHash).toBeUndefined();

    expect(await prisma.user.count()).toBe(1);
    const stored = await prisma.user.findUnique({ where: { username: VALID.username } });
    expect(stored?.passwordHash).not.toBe(VALID.password);
    expect(stored?.passwordHash.startsWith("$2")).toBe(true);
    expect(stored?.passwordHash.split("$")[2]).toBe("12");
  });

  it("重复用户名返回 409 且消息与 spec 一致", async () => {
    await register();
    const res = await register({ email: "other@example.com" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 409, msg: "用户名已被占用", data: null });
    expect(await prisma.user.count()).toBe(1);
  });

  it("邮箱格式不正确返回 400", async () => {
    const res = await register({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
    expect(res.body.msg).toBe("邮箱格式不正确");
    expect(res.body.data).toBeNull();
    expect(await prisma.user.count()).toBe(0);
  });

  it("密码不含数字返回 400 且消息与 spec 一致", async () => {
    const res = await register({ password: "OnlyLetters" });

    expect(res.status).toBe(400);
    expect(res.body.msg).toBe("密码至少 8 位且需包含字母和数字");
    expect(await prisma.user.count()).toBe(0);
  });

  it("密码少于 8 位返回 400（边界）", async () => {
    const res = await register({ password: "Ab1" });

    expect(res.status).toBe(400);
    expect(res.body.msg).toBe("密码至少 8 位且需包含字母和数字");
  });

  it("用户名含非法字符返回 400", async () => {
    const res = await register({ username: "bad name!" });

    expect(res.status).toBe(400);
    expect(res.body.msg).toBe("用户名需为 3-32 位字母、数字或下划线");
  });

  it("用户名为 2 位返回 400（长度下边界）", async () => {
    const res = await register({ username: "ab" });

    expect(res.status).toBe(400);
    expect(res.body.msg).toBe("用户名需为 3-32 位字母、数字或下划线");
  });

  it("邮箱可省略，落库为 null（边界）", async () => {
    const res = await register({ email: undefined });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBeNull();
    const stored = await prisma.user.findUnique({ where: { username: VALID.username } });
    expect(stored?.email).toBeNull();
  });
});

describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    await register();
  });

  it("登录成功返回双令牌与用户信息，access 15min / refresh 7d", async () => {
    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user.username).toBe(VALID.username);
    expect(res.body.data.user.email).toBe(VALID.email);

    const access = decode(res.body.data.accessToken);
    expect(access.sub).toEqual(expect.any(String));
    expect(access.type).toBe("access");
    expect(Number(access.exp) - Number(access.iat)).toBe(900);

    const refresh = decode(res.body.data.refreshToken);
    expect(refresh.type).toBe("refresh");
    expect(Number(refresh.exp) - Number(refresh.iat)).toBe(604800);
  });

  it("JWT payload 仅含 sub/type/iat/exp，不泄露 username 或 email", async () => {
    const res = await login();
    const accessKeys = Object.keys(decode(res.body.data.accessToken)).sort();
    const refreshKeys = Object.keys(decode(res.body.data.refreshToken)).sort();

    expect(accessKeys).toEqual(["exp", "iat", "sub", "type"]);
    expect(refreshKeys).toEqual(["exp", "iat", "sub", "type"]);
  });

  it("用户名不存在返回 401 且不区分具体字段", async () => {
    const res = await login("ghost_user", "Passw0rd123");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "用户名或密码错误", data: null });
  });

  it("密码错误返回 401 且消息与用户名不存在一致", async () => {
    const res = await login(VALID.username, "WrongPass123");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "用户名或密码错误", data: null });
  });

  it("缺少密码返回 400（边界）", async () => {
    const res = await request.post(`${BASE}/login`).send({ username: VALID.username });

    expect(res.status).toBe(400);
    expect(res.body.msg).toBe("密码不能为空");
  });
});

describe("GET /api/v1/auth/me", () => {
  let accessToken = "";

  beforeEach(async () => {
    await register();
    const logged = await login();
    accessToken = logged.body.data.accessToken;
  });

  it("携带有效 access token 返回当前用户且不含 passwordHash", async () => {
    const res = await request
      .get(`${BASE}/me`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.username).toBe(VALID.username);
    expect(res.body.data.email).toBe(VALID.email);
    expect(typeof res.body.data.createdAt).toBe("string");
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.password).toBeUndefined();
  });

  it("缺少 Authorization 返回 401 未登录", async () => {
    const res = await request.get(`${BASE}/me`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "未登录", data: null });
  });

  it("Authorization 格式错误返回 401 未登录（边界）", async () => {
    const res = await request.get(`${BASE}/me`).set("Authorization", `Token ${accessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.msg).toBe("未登录");
  });

  it("签名无效的 access token 返回 401 令牌无效", async () => {
    const forged = jwt.sign({ sub: "ghost", type: "access" }, "wrong-secret");
    const res = await request.get(`${BASE}/me`).set("Authorization", `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "令牌无效", data: null });
  });

  it("过期的 access token 返回 401 令牌已过期", async () => {
    const res = await request
      .get(`${BASE}/me`)
      .set("Authorization", `Bearer ${signExpired("ghost", "access")}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "令牌已过期", data: null });
  });

  it("用 refresh token 访问受保护接口返回 401 令牌无效（令牌类型隔离）", async () => {
    const logged = await login();
    const res = await request
      .get(`${BASE}/me`)
      .set("Authorization", `Bearer ${logged.body.data.refreshToken}`);

    expect(res.status).toBe(401);
    expect(res.body.msg).toBe("令牌无效");
  });

  it("合法签名但用户已不存在返回 401 未登录（依赖数据缺失）", async () => {
    const orphan = jwt.sign({ sub: "not-exists-user", type: "access" }, config.jwtSecret, {
      expiresIn: "15m",
    });
    const res = await request.get(`${BASE}/me`).set("Authorization", `Bearer ${orphan}`);

    expect(res.status).toBe(401);
    expect(res.body.msg).toBe("未登录");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  let refreshToken = "";
  let accessToken = "";

  beforeEach(async () => {
    await register();
    const logged = await login();
    refreshToken = logged.body.data.refreshToken;
    accessToken = logged.body.data.accessToken;
  });

  it("有效 refresh token 换发新双令牌，新 access token 可访问 me", async () => {
    const res = await request.post(`${BASE}/refresh`).send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));

    const me = await request
      .get(`${BASE}/me`)
      .set("Authorization", `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.username).toBe(VALID.username);
  });

  it("也支持通过 Authorization header 提交 refresh token（边界）", async () => {
    const res = await request
      .post(`${BASE}/refresh`)
      .set("Authorization", `Bearer ${refreshToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it("用 access token 调用 refresh 返回 401 令牌无效", async () => {
    const res = await request.post(`${BASE}/refresh`).send({ refreshToken: accessToken });

    expect(res.status).toBe(401);
    expect(res.body.msg).toBe("令牌无效");
  });

  it("旧 access token 在有效期内仍可访问 me（无状态 JWT，不做黑名单）", async () => {
    const refreshed = await request.post(`${BASE}/refresh`).send({ refreshToken });
    expect(refreshed.status).toBe(200);

    const me = await request
      .get(`${BASE}/me`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.username).toBe(VALID.username);
  });

  it("签名无效的 refresh token 返回 401 令牌无效", async () => {
    const forged = jwt.sign({ sub: "ghost", type: "refresh" }, "wrong-secret");
    const res = await request.post(`${BASE}/refresh`).send({ refreshToken: forged });

    expect(res.status).toBe(401);
    expect(res.body.msg).toBe("令牌无效");
  });

  it("过期的 refresh token 返回 401 令牌已过期", async () => {
    const res = await request
      .post(`${BASE}/refresh`)
      .send({ refreshToken: signExpired("ghost", "refresh") });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "令牌已过期", data: null });
  });

  it("缺少 refreshToken 返回 401 未登录（边界）", async () => {
    const res = await request.post(`${BASE}/refresh`).send({});

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "未登录", data: null });
  });
});

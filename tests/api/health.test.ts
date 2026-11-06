import { afterAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../../backend/src/index";
import prisma from "../../backend/src/lib/prisma";

const request = supertest(createApp());

afterAll(async () => {
  await prisma.$disconnect();
});

describe("健康检查与联调接口", () => {
  it("GET /health 返回统一格式且带安全响应头", async () => {
    const res = await request.get("/health").set("Origin", "http://localhost:5173");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 0, msg: "ok", data: { status: "UP" } });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("GET /api/v1/health 可访问（双挂载边界）", async () => {
    const res = await request.get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.status).toBe("UP");
  });

  it("GET /api/v1/hello 返回统一响应格式", async () => {
    const res = await request.get("/api/v1/hello");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      code: 0,
      msg: "ok",
      data: "Hello from Jam Box backend",
    });
  });

  it("GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式）", async () => {
    const res = await request.get("/health").set("Origin", "http://evil.example.com");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 500, msg: "服务器内部错误", data: null });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import { Prisma } from "@prisma/client";
import { errorMiddleware } from "../../backend/src/middleware/error";
import { AuthError, BusinessError } from "../../backend/src/lib/errors";
import { submitJobSchema } from "../../backend/src/zod/validators";

function buildApp() {
  const app = express();
  app.use(express.json());

  app.get("/business", () => {
    throw new BusinessError("任务不存在", 404);
  });
  app.get("/auth", () => {
    throw new AuthError();
  });
  app.get("/zod", () => {
    submitJobSchema.parse({});
  });
  app.get("/prisma-unique", () => {
    throw new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.19.3",
      meta: { target: ["id"] },
    });
  });
  app.get("/json-parse", () => {
    const err = new SyntaxError("Unexpected end of JSON input");
    (err as SyntaxError & { body?: unknown }).body = {};
    throw err;
  });
  app.get("/dependency-down", () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
  });

  app.use(errorMiddleware);
  return app;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
});

const request = supertest(buildApp());

describe("全局错误中间件映射", () => {
  it("BusinessError 404 映射为 HTTP 404 / code 404", async () => {
    const res = await request.get("/business");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, msg: "任务不存在", data: null });
  });

  it("AuthError 映射为 HTTP 401 / code 401", async () => {
    const res = await request.get("/auth");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, msg: "未认证或登录已过期", data: null });
  });

  it("ZodError 映射为 400 且带字段路径", async () => {
    const res = await request.get("/zod");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
    expect(res.body.msg).toContain("type");
    expect(res.body.data).toBeNull();
  });

  it("Prisma P2002 唯一约束冲突映射为 409", async () => {
    const res = await request.get("/prisma-unique");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 409, msg: "资源已存在（唯一约束冲突）", data: null });
  });

  it("JSON 解析错误映射为 400", async () => {
    const res = await request.get("/json-parse");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, msg: "请求体不是合法的 JSON", data: null });
  });

  it("依赖不可达（ECONNREFUSED）映射为 500 且不泄露堆栈", async () => {
    const res = await request.get("/dependency-down");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 500, msg: "服务器内部错误", data: null });
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(res.body)).not.toContain("at ");
  });

  it("每次错误都会记录日志", async () => {
    await request.get("/business");

    expect(errorSpy).toHaveBeenCalled();
  });
});

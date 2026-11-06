import { afterAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../../backend/src/index";
import prisma from "../../backend/src/lib/prisma";

const request = supertest(createApp());

beforeEach(async () => {
  await prisma.job.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/jobs", () => {
  it("提交合法任务后落库，返回 pending 任务结构", async () => {
    const res = await request
      .post("/api/v1/jobs")
      .send({ type: "test", payload: { foo: "bar" } });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.msg).toBe("ok");
    expect(typeof res.body.data.id).toBe("string");
    expect(res.body.data.id.length).toBeGreaterThan(0);
    expect(res.body.data.type).toBe("test");
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.retryCount).toBe(0);
    expect(res.body.data.maxRetries).toBe(3);
    expect(res.body.data.payload).toEqual({ foo: "bar" });
    expect(res.body.data.result).toBeNull();
    expect(res.body.data.error).toBeNull();

    const count = await prisma.job.count();
    expect(count).toBe(1);
  });

  it("payload 缺省时允许创建，payload 为 null（边界）", async () => {
    const res = await request.post("/api/v1/jobs").send({ type: "test" });

    expect(res.status).toBe(200);
    expect(res.body.data.payload).toBeNull();
    expect(res.body.data.status).toBe("pending");
  });

  it("缺少 type 返回 400 与具体校验信息", async () => {
    const res = await request.post("/api/v1/jobs").send({ payload: {} });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
    expect(res.body.msg).toContain("type");
    expect(res.body.data).toBeNull();
    expect(await prisma.job.count()).toBe(0);
  });

  it("type 为空字符串返回 400（边界）", async () => {
    const res = await request.post("/api/v1/jobs").send({ type: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
    expect(res.body.msg).toContain("type");
    expect(await prisma.job.count()).toBe(0);
  });

  it("请求体为非法 JSON 返回 400 而不是 500", async () => {
    const res = await request
      .post("/api/v1/jobs")
      .set("Content-Type", "application/json")
      .send('{"type":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, msg: "请求体不是合法的 JSON", data: null });
  });
});

describe("GET /api/v1/jobs/:id", () => {
  it("查询已存在任务返回完整结构", async () => {
    const created = await request
      .post("/api/v1/jobs")
      .send({ type: "test", payload: { n: 1 } });

    const res = await request.get(`/api/v1/jobs/${created.body.data.id}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toBe(created.body.data.id);
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.payload).toEqual({ n: 1 });
  });

  it("查询不存在的任务返回 404 且错误码匹配", async () => {
    const res = await request.get("/api/v1/jobs/not-exists-id");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, msg: "任务不存在", data: null });
  });
});

describe("路由与 CORS 边界", () => {
  it("未匹配的 API 路由返回统一 404 JSON", async () => {
    const res = await request.get("/api/v1/unknown-route");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, msg: "接口不存在", data: null });
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("POST /api/v1/jobs/ 空路径（尾斜杠）返回统一 404", async () => {
    const res = await request.get("/api/v1/jobs/");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(404);
    expect(res.body.data).toBeNull();
  });

  it("CORS 预检请求返回 204 并允许 POST", async () => {
    const res = await request
      .options("/api/v1/jobs")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });
});

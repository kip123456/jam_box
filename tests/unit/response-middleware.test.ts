import { describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import { responseMiddleware } from "../../backend/src/middleware/response";

function buildApp() {
  const app = express();
  app.use(responseMiddleware);

  app.get("/primitive", (_req, res) => res.json("hello"));
  app.get("/object", (_req, res) => res.json({ value: 42 }));
  app.get("/undefined", (_req, res) => res.json(undefined));
  app.get("/raw", (_req, res) => {
    res.locals.rawResponse = true;
    res.status(409).json({ code: 409, msg: "冲突", data: null });
  });

  return app;
}

const request = supertest(buildApp());

describe("统一响应格式中间件", () => {
  it("原始值被包装为 {code:0,msg:'ok',data}", async () => {
    const res = await request.get("/primitive");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 0, msg: "ok", data: "hello" });
  });

  it("对象被包装，字段值不丢失", async () => {
    const res = await request.get("/object");

    expect(res.body).toEqual({ code: 0, msg: "ok", data: { value: 42 } });
  });

  it("undefined 被归一化为 data:null", async () => {
    const res = await request.get("/undefined");

    expect(res.body).toEqual({ code: 0, msg: "ok", data: null });
  });

  it("rawResponse 标记时跳过包装（供错误中间件使用）", async () => {
    const res = await request.get("/raw");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 409, msg: "冲突", data: null });
  });
});

import { describe, expect, it } from "vitest";
import { jobIdSchema, submitJobSchema } from "../../backend/src/zod/validators";

describe("任务接口输入校验", () => {
  it("合法 body 通过并保留 payload", () => {
    const result = submitJobSchema.parse({ type: "test", payload: { foo: "bar" } });

    expect(result.type).toBe("test");
    expect(result.payload).toEqual({ foo: "bar" });
  });

  it("payload 可省略", () => {
    const result = submitJobSchema.parse({ type: "test" });

    expect(result.type).toBe("test");
    expect(result.payload).toBeUndefined();
  });

  it("缺少 type 被拒绝", () => {
    expect(() => submitJobSchema.parse({})).toThrow();
  });

  it("空字符串 type 被拒绝（边界）", () => {
    expect(() => submitJobSchema.parse({ type: "" })).toThrow();
  });

  it("task id 为空被拒绝", () => {
    expect(() => jobIdSchema.parse({ id: "" })).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { parseEnv } from "../../backend/src/utils/env";

const base = {
  DATABASE_URL: "file:./x.db",
  JWT_SECRET: "secret",
} as NodeJS.ProcessEnv;

describe("环境变量校验", () => {
  it("合法配置通过并应用默认端口", () => {
    const result = parseEnv(base);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.BACKEND_PORT).toBe(3000);
      expect(result.data.FRONTEND_PORT).toBe(5173);
      expect(result.data.DATABASE_URL).toBe("file:./x.db");
      expect(result.data.JWT_SECRET).toBe("secret");
    }
  });

  it("缺少 DATABASE_URL 失败并给出具体字段", () => {
    const result = parseEnv({ JWT_SECRET: "secret" } as NodeJS.ProcessEnv);

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("DATABASE_URL");
    }
  });

  it("缺少 JWT_SECRET 失败并给出具体字段", () => {
    const result = parseEnv({ DATABASE_URL: "file:./x.db" } as NodeJS.ProcessEnv);

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("JWT_SECRET");
    }
  });

  it("端口不是数字时失败（边界）", () => {
    const result = parseEnv({
      ...base,
      BACKEND_PORT: "abc",
    } as NodeJS.ProcessEnv);

    expect(result.success).toBe(false);
  });
});

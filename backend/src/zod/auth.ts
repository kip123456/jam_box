import { z } from "zod";

/** POST /api/v1/auth/register 请求体校验 */
export const registerSchema = z.object({
  username: z
    .string({ error: "用户名需为 3-32 位字母、数字或下划线" })
    .regex(/^[a-zA-Z0-9_]{3,32}$/, "用户名需为 3-32 位字母、数字或下划线"),
  password: z
    .string({ error: "密码至少 8 位且需包含字母和数字" })
    .regex(/^(?=.*[a-zA-Z])(?=.*\d).{8,}$/, "密码至少 8 位且需包含字母和数字"),
  email: z.string().email("邮箱格式不正确").optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** POST /api/v1/auth/login 请求体校验 */
export const loginSchema = z.object({
  username: z.string({ error: "用户名不能为空" }).min(1, "用户名不能为空"),
  password: z.string({ error: "密码不能为空" }).min(1, "密码不能为空"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** POST /api/v1/auth/refresh 请求体校验 */
export const refreshSchema = z.object({
  refreshToken: z.string({ error: "refreshToken 不能为空" }).min(1, "refreshToken 不能为空"),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

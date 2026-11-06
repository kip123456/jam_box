import { z } from "zod";

const NAME_MESSAGE = "房间名长度必须在 1-50 字符之间";
const PASSWORD_MESSAGE = "私有房间密码长度必须在 8-32 位之间";

/** POST /api/v1/rooms 请求体校验 */
export const createRoomSchema = z
  .object({
    name: z
      .string({ error: NAME_MESSAGE })
      .trim()
      .min(1, NAME_MESSAGE)
      .max(50, NAME_MESSAGE),
    isPublic: z.boolean({ error: "isPublic 必须为布尔值" }).default(true),
    password: z.string({ error: PASSWORD_MESSAGE }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isPublic) return;

    if (!value.password || value.password.length < 8 || value.password.length > 32) {
      ctx.addIssue({ code: "custom", path: ["password"], message: PASSWORD_MESSAGE });
    }
  });

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

/** POST /api/v1/rooms/:roomId/join 请求体校验（公开房间可不带密码） */
export const joinRoomSchema = z.object({
  password: z
    .string({ error: PASSWORD_MESSAGE })
    .min(8, PASSWORD_MESSAGE)
    .max(32, PASSWORD_MESSAGE)
    .optional(),
});

export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

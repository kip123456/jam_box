import { z } from "zod";

const NAME_MESSAGE = "轨道名长度必须在 1-50 字符之间";
const INSTRUMENT_MESSAGE = "不支持的乐器类型";
const COLOR_MESSAGE = "颜色必须是十六进制格式（如 #3b82f6）";

/** 支持的乐器类型，与 Prisma InstrumentType 保持一致 */
export const INSTRUMENT_TYPES = ["piano", "guitar", "bass", "drums"] as const;

export const instrumentTypeEnum = z.enum(INSTRUMENT_TYPES, {
  error: INSTRUMENT_MESSAGE,
});

const colorSchema = z
  .string({ error: COLOR_MESSAGE })
  .regex(/^#[0-9a-fA-F]{6}$/, COLOR_MESSAGE);

const nameSchema = z
  .string({ error: NAME_MESSAGE })
  .trim()
  .min(1, NAME_MESSAGE)
  .max(50, NAME_MESSAGE);

/** POST /api/v1/rooms/:roomId/tracks 请求体校验 */
export const createTrackSchema = z.object({
  name: nameSchema,
  instrumentType: instrumentTypeEnum,
  color: colorSchema.optional(),
});

export type CreateTrackInput = z.infer<typeof createTrackSchema>;

/**
 * PUT /api/v1/tracks/:trackId 请求体校验。
 * roomId / instrumentType / createdBy 为不可变字段，未在此声明，传入会被忽略。
 */
export const updateTrackSchema = z.object({
  name: nameSchema.optional(),
  solo: z.boolean({ error: "solo 必须为布尔值" }).optional(),
  mute: z.boolean({ error: "mute 必须为布尔值" }).optional(),
  color: colorSchema.optional(),
  position: z
    .number({ error: "position 必须为整数" })
    .int("position 必须为整数")
    .min(0, "position 不能为负数")
    .optional(),
});

export type UpdateTrackInput = z.infer<typeof updateTrackSchema>;

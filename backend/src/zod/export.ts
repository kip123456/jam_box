import { z } from "zod";

/** POST /api/v1/rooms/:roomId/export 请求体校验 */
export const exportSchema = z.object({
  format: z.enum(["wav", "mp3"], { error: "format 必须是 wav 或 mp3" }).optional(),
  bpm: z
    .number({ error: "bpm 必须是数字" })
    .int({ error: "bpm 必须是整数" })
    .min(40, "bpm 不能低于 40")
    .max(240, "bpm 不能高于 240")
    .optional(),
  durationTicks: z
    .number({ error: "durationTicks 必须是数字" })
    .int({ error: "durationTicks 必须是整数" })
    .positive("durationTicks 必须大于 0")
    .optional(),
});

export type ExportInput = z.infer<typeof exportSchema>;

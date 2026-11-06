import { z } from "zod";

const PITCH_MESSAGE = "音高必须在 0-127 之间";
const START_MESSAGE = "开始时间必须 ≥ 0";
const DURATION_MESSAGE = "音符时长至少 480 ticks";
const VELOCITY_MESSAGE = "力度必须在 0-127 之间";

const pitchSchema = z
  .number({ error: PITCH_MESSAGE })
  .int("音高必须是整数")
  .min(0, PITCH_MESSAGE)
  .max(127, PITCH_MESSAGE);

const startTimeTicksSchema = z
  .number({ error: START_MESSAGE })
  .int("开始时间必须是整数")
  .min(0, START_MESSAGE);

const durationTicksSchema = z
  .number({ error: DURATION_MESSAGE })
  .int("音符时长必须是整数")
  .min(480, DURATION_MESSAGE);

const velocitySchema = z
  .number({ error: VELOCITY_MESSAGE })
  .int("力度必须是整数")
  .min(0, VELOCITY_MESSAGE)
  .max(127, VELOCITY_MESSAGE);

/** 单个音符创建校验（POST /tracks/:trackId/notes 与批量创建复用） */
export const createNoteSchema = z.object({
  pitch: pitchSchema,
  startTimeTicks: startTimeTicksSchema,
  durationTicks: durationTicksSchema,
  velocity: velocitySchema.default(100),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

/** POST /api/v1/tracks/:trackId/notes/bulk 请求体校验 */
export const bulkCreateNotesSchema = z
  .array(createNoteSchema, { error: "notes 必须是数组" })
  .min(1, "至少需要一个音符");

const notePatchSchema = z.object({
  id: z.string({ error: "音符 id 不能为空" }).min(1, "音符 id 不能为空"),
  pitch: pitchSchema.optional(),
  startTimeTicks: startTimeTicksSchema.optional(),
  durationTicks: durationTicksSchema.optional(),
  velocity: velocitySchema.optional(),
});

/** PUT /api/v1/tracks/:trackId/notes/:noteId 请求体校验（部分更新） */
export const updateNoteSchema = notePatchSchema.omit({ id: true });

/** PUT /api/v1/tracks/:trackId/notes/bulk 请求体校验 */
export const bulkUpdateNotesSchema = z
  .array(notePatchSchema, { error: "notes 必须是数组" })
  .min(1, "至少需要一个音符")
  .max(1000, "单次最多更新 1000 个音符");

export type BulkUpdateNoteInput = z.infer<typeof bulkUpdateNotesSchema>[number];

/** DELETE /api/v1/tracks/:trackId/notes/bulk 请求体校验 */
export const bulkDeleteNotesSchema = z.object({
  noteIds: z
    .array(z.string({ error: "音符 id 不能为空" }).min(1, "音符 id 不能为空"), {
      error: "noteIds 必须是数组",
    })
    .min(1, "noteIds 不能为空")
    .max(1000, "单次最多删除 1000 个音符"),
});

export type BulkDeleteNotesInput = z.infer<typeof bulkDeleteNotesSchema>;

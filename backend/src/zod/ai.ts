import { z } from "zod";

/** POST /api/v1/ai/compose 请求体校验 */
export const composeSchema = z.object({
  instruction: z
    .string({ error: "instruction 不能为空" })
    .trim()
    .min(1, "instruction 不能为空")
    .max(500, "instruction 不能超过 500 字符"),
  roomId: z.string({ error: "roomId 不能为空" }).min(1, "roomId 不能为空"),
  /** BPM 由前端房间编辑器状态提供（后端 Room 表不存），缺省 120 */
  bpm: z
    .number({ error: "bpm 必须为数字" })
    .positive("bpm 必须为正数")
    .max(400, "bpm 不能超过 400")
    .optional()
    .default(120),
});

export type ComposeInput = z.infer<typeof composeSchema>;

/** POST /api/v1/ai/ask 请求体校验 */
export const askSchema = z.object({
  question: z
    .string({ error: "question 不能为空" })
    .trim()
    .min(1, "question 不能为空")
    .max(500, "question 不能超过 500 字符"),
});

export type AskInput = z.infer<typeof askSchema>;

/** 乐谱检查/修复共用的音符结构（id 可选，未入库的音符没有 id） */
const checkNoteSchema = z.object({
  id: z.string().optional(),
  pitch: z.number({ error: "pitch 必须为整数" }).int("pitch 必须为整数"),
  startTimeTicks: z.number({ error: "startTimeTicks 必须为整数" }).int("startTimeTicks 必须为整数"),
  durationTicks: z.number({ error: "durationTicks 必须为整数" }).int("durationTicks 必须为整数"),
  velocity: z.number({ error: "velocity 必须为整数" }).int("velocity 必须为整数"),
});

const checkTrackSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(50),
  instrumentType: z.string(),
  notes: z.array(checkNoteSchema),
});

/** POST /api/v1/ai/check 请求体校验 */
export const checkSchema = z.object({
  tracks: z.array(checkTrackSchema).min(1, "tracks 不能为空"),
});

export type CheckInput = z.infer<typeof checkSchema>;

/** /check 返回、/fix 入参复用的单条问题结构 */
export const issueSchema = z.object({
  trackId: z.string().optional(),
  trackName: z.string(),
  noteId: z.string().optional(),
  noteIndex: z.number().int().optional(),
  type: z.string(),
  message: z.string(),
  suggestion: z.string(),
});

export type Issue = z.infer<typeof issueSchema>;

/** POST /api/v1/ai/fix 请求体校验（修复针对已入库轨道，track.id 与 color 必填） */
export const fixSchema = z.object({
  roomId: z.string({ error: "roomId 不能为空" }).min(1, "roomId 不能为空"),
  tracks: z
    .array(
      checkTrackSchema.extend({
        id: z.string().min(1),
        color: z.string().min(1, "track.color 不能为空"),
      })
    )
    .min(1, "tracks 不能为空"),
  issues: z.array(issueSchema).min(1, "issues 不能为空"),
});

export type FixInput = z.infer<typeof fixSchema>;

/** GET /api/v1/ai/compose/:jobId 与 /fix/:jobId 路径参数校验 */
export const aiJobIdSchema = z.object({
  jobId: z.string().min(1, "jobId 不能为空"),
});

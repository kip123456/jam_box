import { z } from "zod";
import { getProvider } from "../../lib/llm";
import { render } from "../../lib/prompts";
import { INSTRUMENT_TYPES } from "../../zod/track";
import type { JobPayload, JobResult } from "../handlers";

/** ai-compose / ai-fix 的 LLM 输出 schema（zod 二次校验前的第一道结构约束） */
const aiNoteSchema = z.object({
  pitch: z.number().int(),
  startTimeTicks: z.number().int(),
  durationTicks: z.number().int(),
  velocity: z.number().int(),
});

const aiTrackSchema = z.object({
  name: z.string(),
  instrumentType: z.string(),
  color: z.string(),
  notes: z.array(aiNoteSchema),
});

const composeResultSchema = z.object({ tracks: z.array(aiTrackSchema).min(1) });

/** fix 输出保留原轨道/音符 id */
const fixedNoteSchema = aiNoteSchema.extend({ id: z.string().optional() });
const fixedTrackSchema = aiTrackSchema.extend({
  id: z.string().optional(),
  notes: z.array(fixedNoteSchema),
});
const fixResultSchema = z.object({ tracks: z.array(fixedTrackSchema).min(1) });

/** 业务校验规则（不依赖 LLM）：返回错误描述列表，空数组表示通过 */
function validateAiTracks(tracks: Array<z.infer<typeof aiTrackSchema>>): string[] {
  const errors: string[] = [];
  for (const [ti, track] of tracks.entries()) {
    const label = `轨道${ti + 1}(${track.name})`;
    if (!track.name || track.name.length > 50) {
      errors.push(`${label}: name 长度必须在 1-50 字符之间`);
    }
    if (!(INSTRUMENT_TYPES as readonly string[]).includes(track.instrumentType)) {
      errors.push(`${label}: instrumentType "${track.instrumentType}" 不在允许枚举内`);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(track.color)) {
      errors.push(`${label}: color "${track.color}" 不是合法的十六进制颜色`);
    }
    for (const [ni, note] of track.notes.entries()) {
      const noteLabel = `${label} 音符${ni + 1}`;
      if (note.pitch < 0 || note.pitch > 127) errors.push(`${noteLabel}: pitch ${note.pitch} 超出 0-127`);
      if (note.startTimeTicks < 0) errors.push(`${noteLabel}: startTimeTicks ${note.startTimeTicks} 不能为负数`);
      if (note.durationTicks < 480) errors.push(`${noteLabel}: durationTicks ${note.durationTicks} 小于最小值 480`);
      if (note.velocity < 0 || note.velocity > 127) errors.push(`${noteLabel}: velocity ${note.velocity} 超出 0-127`);
    }
  }
  return errors;
}

const composePayloadSchema = z.object({
  instruction: z.string().min(1).max(500),
  existingTracksContext: z.string(),
  bpm: z.number().positive(),
  roomId: z.string().min(1),
});

/** ai-compose：LLM 生成轨道 -> 业务校验 -> 返回 tracks 数组 */
export async function composeHandler(payload: JobPayload): Promise<JobResult> {
  const input = composePayloadSchema.parse(payload);

  const provider = getProvider();
  if (!provider) {
    throw new Error("AI 服务暂不可用：未配置 LLM");
  }

  const systemPrompt = render("ai-compose", {
    instruction: input.instruction,
    existingTracksContext: input.existingTracksContext || "（空）",
    bpm: input.bpm,
  });

  const result = await provider.generateJSON(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: input.instruction },
    ],
    composeResultSchema,
    { maxTokens: 4000 }
  );

  const errors = validateAiTracks(result.tracks);
  if (errors.length > 0) {
    throw new Error(`LLM 生成结果未通过业务校验: ${errors.join("; ")}`);
  }

  // 只记录结构化摘要，不打印 prompt 或 LLM 原始输出
  const noteCount = result.tracks.reduce((sum, t) => sum + t.notes.length, 0);
  console.log(`[ai-compose] 生成 ${result.tracks.length} 条轨道 / ${noteCount} 个音符（room ${input.roomId}）`);

  return { tracks: result.tracks };
}

const fixPayloadSchema = z.object({
  roomId: z.string().min(1),
  tracks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      instrumentType: z.string(),
      color: z.string(),
      notes: z.array(
        z.object({
          id: z.string().optional(),
          pitch: z.number().int(),
          startTimeTicks: z.number().int(),
          durationTicks: z.number().int(),
          velocity: z.number().int(),
        })
      ),
    })
  ),
  issues: z.array(z.string()).min(1),
});

/** ai-fix：LLM 修复轨道 -> 业务校验 -> 返回修复后的完整 tracks */
export async function fixHandler(payload: JobPayload): Promise<JobResult> {
  const input = fixPayloadSchema.parse(payload);

  const provider = getProvider();
  if (!provider) {
    throw new Error("AI 服务暂不可用：未配置 LLM");
  }

  const systemPrompt = render("ai-fix", {
    tracks: JSON.stringify(input.tracks),
    issues: input.issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n"),
  });

  const result = await provider.generateJSON(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: "请修复以上轨道并返回完整 JSON。" },
    ],
    fixResultSchema,
    { maxTokens: 8000 }
  );

  const errors = validateAiTracks(result.tracks);
  if (errors.length > 0) {
    throw new Error(`LLM 修复结果未通过业务校验: ${errors.join("; ")}`);
  }

  const noteCount = result.tracks.reduce((sum, t) => sum + t.notes.length, 0);
  console.log(`[ai-fix] 修复 ${result.tracks.length} 条轨道 / ${noteCount} 个音符（room ${input.roomId}）`);

  return { tracks: result.tracks };
}

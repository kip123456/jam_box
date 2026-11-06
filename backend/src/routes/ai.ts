import { Router, Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { BusinessError } from "../lib/errors";
import { search } from "../lib/knowledge-base";
import { getProvider, LLMError, LLMOutputError } from "../lib/llm";
import { render } from "../lib/prompts";
import { getJob, submitJob } from "../queues/client";
import {
  aiJobIdSchema,
  askSchema,
  checkSchema,
  composeSchema,
  fixSchema,
  type Issue,
} from "../zod/ai";

const router = Router();

/** roomId 来自请求体时的成员校验（无法复用基于 req.params 的 requireRoomMember） */
async function requireRoomMemberById(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    throw new BusinessError("房间不存在", 404);
  }
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId } },
  });
  if (!member) {
    throw new BusinessError("不是房间成员", 403);
  }
  return room;
}

/** 知识库命中阈值：低于此分数说明匹配不可靠，转 LLM */
const KB_HIT_THRESHOLD = 0.3;

/** 提交智能编曲任务（异步，立即返回 jobId） */
router.post("/compose", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = composeSchema.parse(req.body);
    const room = await requireRoomMemberById(input.roomId, req.user!.id);

    // 只汇总轨道名与乐器类型作为上下文，不查全量 notes，节省 token
    const tracks = await prisma.track.findMany({
      where: { roomId: room.id },
      select: { name: true, instrumentType: true },
      orderBy: { position: "asc" },
    });
    const existingTracksContext =
      tracks.length === 0
        ? "（当前房间还没有轨道）"
        : tracks.map((t) => `- ${t.name}（${t.instrumentType}）`).join("\n");

    const job = await submitJob("ai-compose", {
      instruction: input.instruction,
      existingTracksContext,
      bpm: input.bpm,
      roomId: room.id,
    });
    res.json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
});

/** 轮询智能编曲任务状态 */
router.get("/compose/:jobId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = aiJobIdSchema.parse(req.params);
    res.json(await getJob(jobId));
  } catch (err) {
    next(err);
  }
});

/** 乐理问答（同步）：知识库优先，未命中走 LLM，LLM 不可用返回 503 */
router.post("/ask", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = askSchema.parse(req.body);

    const kb = search(input.question);
    if (kb.score >= KB_HIT_THRESHOLD) {
      res.json({ answer: kb.answer, source: "knowledge-base" });
      return;
    }

    const provider = getProvider();
    if (!provider) {
      throw new BusinessError("AI 服务暂不可用，请稍后再试", 503);
    }

    try {
      const answer = await provider.generate(
        [
          { role: "system", content: render("ai-ask", {}) },
          { role: "user", content: input.question },
        ],
        { timeoutMs: 15_000, maxTokens: 1000 }
      );
      res.json({ answer, source: "llm" });
    } catch (err) {
      // LLM 超时/失败统一降级为 503，不外泄上游错误细节
      if (err instanceof LLMError || err instanceof LLMOutputError) {
        throw new BusinessError("AI 服务暂不可用，请稍后再试", 503);
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

const PITCH_MIN = 0;
const PITCH_MAX = 127;
/** 常用乐器音域 C2(36) - C6(84)，超出记为音域问题 */
const REGISTER_MIN = 36;
const REGISTER_MAX = 84;
/** 最短时值：一个四分音符 */
const DURATION_MIN_TICKS = 480;
const VELOCITY_MIN = 1;
const VELOCITY_MAX = 127;

interface CheckTrack {
  id?: string;
  name: string;
  instrumentType: string;
  notes: Array<{
    id?: string;
    pitch: number;
    startTimeTicks: number;
    durationTicks: number;
    velocity: number;
  }>;
}

/**
 * 纯规则乐谱检查（不调用 LLM）：
 * pitch 范围、常用音域、最短时值、力度范围、同轨道音符重叠。
 */
export function checkTracks(tracks: CheckTrack[]): Issue[] {
  const issues: Issue[] = [];

  for (const track of tracks) {
    const base = { trackId: track.id, trackName: track.name };

    track.notes.forEach((note, index) => {
      const noteRef = { ...base, noteId: note.id, noteIndex: index };
      const pos = `第 ${index + 1} 个音符`;

      if (note.pitch < PITCH_MIN || note.pitch > PITCH_MAX) {
        issues.push({
          ...noteRef,
          type: "pitch-out-of-range",
          message: `${pos}音高 ${note.pitch} 超出 MIDI 范围（0-127）`,
          suggestion: "将音高调整到 0-127 之间",
        });
      } else if (note.pitch < REGISTER_MIN || note.pitch > REGISTER_MAX) {
        issues.push({
          ...noteRef,
          type: "pitch-out-of-register",
          message: `${pos}音高 ${note.pitch} 超出常用乐器音域（36-84，C2-C6）`,
          suggestion: "建议移调到 36-84 音域内，避免真实乐器无法演奏",
        });
      }

      if (note.durationTicks < DURATION_MIN_TICKS) {
        issues.push({
          ...noteRef,
          type: "duration-too-short",
          message: `${pos}时值 ${note.durationTicks} ticks 过短（小于一个四分音符 480）`,
          suggestion: "将时值延长到至少 480 ticks",
        });
      }

      if (note.velocity < VELOCITY_MIN || note.velocity > VELOCITY_MAX) {
        issues.push({
          ...noteRef,
          type: "velocity-out-of-range",
          message: `${pos}力度 ${note.velocity} 超出范围（1-127）`,
          suggestion: "将力度调整到 1-127 之间",
        });
      }
    });

    // 同轨道音符重叠：按起始时间排序后相邻比较
    const sorted = [...track.notes].sort((a, b) => a.startTimeTicks - b.startTimeTicks);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (cur.startTimeTicks < prev.startTimeTicks + prev.durationTicks) {
        issues.push({
          ...base,
          noteId: cur.id,
          type: "notes-overlap",
          message: `起始 ${cur.startTimeTicks} 的音符与起始 ${prev.startTimeTicks} 的音符时间重叠`,
          suggestion: "错开音符起始时间，或缩短前一音符的时值",
        });
      }
    }
  }

  return issues;
}

/** 同步乐谱检查：纯规则，快速返回问题列表 */
router.post("/check", (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = checkSchema.parse(req.body);
    res.json({ issues: checkTracks(input.tracks) });
  } catch (err) {
    next(err);
  }
});

/** 提交自动修复任务（异步，立即返回 jobId） */
router.post("/fix", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = fixSchema.parse(req.body);
    const room = await requireRoomMemberById(input.roomId, req.user!.id);

    // handler 的 prompt 需要纯文本问题描述，结构化 issues 在此展开
    const issues = input.issues.map(
      (issue) => `[${issue.type}] 轨道「${issue.trackName}」：${issue.message}（建议：${issue.suggestion}）`
    );

    const job = await submitJob("ai-fix", {
      roomId: room.id,
      tracks: input.tracks,
      issues,
    });
    res.json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
});

/** 轮询自动修复任务状态 */
router.get("/fix/:jobId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = aiJobIdSchema.parse(req.params);
    res.json(await getJob(jobId));
  } catch (err) {
    next(err);
  }
});

export default router;

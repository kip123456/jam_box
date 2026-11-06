import client from "./client";
import type { InstrumentType } from "./editor";

export interface AiNote {
  id?: string;
  pitch: number;
  startTimeTicks: number;
  durationTicks: number;
  velocity: number;
}

export interface AiTrack {
  id?: string;
  name: string;
  instrumentType: InstrumentType;
  color: string;
  notes: AiNote[];
}

export type AiJobStatus = "pending" | "running" | "success" | "failed";

export interface AiJob<T = unknown> {
  id: string;
  type: string;
  status: AiJobStatus;
  result: T | null;
  error: string | null;
  attempts: number;
  createdAt: string;
}

export interface ComposeResult {
  tracks: AiTrack[];
}

export interface FixResult {
  tracks: AiTrack[];
}

export interface AskResult {
  answer: string;
  source: "knowledge-base" | "llm";
}

export interface CheckIssue {
  trackId?: string;
  trackName: string;
  noteId?: string;
  noteIndex?: number;
  type: string;
  message: string;
  suggestion: string;
}

export interface CheckTrackInput {
  id?: string;
  name: string;
  instrumentType: string;
  /** fix 接口必填（修复针对已入库轨道）；check 接口会忽略该字段 */
  color?: string;
  notes: AiNote[];
}

/** POST /ai/compose：提交智能编曲任务 */
export async function submitCompose(input: {
  instruction: string;
  roomId: string;
  bpm: number;
}): Promise<{ jobId: string }> {
  return (await client.post("/ai/compose", input)) as unknown as { jobId: string };
}

/** GET /ai/compose/:jobId：轮询编曲任务 */
export async function getComposeJob(jobId: string): Promise<AiJob<ComposeResult>> {
  return (await client.get(`/ai/compose/${jobId}`)) as unknown as AiJob<ComposeResult>;
}

/** POST /ai/ask：乐理问答（同步） */
export async function askQuestion(question: string): Promise<AskResult> {
  return (await client.post("/ai/ask", { question })) as unknown as AskResult;
}

/** POST /ai/check：乐谱检查（同步，纯规则） */
export async function checkScore(tracks: CheckTrackInput[]): Promise<{ issues: CheckIssue[] }> {
  return (await client.post("/ai/check", { tracks })) as unknown as { issues: CheckIssue[] };
}

/** POST /ai/fix：提交自动修复任务 */
export async function submitFix(input: {
  roomId: string;
  tracks: CheckTrackInput[];
  issues: CheckIssue[];
}): Promise<{ jobId: string }> {
  return (await client.post("/ai/fix", input)) as unknown as { jobId: string };
}

/** GET /ai/fix/:jobId：轮询修复任务 */
export async function getFixJob(jobId: string): Promise<AiJob<FixResult>> {
  return (await client.get(`/ai/fix/${jobId}`)) as unknown as AiJob<FixResult>;
}

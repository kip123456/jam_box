import client from "./client";

export type ExportFormat = "mp3" | "wav";
export type ExportJobStatus = "pending" | "running" | "completed" | "failed";

export interface ExportJobResult {
  fileName: string;
  format: ExportFormat;
  duration: number;
  url: string;
  size: number;
}

export interface ExportJob {
  jobId: string;
  status: ExportJobStatus;
  result: ExportJobResult | null;
  error: string | null;
}

/** POST /rooms/:roomId/export：提交导出任务 */
export async function submitExport(
  roomId: string,
  input: { format?: ExportFormat; bpm?: number; durationTicks?: number }
): Promise<{ jobId: string }> {
  return (await client.post(
    `/rooms/${roomId}/export`,
    input
  )) as unknown as Promise<{ jobId: string }>;
}

/** GET /rooms/:roomId/export/job/:jobId：轮询导出任务 */
export async function getExportJob(roomId: string, jobId: string): Promise<ExportJob> {
  return (await client.get(
    `/rooms/${roomId}/export/job/${jobId}`
  )) as unknown as Promise<ExportJob>;
}

/** 后端静态导出文件地址（去掉 /api/v1 前缀） */
export function buildExportFileUrl(url: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";
  return `${base.replace(/\/api\/v1\/?$/, "")}${url}`;
}

/** 分享页地址（后端渲染） */
export function buildShareUrl(sharePath: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";
  return `${base.replace(/\/api\/v1\/?$/, "")}${sharePath}`;
}

/** POST /rooms/:roomId/share：生成分享链接 */
export async function createShareLink(
  roomId: string
): Promise<{ shareUrl: string; expiresAt: string }> {
  return (await client.post(`/rooms/${roomId}/share`)) as unknown as Promise<{
    shareUrl: string;
    expiresAt: string;
  }>;
}

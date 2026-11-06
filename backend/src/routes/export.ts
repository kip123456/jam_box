import { Router, Request, Response, NextFunction } from "express";
import { authenticateAccessToken } from "../middleware/auth";
import { requireRoomMember } from "../middleware/roomMember";
import { exportSchema } from "../zod/export";
import { ValidationError, BusinessError } from "../lib/errors";
import { submitJob, getJob } from "../queues/client";

/** 挂载于 /api/v1/rooms，所有路由都要求登录且是房间成员 */
const router = Router();

function firstIssueMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "参数校验失败";
}

/** 提交导出任务 */
router.post(
  "/:roomId/export",
  authenticateAccessToken,
  requireRoomMember,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = exportSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError(firstIssueMessage(parsed.error));
      }

      const room = req.room!;
      const job = await submitJob("export-audio", {
        roomId: room.id,
        format: parsed.data.format,
        bpm: parsed.data.bpm,
        durationTicks: parsed.data.durationTicks,
      });

      res.json({ jobId: job.id });
    } catch (err) {
      next(err);
    }
  }
);

/** 轮询导出任务状态 */
router.get(
  "/:roomId/export/job/:jobId",
  authenticateAccessToken,
  requireRoomMember,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await getJob(req.params.jobId);
      const payload = job.payload as { roomId?: string } | null;

      // 只能查询本房间发起的导出任务
      if (job.type !== "export-audio" || payload?.roomId !== req.room!.id) {
        throw new BusinessError("任务不存在", 404);
      }

      res.json({
        jobId: job.id,
        status: job.status,
        result: job.result,
        error: job.error,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

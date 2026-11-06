import { Router, Request, Response, NextFunction } from "express";
import { jobIdSchema, submitJobSchema } from "../zod/validators";
import { getJob, submitJob } from "../queues/client";

const router = Router();

/** 提交异步任务 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = submitJobSchema.parse(req.body);
    const job = await submitJob(input.type, input.payload);
    res.json(job);
  } catch (err) {
    next(err);
  }
});

/** 查询任务状态与结果 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = jobIdSchema.parse(req.params);
    const job = await getJob(id);
    res.json(job);
  } catch (err) {
    next(err);
  }
});

export default router;

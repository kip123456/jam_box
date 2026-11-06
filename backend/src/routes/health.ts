import { Router, Request, Response } from "express";

const router = Router();

/** 健康检查（同时挂载在 / 与 /api/v1 下） */
router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "UP" });
});

/** 联调用的示例接口 */
router.get("/hello", (_req: Request, res: Response) => {
  res.json("Hello from Jam Box backend");
});

export default router;

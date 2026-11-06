import { z } from "zod";

/** POST /api/v1/jobs 请求体校验 */
export const submitJobSchema = z.object({
  type: z.string().min(1, "type 不能为空"),
  payload: z.any().optional(),
});

export type SubmitJobInput = z.infer<typeof submitJobSchema>;

/** GET /api/v1/jobs/:id 路径参数校验 */
export const jobIdSchema = z.object({
  id: z.string().min(1, "id 不能为空"),
});

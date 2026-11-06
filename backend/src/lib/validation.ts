import { ZodError } from "zod";

/** 取 zod 第一条错误信息，保证响应 msg 与 spec 完全一致 */
export function firstIssueMessage(error: ZodError): string {
  return error.issues[0]?.message ?? "参数校验失败";
}

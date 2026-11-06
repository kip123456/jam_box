/**
 * 自定义业务错误类。
 * 业务代码只需抛出这些错误，全局错误中间件统一映射为 { code, msg, data: null } 响应。
 */
export class BusinessError extends Error {
  readonly code: number;

  constructor(message: string, code = 400) {
    super(message);
    this.name = "BusinessError";
    this.code = code;
  }
}

/** 认证失败（未登录、token 无效/过期），对应 HTTP 401 */
export class AuthError extends BusinessError {
  constructor(message = "未认证或登录已过期") {
    super(message, 401);
    this.name = "AuthError";
  }
}

/** 参数校验失败，对应 HTTP 400 */
export class ValidationError extends BusinessError {
  constructor(message = "参数校验失败") {
    super(message, 400);
    this.name = "ValidationError";
  }
}

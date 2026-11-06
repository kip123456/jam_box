# 权限风险用例（risk-authz）

## 权限矩阵

| 接口 | 是否需登录 | 允许来源 | 判定依据 |
| --- | --- | --- | --- |
| GET /health、GET /api/v1/health、GET /api/v1/hello | 否（公开） | 无 Origin 或 http://localhost:5173 | API-01/02/03/04 |
| POST /api/v1/jobs、GET /api/v1/jobs/:id | 否（bootstrap 阶段无鉴权路由） | 同上 | API-05 ~ API-14 |
| POST /api/v1/auth/register、POST /api/v1/auth/login | 否（公开） | 同上 | API-15 ~ API-27 |
| GET /api/v1/auth/me | 是（access token，type 必须为 access） | 同上 | API-28 ~ API-34 |
| POST /api/v1/auth/refresh | 是（refresh token，type 必须为 refresh） | 同上 | API-35 ~ API-40 |
| 401 未认证映射 | 预留 | - | UNIT-06 |

## 用例展开

### AZ-01 未认证请求映射
- 前置条件：路由抛出 AuthError（后续受保护路由的鉴权失败路径）
- 操作：GET /auth（挂载 errorMiddleware 的最小应用）
- 可观测结果与当前实际：期望 HTTP 401、body={code:401,msg:'未认证或登录已过期',data:null}；当前实际见 UNIT-06 判定。
- 复测命令：npx vitest run --config tests/vitest.config.ts error-middleware.test.ts -t "AuthError 映射为 HTTP 401 / code 401"

### AZ-02 跨域来源拒绝
- 前置条件：请求 Origin=http://evil.example.com，不在允许列表
- 操作：GET /health
- 可观测结果与当前实际：期望 HTTP 500、统一错误体、无 ACAO 响应头；当前实际见 API-04 判定。
- 复测命令：npx vitest run --config tests/vitest.config.ts health.test.ts -t "GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式）"

### AZ-03 允许来源与预检
- 前置条件：Origin=http://localhost:5173，预检请求 Access-Control-Request-Method=POST
- 操作：OPTIONS /api/v1/jobs
- 可观测结果与当前实际：期望 HTTP 204、ACAO=http://localhost:5173、allow-methods 含 POST；当前实际见 API-14 判定。
- 复测命令：npx vitest run --config tests/vitest.config.ts jobs.test.ts -t "CORS 预检请求返回 204 并允许 POST"

### AZ-04 受保护接口缺少凭据
- 前置条件：已注册 alice_01，但 GET /me 不带 Authorization 头
- 操作：GET /api/v1/auth/me
- 可观测结果与当前实际：期望 HTTP 401、body={code:401,msg:'未登录',data:null}；当前实际见 API-29（格式错误头见 API-30）。
- 复测命令：npx vitest run --config tests/vitest.config.ts auth.test.ts -t "缺少 Authorization 返回 401 未登录"

### AZ-05 令牌类型隔离（refresh 不能当 access 用）
- 前置条件：登录取得 refresh token，分别用于 GET /me 与 POST /refresh（access 反向使用）
- 操作：带 refresh token 访问 /me；带 access token 调用 /refresh
- 可观测结果与当前实际：期望两次都返回 HTTP 401、msg='令牌无效'；当前实际见 API-33 与 API-37。
- 复测命令：npx vitest run --config tests/vitest.config.ts auth.test.ts -t "用 refresh token 访问受保护接口返回 401 令牌无效（令牌类型隔离）"

### AZ-06 过期与伪造令牌
- 前置条件：用正确密钥签发 exp 已过期的 access token；用 wrong-secret 伪造 access token
- 操作：分别带两种 token 访问 GET /api/v1/auth/me
- 可观测结果与当前实际：过期 → HTTP 401 msg='令牌已过期'；伪造 → HTTP 401 msg='令牌无效'；当前实际见 API-31 与 API-32。
- 复测命令：npx vitest run --config tests/vitest.config.ts auth.test.ts -t "过期的 access token 返回 401 令牌已过期"

## 结论

- 权限相关用例 8 条，失败 0 条；公开接口无越权前提，受保护接口已按“签名 + 有效期 + token 类型”三重校验，覆盖缺失、格式错误、过期、伪造与类型错配。

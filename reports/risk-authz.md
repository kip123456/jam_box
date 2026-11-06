# 权限风险用例（risk-authz）

## 权限矩阵

| 接口 | 是否需登录 | 允许来源 | 判定依据 |
| --- | --- | --- | --- |
| GET /health、GET /api/v1/health、GET /api/v1/hello | 否（公开） | 无 Origin 或 http://localhost:5173 | API-01/02/03/04 |
| POST /api/v1/jobs、GET /api/v1/jobs/:id | 否（bootstrap 阶段无鉴权路由） | 同上 | API-05 ~ API-14 |
| POST /api/v1/auth/register、POST /api/v1/auth/login | 否（公开） | 同上 | API-15 ~ API-27 |
| GET /api/v1/auth/me | 是（access token，type 必须为 access） | 同上 | API-28 ~ API-34 |
| POST /api/v1/auth/refresh | 是（refresh token，type 必须为 refresh） | 同上 | API-35 ~ API-40 |
| POST /api/v1/rooms、POST /api/v1/rooms/:roomId/join | 是（access token） | 同上 | API-42 ~ API-47、API-55 ~ API-64 |
| GET /api/v1/rooms、GET /api/v1/rooms/:roomId | 否（公开，详情可选登录） | 同上 | API-48 ~ API-54 |
| DELETE .../members/:userId、POST .../lock、POST .../end | 是（access token + 房间 owner 角色） | 同上 | API-65 ~ API-73、UNIT-58 ~ UNIT-62 |
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

### AZ-07 私有房间口令校验
- 前置条件：player_01 创建私有房间 password='secret123'，player_02 提交错误密码 'wrongpass1'
- 操作：POST /api/v1/rooms/:id/join
- 可观测结果与当前实际：期望 HTTP 401、body={code:401,msg:'房间密码错误',data:null}，RoomMember 表仍为 1，日志不含口令明文；当前实际见 API-57 与 API-64。
- 复测命令：npx vitest run --config tests/vitest.config.ts rooms.test.ts -t "私有房间密码错误返回 401 房间密码错误"

### AZ-08 房主专属操作越权
- 前置条件：player_02 已以 member 角色加入房间；player_03 未加入
- 操作：player_02 调用 DELETE /rooms/:id/members/:userId 与 POST /rooms/:id/lock；player_03 调用 DELETE 踢人
- 可观测结果与当前实际：member 越权 → HTTP 403 msg='无权限'（API-67、API-71）；非成员 → HTTP 403 msg='不是房间成员'（API-69）；当前实际见对应用例。
- 复测命令：npx vitest run --config tests/vitest.config.ts rooms.test.ts -t "普通成员尝试踢人返回 403 无权限"

### AZ-09 加入房间状态门禁
- 前置条件：公开房间分别处于 locked 与 ended 状态
- 操作：player_02 POST /api/v1/rooms/:id/join
- 可观测结果与当前实际：locked → HTTP 403 msg='房间已锁定，无法加入'（API-60）；ended → HTTP 403 msg='合奏已结束'（API-61）。
- 复测命令：npx vitest run --config tests/vitest.config.ts rooms.test.ts -t "加入已锁定房间返回 403 房间已锁定，无法加入"

## 结论

- 权限相关用例 14 条，失败 0 条；公开接口无越权前提，受保护接口已按“签名 + 有效期 + token 类型”三重校验，覆盖缺失、格式错误、过期、伪造与类型错配；房间接口另按“登录态 + 房间角色 + 房间状态 + 私有口令”多重门禁，覆盖非成员、成员越权、锁定/结束加入与口令错误。

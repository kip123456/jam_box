## Context

Phase 0 (bootstrap-foundation) 已提供 Prisma + SQLite + 统一响应/错误中间件 + zod 输入校验 + bcryptjs/jsonwebtoken 依赖。后端目录结构已按 design 建好（routes/auth.ts、middleware/auth.ts、lib/auth.ts 待实现）。前端 Zustand user store 和 Axios 实例已建占位。详见 proposal.md - Why 和 Phase 0 design.md。

## Goals / Non-Goals

**Goals:**
- 完整实现用户注册、登录、双令牌 JWT 体系、Token 刷新、获取当前用户 API
- 替换前端 Login/Register 占位页为完整表单，实现登录状态管理和自动跳转
- 实现前端静默 Token 刷新（401 时自动用 refresh token 换新 access token 并重试原请求）

**Non-Goals:**
- 不实现邮箱验证/激活（MVP 直接注册即激活）
- 不实现第三方登录（GitHub/Google/OAuth）
- 不实现密码找回/重置
- 不实现 refresh token 黑名单或设备绑定
- 不实现用户资料编辑（改用户名、头像、email 等）—— 如果后续需要再开 change

## Decisions

### Decision: JWT Payload 极简主义
**选择**：access token 和 refresh token 的 payload 只含 `sub`（userId）、`type`（"access"/"refresh"）、`iat`、`exp`。不包含 username、email 等。

**理由**：
- 客户端从 `/api/v1/auth/me` 获取最新用户信息，token 只做身份标识
- 防止 JWT 被解码后泄露用户信息
- access token 15min 有效期短，用户信息变化也能及时生效

**Payload 结构**：
```json
{
  "sub": "clxxxxxxxxx",
  "type": "access",
  "iat": 1730000000,
  "exp": 1730000900
}
```

### Decision: access token 与 refresh token 的分离
**选择**：两种 token 独立签发、独立过期、payload 带 `type` 字段区分。鉴权中间件只接受 `type: "access"` 的 token，refresh 接口只接受 `type: "refresh"` 的 token。

**备选方案**：
- 同一种 token 不同过期：容易混淆，refresh token 被误当 access token 用
- refresh token 存数据库做单点注销：MVP 阶段没必要，未来做退出登录再引入

**理由**：`type` 字段是低成本的安全守卫，防止 refresh token 被直接拿去访问业务 API（refresh token 本身权限很低，只能换 access token）。

### Decision: bcrypt cost factor
**选择**：cost factor = 12

**备选方案**：10（Phase 0 里说 ≥10）

**理由**：Node.js 端 bcrypt cost factor 12 约 200-400ms/次，对登录体验无影响但安全余量足够。10 约 50-100ms，虽然安全但更宽松。MVP 取 12。

### Decision: 前端静默刷新的并发队列
**选择**：用一个 Promise 作为全局锁，多个请求同时收到 401 时只发一次 refresh 请求，其他排队等这个 Promise 完成。

**理由**：如果不做队列，5 个请求同时收到 401 → 5 次 refresh 调用，浪费资源且可能并发刷新导致 token 不一致。加一个 `refreshPromise` 单例即可：
```ts
let refreshPromise: Promise<string | null> | null = null;

async function getValidAccessToken(): Promise<string | null> {
  const { token, refreshToken, refresh } = useUserStore.getState();
  if (token && !isTokenExpired(token)) return token;

  if (!refreshPromise) {
    refreshPromise = refreshToken(refreshToken).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
```

### Decision: User Prisma model
```prisma
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String
  email        String?  @unique
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  rooms        Room[]   // Phase 2
  tracks       Track[]  // Phase 3
}
```

**注意**：Phase 0 的 Job model 已有，Phase 1 新增 User model 后必须生成新迁移（不是 `init` 了，应该叫 `add-user`）。

## Risks / Trade-offs

**[风险] refresh token 被盗用后无法单点注销** → MVP 接受。用户可以通过"改密码"让所有已签发的 access token 失效（后续 change 加密码修改功能），或者等 refresh token 7 天自然过期。如果这个问题变得严重，再加一个 `RefreshToken` 表做黑名单。

**[风险] JWT_SECRET 在 Docker Compose 中硬编码** → 开发用 `.env` 没问题，生产部署时必须替换。design 里明确标注：Docker Compose 的 environment 中的 JWT_SECRET 仅用于本地开发，生产环境要通过 `.env` 挂载或 secrets 注入。

**[风险] bcrypt cost factor 12 在 SQLite 上每次登录 200-400ms** → 完全可接受，网络延迟远大于这个数值。如果后期登录请求暴增，可以考虑降到 10。

## Open Questions

（无，所有技术决策已确定，没有会影响 specs/tasks 的可延迟决策）
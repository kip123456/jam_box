## Why

Phase 0 (bootstrap-foundation) 已提供 Prisma + SQLite + 统一中间件栈 + job queue 基础设施。现在需要让用户能够注册、登录并获得鉴权——这是 Phase 2 房间管理（需要 owner/member 身份）、Phase 3 多轨编曲（需要知道谁创建了轨道）以及后续所有需要用户身份的功能的前置条件。用户身份是整个合奏体验的入口。

## What Changes

- **Prisma User 模型**：在 Phase 0 已有的 schema.prisma 中新增 User 模型（id, username, password_hash, email?, created_at, updated_at）
- **注册接口**：POST `/api/v1/auth/register`，校验 username/password，bcrypt 哈希后入库
- **登录接口**：POST `/api/v1/auth/login`，校验密码，签发 JWT access token（15min）+ refresh token（7天）
- **Token 刷新接口**：POST `/api/v1/auth/refresh`，用 refresh token 换发新的 access token
- **获取当前用户接口**：GET `/api/v1/auth/me`，受保护路由，返回当前登录用户信息
- **JWT 鉴权中间件**：读取 Authorization header → 校验 JWT → 将 userId 注入 `req.user`；refresh token 单独 middleware
- **前端登录/注册页面**：替换 Phase 0 的占位页，实现表单 + 调用认证 API + 写入 Zustand user store + 登录后跳转 `/rooms`
- **前端 Axios 实例增强**：401 时尝试用 refresh token 静默刷新，刷新失败才跳转登录页（替换 Phase 0 简单 401 处理）

## Capabilities

### New Capabilities
- `user-auth`: 用户注册、登录、JWT 双令牌鉴权、Token 刷新、获取当前用户

### Modified Capabilities
（无，Phase 0 的前端骨架 specs 不涉及具体页面实现，本次功能由新 capability 覆盖）

## Impact

- **新增目录**：`backend/src/routes/auth.ts`、`backend/src/middleware/auth.ts`、`backend/src/lib/auth.ts`（JWT/bcrypt 工具）
- **Prisma 变更**：新增 User model → 需执行新迁移
- **前端变更**：`frontend/src/pages/Login.tsx` 和 `Register.tsx` 从占位页改为完整表单；`frontend/src/api/client.ts` 的 Axios 拦截器增加 refresh token 静默刷新逻辑
- **环境变量**：`.env.example` 中 JWT_SECRET 现在必须提供（Phase 0 已加占位）
## 1. Prisma User Model 与迁移

- [ ] 1.1 在 Phase 0 已有的 `backend/prisma/schema.prisma` 中追加 User model：id(cuid)、username(@unique)、passwordHash、email?(@unique)、createdAt、updatedAt；验证：`cd backend && npx prisma validate` 输出 valid
- [ ] 1.2 生成并执行新迁移：`cd backend && npx prisma migrate dev --name add-user`；验证：数据库有 User 表，插入一条测试记录查询成功，删除测试记录

## 2. 后端工具库（JWT + bcrypt + Zod schema）

- [ ] 2.1 创建 `backend/src/lib/auth.ts`：导出 `hashPassword(plain)` 用 bcryptjs（cost factor 12）、`comparePassword(plain, hash)`、`signAccessToken(userId)`（expiresIn 15m）、`signRefreshToken(userId)`（expiresIn 7d）、`verifyToken(token)`；验证：TypeScript 编译通过，手动调用 `signAccessToken("test")` 拿到 token 且 `verifyToken` 能正确返回 `{ sub: "test", type: "access" }`
- [ ] 2.2 创建 `backend/src/zod/auth.ts`：导出 `registerSchema`（username: z.string().regex(/^[a-zA-Z0-9_]{3,32}$/), password: z.string().regex(/^(?=.*[a-zA-Z])(?=.*\d).{8,}$/), email: z.string().email().optional()）、`loginSchema`（username + password）、`refreshSchema`（refreshToken: z.string()）；验证：对典型输入用 `schema.safeParse()` 测试通过/拒绝场景

## 3. JWT 鉴权中间件

- [ ] 3.1 创建 `backend/src/middleware/auth.ts`：导出 `authenticateAccessToken` 中间件（从 Authorization header 取 Bearer token → verifyToken → 检查 type === "access" → 将 userId 注入 `req.user = { id: sub }` → 失败返回 401 统一错误）、`authenticateRefreshToken` 中间件（同上但检查 type === "refresh"）；验证：curl 测试带合法 access token / 无 token / 过期 token 三种场景，响应都符合 spec

## 4. Auth Routes 实现

- [ ] 4.1 创建 `backend/src/routes/auth.ts`：Express Router，mount 到 `/api/v1/auth`
  - `POST /register`：zod registerSchema 校验 → prisma.user.create → bcrypt.hash → 写 DB → 返回用户信息（不含 passwordHash）；捕获 P2002（唯一约束）抛 BusinessError(code: 409)
  - `POST /login`：zod loginSchema 校验 → prisma.user.findUnique(where: username) → bcrypt.compare → 成功签发双 token → 返回
  - `POST /refresh`：zod refreshSchema 校验 → 验证 refresh token → 检查 type === "refresh" → 签发新双 token → 返回
  - `GET /me`：mount authenticateAccessToken 中间件 → prisma.user.findUnique(where: id = req.user.id) → 返回；验证：`cd backend && npx tsc --noEmit` 无错误

- [ ] 4.2 在 `backend/src/index.ts` 挂载 auth 路由：`app.use('/api/v1/auth', authRouter)`；验证：启动后端 dev server，四个 auth 端点全部 curl 测试通过

## 5. 前端登录注册页面

- [ ] 5.1 实现 `frontend/src/pages/Login.tsx`：受控表单（username/password）→ 提交时调用 Axios `POST /auth/login`（用 client.ts 实例）→ 成功后 `useUserStore.setState({ token: accessToken, refreshToken, user: user })` → navigate('/rooms')；失败显示后端 msg；验证：UI 正确渲染，表单提交调用正确 API
- [ ] 5.2 实现 `frontend/src/pages/Register.tsx`：受控表单（username/password/confirmPassword/email）→ 本地校验两次密码一致 → 调用 Axios `POST /auth/register` → navigate('/login') 并 toast 提示成功；验证：UI 正确渲染，注册后登录能成功
- [ ] 5.3 创建 `frontend/src/store/user.ts` 的 `logout` action：清除 token/user 并 navigate('/login')；创建 `refresh` action：调用 `POST /auth/refresh` 并更新两个 token；验证：TypeScript 编译通过

## 6. 前端 Axios 静默刷新增强

- [ ] 6.1 修改 `frontend/src/api/client.ts` 响应拦截器：收到 401 → 如果是 refresh 请求本身失败（标记一个 `_isRefreshRequest` 标志）则跳登录；否则尝试调用 getValidAccessToken（全局 Promise 锁）→ 刷新成功后用新 access token 重发原请求（从 config 中取出并替换 Authorization header）；验证：前端 DevTools 看到第一次请求 401 → 自动发 refresh → 自动重发原请求成功，Network 面板共 3 个请求（原 401 + refresh + 重发成功）

## 7. 阶段性验证

- [ ] 7.1 后端 API 端到端测试脚本：依次执行 register（新用户 → 200）→ register（重复用户名 → 409）→ login（正确凭证 → 200，拿两个 token）→ login（密码错误 → 401）→ me（带 access token → 200）→ me（无 token → 401）→ refresh（用 refresh token → 200，新 token）→ 用旧 access token 调用 me（401）→ 用新 access token 调用 me（200）；验证：全部场景结果与 spec 一致
- [ ] 7.2 前端交互验证：启动前后端 dev server → 浏览器访问 `/login` 正确渲染表单 → 输入合法信息登录成功跳 `/rooms`（虽然 Rooms 还是占位页但不再是未登录跳回）→ 刷新页面保持登录状态（access token 存 Zustand + localStorage 或内存？这里决定——**存 Zustand 内存即可，刷新后需重新登录**，MVP 先这样，后续加 localStorage 持久化）→ 手动让 access token 过期（等 15min 或手动改 localStorage）→ 请求触发自动 refresh → 用户无感知继续操作
- [ ] 7.3 TypeScript 编译检查：`cd backend && npx tsc --noEmit` 无错误；`cd frontend && npx tsc --noEmit` 无错误；验证：exit code 0
- [ ] 7.4 安全检查：检查 `backend/src/` 所有文件，无 passwordHash、JWT_SECRET 等敏感值硬编码或 log 打印；验证：`grep -r "passwordHash" backend/src/` 只出现 schema.prisma 和业务代码（不出现 console.log）；`grep -r "JWT_SECRET" backend/src/` 只出现在 env.ts 配置读取
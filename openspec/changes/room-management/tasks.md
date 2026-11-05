## 1. Prisma Room + RoomMember 模型与迁移

- [ ] 1.1 在 `backend/prisma/schema.prisma` 追加 Room model、RoomStatus enum、RoomMember model、MemberRole enum；User model 的 `rooms` 反向关联；验证：`npx prisma validate` 输出 valid
- [ ] 1.2 生成迁移：`cd backend && npx prisma migrate dev --name add-room`；验证：数据库有 Room 和 RoomMember 表，Room 表 roomNumber 有唯一约束，RoomMember 有 roomId_userId 组合唯一约束

## 2. 后端权限中间件与工具

- [ ] 2.1 创建 `backend/src/middleware/room.ts`：导出 `requireRoomRole(requiredRole)` 中间件函数——查房间、查当前用户 RoomMember、注入 `req.room` 和 `req.memberRole`、校验权限、错误时返回 404/403；验证：TypeScript 编译通过，单独用 mock room 手动测试权限逻辑
- [ ] 2.2 创建 `backend/src/lib/room.ts`：导出 `generateRoomNumber()` 函数（10 次重试机制，String 类型 100000-999999）；导出 `serializeRoom(room)` 函数（移除 passwordHash，格式化返回）；验证：手动调用 generateRoomNumber 100 次所有值在范围内且无重复

## 3. Room Routes 实现

- [ ] 3.1 创建 `backend/src/zod/room.ts`：zod schema——`createRoomSchema`（name 1-50, isPublic boolean, password string 8-32 only when !isPublic）、`joinRoomSchema`（password optional string 8-32）；验证：safeParse 测试边界值
- [ ] 3.2 创建 `backend/src/routes/rooms.ts`，挂在 `/api/v1/rooms`，所有路由先过 authenticateAccessToken：
  - `POST /`：zod createRoomSchema → generateRoomNumber → prisma.room.create + prisma.roomMember.create(owner) → serializeRoom → 返回
  - `GET /`：公开路由（无需登录也能看）→ prisma.room.findMany(where: isPublic: true, status: active, take: 20, orderBy: createdAt.desc) → 每条带 memberCount 聚合
  - `GET /:roomId`：可选登录 → 查房间 + 查当前用户是否为成员 → serializeRoom 含 isMember/role
  - `POST /:roomId/join`：zod joinRoomSchema → 查房间 → 校验状态（active 非 locked 非 ended）→ 私有房间校验 passwordHash → prisma.roomMember.create → 返回
  - `DELETE /:roomId/members/:userId`：authenticateAccessToken + requireRoomRole(owner) → 不能踢自己 → prisma.roomMember.delete → 返回
  - `POST /:roomId/lock`：authenticateAccessToken + requireRoomRole(owner) → prisma.room.update(status: locked)
  - `POST /:roomId/end`：authenticateAccessToken + requireRoomRole(owner) → 校验非 ended → prisma.room.update(status: ended)
  - （可选）`DELETE /:roomId/leave`：authenticateAccessToken + requireRoomRole(member) → 房主不能调 → prisma.roomMember.delete → 返回

- [ ] 3.3 在 `backend/src/index.ts` 挂载 rooms 路由：`app.use('/api/v1/rooms', roomsRouter)`；验证：`npx tsc --noEmit` 无错误

## 4. 前端 Rooms 页面

- [ ] 4.1 创建 `frontend/src/pages/Rooms.tsx`：加载时调用 GET `/rooms` → 以卡片网格展示公开房间（房间名、房主、成员数、房间号显示在卡片上）；每个卡片 hover 可看到进入按钮；验证：DevTools Network 面板看到 `/api/v1/rooms` GET 请求
- [ ] 4.2 创建创建房间弹窗组件：点击"创建房间"按钮触发 → 受控表单（name 2-50, isPublic toggle → 私有时显示 password 输入）→ 提交调用 POST `/rooms` → navigate 到 `/rooms/${data.id}`；验证：创建成功后浏览器 URL 变化
- [ ] 4.3 创建加入房间弹窗组件：点击"加入房间"按钮触发 → 受控表单（roomNumber string, password optional）→ 先 GET `/rooms` 检查房间是否存在和是否公开 → 私有房间自动显示 password 输入 → 调用 POST `/rooms/${roomNumber}/join` → navigate 到 `/rooms/${data.id}`；验证：加入公开房间直接进入，私有房间密码错误显示提示

## 5. 阶段性验证

- [ ] 5.1 后端 API 端到端测试：两个用户 user1 和 user2 → user1 创建公开房间（验证 RoomMember role=owner）→ user2 GET `/rooms` 能看到新房间 → user2 加入公开房间 → user1 踢 user2 → user2 加锁（应该 403）→ user1 加锁 → user3 尝试加入 locked 房间（403）→ user1 结束合奏 → 全部 curl 场景结果符合 spec
- [ ] 5.2 前端交互验证：启动前后端 dev server → `/rooms` 显示公开房间列表 → 创建房间弹窗填写公开房间提交成功 → 跳转房间详情页（虽然还是占位页）→ 回到 `/rooms` 能看到新房间；验证每个步骤 UI 和 Network 都对
- [ ] 5.3 TypeScript 编译检查：后端 + 前端 `npx tsc --noEmit` 都通过
- [ ] 5.4 安全检查：passwordHash 不出现在任何 GET 响应中（curl GET `/rooms/:id` 和 GET `/rooms` 都没有 passwordHash 字段）；密码明文不打印到日志
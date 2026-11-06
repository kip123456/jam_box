## Why

用户能注册登录了（Phase 1），现在需要让用户能创建和加入"房间"——这是多人合奏的容器。每个房间有房主、成员列表、状态（活跃/已结束），后续 Phase 3 多轨编曲数据和 Phase 4 AI 上下文、Phase 5 协同编辑、Phase 6 WebRTC 音频全部以房间为范围。

## What Changes

- **Prisma Room + RoomMember 模型**：新增 Room（id、room_number、name、is_public、password_hash?、owner_id、status）和 RoomMember（room_id、user_id、role、joined_at）
- **房间管理 API**：
  - POST `/api/v1/rooms`（创建，受保护）
  - GET `/api/v1/rooms`（列出公开房间）
  - GET `/api/v1/rooms/:id`（房间详情 + 成员列表）
  - POST `/api/v1/rooms/:id/join`（加入房间，公开直接进，私有需密码）
  - DELETE `/api/v1/rooms/:id/members/:userId`（房主踢人）
  - POST `/api/v1/rooms/:id/lock`（房主加锁禁止继续加入）
  - POST `/api/v1/rooms/:id/end`（房主结束合奏）
- **前端 Rooms 页面**：显示公开房间列表、"创建房间"按钮、"加入房间"弹窗（输入房间号 + 可选密码）、创建成功后跳转房间详情（房间详情页 Phase 3 填充）
- **房间号生成**：后端生成 6 位随机数字，保证唯一性

## Capabilities

### New Capabilities
- `room-management`: 房间创建/加入/列表/详情、房主权限（踢人/加锁/结束）、公开/私有房间区分、6 位数字房间号

### Modified Capabilities
（无）

## Impact

- **新增目录**：`backend/src/routes/rooms.ts`
- **Prisma 变更**：新增 Room 和 RoomMember 模型 → 新迁移
- **前端变更**：`frontend/src/pages/Rooms.tsx` 从占位页改为完整房间列表 + 创建/加入 UI；新增 `frontend/src/stores/room.ts` Zustand store
- **权限模型**：后端路由根据请求用户身份决定是否能调用踢人/加锁/结束等敏感操作
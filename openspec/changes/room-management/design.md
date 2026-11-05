## Context

Phase 0 (bootstrap-foundation) 提供了 Prisma + SQLite + 统一中间件。Phase 1 (user-authentication) 提供了 User model + JWT 鉴权中间件。现在需要 Room 和 RoomMember 模型及全套房间管理 API。详见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- Room + RoomMember 双模型 Prisma schema + 新迁移
- 完整的房间管理 REST API（创建/加入/列表/详情/踢人/加锁/结束）
- 前端 Rooms 页面替换占位页，支持列表展示、创建弹窗、加入弹窗

**Non-Goals:**
- 不实现房间内的多轨数据（Phase 3）
- 不实现 Socket.IO 实时成员在线状态推送（Phase 5 协同一起做）
- 不实现 WebRTC 音频通话（Phase 6）
- 不实现房间历史/回放
- 不实现"离开房间"接口（MVP 暂时不需要，房主可以踢所有人然后结束合奏）

## Decisions

### Decision: Room + RoomMember Prisma model
```prisma
model Room {
  id          String   @id @default(cuid())
  roomNumber  String   @unique
  name        String
  isPublic    Boolean  @default(true)
  passwordHash String?
  status      RoomStatus @default(active)
  ownerId     String
  owner       User     @relation("RoomOwner", fields: [ownerId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  members     RoomMember[]
  tracks      Track[]  // Phase 3
}

enum RoomStatus { active locked ended }

model RoomMember {
  id        String   @id @default(cuid())
  roomId    String
  userId    String
  role      MemberRole @default(member)
  joinedAt  DateTime @default(now())
  room      Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([roomId, userId])
}

enum MemberRole { owner member }
```

**级联删除**：Room 删除时自动删除 RoomMember 关联。MemberRole 和 RoomStatus 两个 enum 保证类型安全。

### Decision: 房间号生成算法
```ts
function generateRoomNumber(): string {
  // 生成 10 次（避免无限循环保护）
  for (let i = 0; i < 10; i++) {
    const n = Math.floor(100000 + Math.random() * 900000); // 100000-999999
    const exists = await prisma.room.findUnique({ where: { roomNumber: String(n) } });
    if (!exists) return String(n);
  }
  throw new Error("Failed to generate unique room number after 10 attempts");
}
```

**不生成 0xxxxxx 开头**：从 100000 开始，避免前置零被截断。10 次重试上限——6 位数共 90 万种，10 次碰撞概率极低（万分之一）。如果真的碰撞超过 10 次说明数据库里已有的房间号接近全占满，那是极端情况。

### Decision: 权限中间件模式
房间管理涉及"只有房主能做 X"的权限判断。推荐两种方式：
- **A)** 每个路由里手动查 RoomMember 判断 role（直白但重复）
- **B)** 创建一个 `requireRoomRole(Role)` 中间件，自动注入 `req.room` 和 `req.memberRole`

**选 B**，更优雅：
```ts
function requireRoomRole(requiredRole: MemberRole) {
  return async (req, res, next) => {
    const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
    if (!room) return next(new BusinessError(404, "房间不存在"));
    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: req.user.id } }
    });
    if (!member) return next(new BusinessError(403, "不是房间成员"));
    if (member.role === requiredRole || (requiredRole === MemberRole.member)) {
      req.room = room;
      req.memberRole = member.role;
      next();
    } else {
      return next(new BusinessError(403, "无权限"));
    }
  };
}
```

路由挂载：
```ts
router.delete('/:roomId/members/:userId', authenticateAccessToken, requireRoomRole(MemberRole.owner), kickMember);
```

### Decision: 加入房间的事务保护
加入房间时，检查 + 创建 RoomMember 必须在事务里，否则并发加入时可能产生重复 RoomMember（虽然 @@unique 会兜底报 Prisma P2002，但事务能提供更好的体验——检查过了就不会撞）。不过 MVP 直接用唯一约束也足够，Phase 4+ 时再细化事务。

## Risks / Trade-offs

**[风险] 房间号碰撞** → 10 次重试机制已兜底。极端情况（90 万房间号都占满）会抛异常并失败——MVP 阶段不可能到这个量级。

**[风险] 前端无实时成员列表更新** → Phase 2 的 Rooms 页面在创建/加入时刷新一次成员列表，但已在房间中的其他用户看不到新加入的成员变化。Phase 5 引入 Socket.IO 后会补这个。MVP 接受。

**[风险] 踢人/加锁等敏感操作无审计日志** → MVP 不做操作审计。如果后续需要（比如追踪谁踢了谁、什么时候锁的房间）再加 audit 表。

## Open Questions

- **"离开房间"接口要不要在 Phase 2 就实现？** 设计里 Non-Goals 说暂时不要，但可以考虑——如果房主结束合奏了，普通成员怎么自己退出？可以直接关浏览器。MVP 可以不加，用户反馈需要再加。先在 tasks 里标记为可选项。
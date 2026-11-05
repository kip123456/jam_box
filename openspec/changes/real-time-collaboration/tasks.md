## 1. 后端依赖与 Prisma 迁移

- [ ] 1.1 后端安装 Socket.IO + Yjs + y-websocket（或 y-socket.io，先调研确认包名，可能需要手动实现 sync over Socket.IO）：`npm install socket.io yjs y-websocket lib0`；验证：node_modules 存在，能 `import * as Y from 'yjs'`
- [ ] 1.2 在 `backend/prisma/schema.prisma` 追加 YjsDoc model（id String @id, ydoc Bytes, updatedAt DateTime @updatedAt）；验证：`npx prisma validate`
- [ ] 1.3 生成迁移：`cd backend && npx prisma migrate dev --name add-yjs-doc`；验证：数据库有 yjs_docs 表

## 2. Socket.IO 服务端初始化

- [ ] 2.1 修改 `backend/src/index.ts`：从 `app.listen()` 改为 `createServer(app)` → 创建 `Server(httpServer, { cors: ... })` → 传给 `setupSocketIO(io, prisma)` → `httpServer.listen(PORT)`；验证：TypeScript 编译通过，启动后 Socket.IO server 运行（debug 日志输出）
- [ ] 2.2 创建 `backend/src/socket/index.ts`：
  - Socket.IO namespace `/collab`（后续 WebRTC 用 `/webrtc` namespace）
  - connection 事件：校验 auth.token（JWT 鉴权，用已有的 authenticateAccessToken 逻辑但在 socket.io middleware 中）→ 校验用户是否为 roomId 房间成员（查 RoomMember 表）→ 成功则 socket.join(`room:${roomId}`) → 立即推送当前在线成员列表
  - disconnect 事件：socket.leave(room) → 广播 member:offline
  - room:lock / room:end 等房间状态变更事件（从 REST API 里 emit）
  - 验证：手动 `npx ts-node` 测试 Socket.IO 连接（需要 token + roomId）

## 3. Yjs 服务端文档管理

- [ ] 3.1 创建 `backend/src/lib/yjs.ts`：
  - `yjsDocs = new Map<string, Y.Doc>()` 内存文档 Map（key = roomId）
  - `getOrCreateYjsDoc(roomId)` → 如果内存有返回；否则从 SQLite yjs_docs 加载 → 没找到就 new Y.Doc() → 存入内存 Map
  - `scheduleSave(roomId, doc)` → debounce 500ms → Y.encodeStateAsUpdate(doc) → prisma.yjsDoc.upsert
  - `restToYjsInitialization(doc, tracks)` → REST Track/Note 数据 → Yjs Map/Array 结构
  - 验证：手动 new Y.Doc() → set → encode → upsert → 重新加载 → 数据一致
- [ ] 3.2 在 Socket.IO `/collab` namespace 中挂载 Yjs sync 协议：
  - 如果用 y-socket.io 包：`const provider = new SocketIOProvider(io, socket, roomId, doc)`
  - 如果手动实现：监听 socket.on('syncStep1') / socket.on('update') → 转发给 room 内其他 socket，同时 Y.applyUpdate(doc, update)；触发 scheduleSave
  - 验证：两个 socket client 连接同一 roomId → A 添加 Y.Map 值 → B 收到 update 事件

## 4. Socket.IO 事件定义

- [ ] 4.1 后端 Socket.IO `/collab` namespace emit 的事件：
  - `member:online` → { userId, username }
  - `member:offline` → { userId }
  - `members:list` → [{ userId, username }]（连接成功后立即推送）
  - （从 REST 路由里 emit）`room:locked` / `room:ended`
  - 验证：client 连接后收到 members:list，断开时其他 client 收到 member:offline

## 5. 前端 Socket.IO + Yjs 连接

- [ ] 5.1 前端安装依赖：`npm install socket.io-client yjs y-websocket`；验证：node_modules 存在
- [ ] 5.2 创建 `frontend/src/lib/socket.ts`：封装 Socket.IO client 连接（带 auth: { token, roomId }），namespace `/collab`；导出 `io()` 单例工厂；验证：TypeScript 编译通过
- [ ] 5.3 修改 roomEditorStore（或新建一个 YjsRoom hook）：
  - useEffect：创建 Y.Doc → 创建 Socket.IO 连接 → 创建 y-websocket 或手动 provider → 如果 Yjs 为空且 REST 有数据，把 REST 数据写入 Yjs
  - doc.observeDeep → zustand setState → React 重渲染
  - 组件卸载时 disconnect + destroy
  - 验证：A 浏览器添加音符 → B 浏览器的 PianoRoll 显示新音符（有延迟但 < 500ms）

## 6. 成员在线状态 UI

- [ ] 6.1 修改 RoomDetail 页或 TrackList 旁边，增加成员列表：从 Zustand store（新增 onlineMembers 字段）取 → socket.on('members:list') 初始填充 → socket.on('member:online') push → socket.on('member:offline') remove；验证：A 加入房间 → B 的成员列表实时增加一行带用户名的条目

## 7. 前端房间结束时处理（可选）

- [ ] 7.1 房主点击"结束合奏"时：调用 Phase 2 的 POST `/rooms/:id/end` REST → 成功后 socket emit room:ended → Yjs 停止监听更新 → 前端 PianoRoll 变为只读；验证：房间结束后 Yjs 仍可读到状态但不再产生新 update

## 8. 阶段性验证

- [ ] 8.1 双浏览器协同测试：Chrome 和 Edge 打开同一房间 → Chrome 添加音符 → Edge 能看到 → Edge 拖动 → Chrome 能看到；验证：同步延迟 < 500ms，最终状态一致
- [ ] 8.2 冲突合并测试：两人同时在同一轨道添加同一位置的音符 → 最终结果一致（Yjs 自动合并）；验证：两人都看到相同的合并后状态
- [ ] 8.3 断网重连测试：Chrome 断网 10 秒期间编辑 3 个音符 → 恢复网络 → 自动重连 → Edge 能看到这 3 个新音符；验证：重连后状态一致
- [ ] 8.4 服务重启恢复测试：创建协同场景 → 关闭后端 → 重启后端 → Chrome 和 Edge 重连 → Yjs 文档恢复；验证：重启后两边都能看到重启前最后一次协同的最终状态
- [ ] 8.5 成员在线状态测试：A 加入 → B 看到 online → A 关掉 Chrome → B 看到 offline；验证：实时推送正确
- [ ] 8.6 TypeScript 编译：前后端都通过
- [ ] 8.7 Socket.IO 安全检查：无 JWT 的 Socket.IO 连接被拒绝；非房间成员的连接被拒绝；验证：手动 `npx ts-node -e "io({ auth: {} })"` 收到 connect_error
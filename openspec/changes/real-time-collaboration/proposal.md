## Why

Phase 3 实现了单人编曲，Phase 4 加了 AI，但多人还不能实时一起编辑。现在需要 Socket.IO + Yjs CRDT 让多人在同一个房间里实时协同编辑轨道和音符——你拖一个音符我立刻能看到，冲突自动合并。Yjs 文档要持久化，防止服务重启丢数据。

## What Changes

- **Socket.IO 服务端**：后端新增 Socket.IO（挂载在 Express 上或独立 http server），每个房间一个 Socket.IO room
- **JWT 鉴权**：Socket.IO 连接时用 access token 鉴权，查询用户是否是该房间成员，决定是否允许加入 Socket.IO room
- **Yjs CRDT 集成**：
  - 每个房间对应一个 Y.Doc（或 Y.Map），包含所有轨道和音符数据
  - 后端跑 `y-websocket`（同 Socket.IO 绑定）处理 Yjs 文档同步协议
  - Yjs 文档持久化：用 `y-leveldb` 或自定义方案将每个房间的 Yjs 文档编码存到 SQLite 新表 `yjs_docs`
  - 服务启动时从 SQLite 加载 Yjs 文档恢复内存状态
- **前端 Yjs 客户端**：房间详情页连接 Socket.IO + y-websocket provider，用 Yjs 的监听器实时更新 TrackList/PianoRoll 显示
- **在线状态**：Socket.IO 推送成员在线/离线事件，前端 RoomDetail 成员列表实时更新
- **Phase 3 的 REST API 改造**：Phase 3 的 Track/Note REST API 继续保留，但协同编辑通过 Yjs 通道；REST 用于初始化加载和离线数据一致性

## Capabilities

### New Capabilities
- `real-time-collaboration`: Socket.IO + Yjs CRDT 多人协同编辑、Yjs 文档 SQLite 持久化、成员在线状态实时推送

### Modified Capabilities
（无，Phase 3 的多轨 API 继续保留，Phase 5 新增协同通道）

## Impact

- **新增目录**：`backend/src/socket/`（Socket.IO 初始化、命名空间、Yjs provider）、`backend/src/lib/yjs.ts`（Yjs 文档管理 + 持久化）
- **新增依赖**：后端 `socket.io`、`yjs`、`y-websocket`、`lib0`、可选 `better-sqlite3`（持久化 Yjs 编码）；前端 `socket.io-client`、`yjs`、`y-websocket`
- **Prisma 变更**：新增 YjsDoc 表（id=roomId, ydoc=Blob, updatedAt）
- **Express 入口扩展**：挂载 Socket.IO server（可以用同一 HTTP server，`const server = app.listen(...)` → `const io = new Server(server)`）
- **前端 roomEditorStore 改造**：从 Zustand + REST 模式改为 Zustand 镜像 Yjs 状态的模式（Yjs 是真实数据源，Zustand 缓存 UI 状态）
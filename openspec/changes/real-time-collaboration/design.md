## Context

Phase 3 提供了 Track/Note REST API 和前端多轨编辑 UI，但用户编辑后保存到 SQLite 后其他人看不到。现在需要 Socket.IO + Yjs CRDT 让多人实时协同编辑。后端 Socket.IO 与 Express 复用同一个 HTTP server。Yjs 文档需要 SQLite 持久化表。详见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- Socket.IO server 挂载到现有 Express HTTP server
- Socket.IO 连接鉴权 + 房间成员校验
- Yjs CRDT 多人协同编辑（轨道/音符增删改都走 Yjs）
- Yjs 文档 SQLite 持久化 + 启动时恢复
- 成员在线/离线实时推送
- 前端 Socket.IO + y-websocket provider 连接 + 重连自动同步

**Non-Goals:**
- 不实现光标/选区实时显示（用户确认过 MVP 不做）
- 不实现 Yjs 离线持久化到 localStorage（MVP 只靠后端 SQLite + 重连自动同步）
- 不实现 Yjs 历史版本快照（Phase 3 撤销/重做是前端本地 undo/redo，不是多人可见的版本历史）
- 不替换 Phase 3 的 REST API——REST 继续保留用于初始加载和数据兜底
- 不实现房间结束时的 Yjs → SQLite 全量回写（先不做，保持 Yjs 是协同时的真实数据源，SQLite 存初始状态）

## Decisions

### Decision: Socket.IO 与 Express 集成方式
```ts
// backend/src/index.ts
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
// ... express middleware setup ...

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: 'http://localhost:5173' },
});

// Socket.IO 初始化逻辑放 backend/src/socket/index.ts
setupSocketIO(io, prisma);

// 用 httpServer.listen 代替 app.listen
httpServer.listen(PORT, () => { ... });
```

**理由**：Socket.IO 需要 http.Server 实例，Express 4 的 `app.listen()` 内部也是 `http.createServer(app).listen()`，但用 `createServer` + `Server` 更显式，方便后续加 WebRTC 信令（Phase 6 同样用 Socket.IO）。

### Decision: Yjs + Socket.IO 协议选型
**选项**：
- y-websocket：轻量，独立 WebSocket server
- y-socket.io：Yjs 官方 Socket.IO 适配，直接在 Socket.IO namespace 上跑
- 手动实现 Yjs sync over Socket.IO

**选 y-socket.io**——最简洁，Socket.IO 已经有连接管理、鉴权、重连、房间能力。npm 包 `@y-socket.io/server`（或叫 `y-websocket` 的 socket.io 变体？需要实际查 npm）。

**退而求其次**：如果 `@y-socket.io/server` 不稳定，就手动在 Socket.IO namespace 上实现 Yjs sync protocol（核心就是转发 `syncStep1`、`syncStep2`、`update` 三种消息）。Yjs 有现成的 `Y.bindDoc()` API 可以让 Socket.IO socket 自动成为 Yjs 网络提供者。

### Decision: Yjs 文档管理与持久化
```prisma
model YjsDoc {
  id        String   @id // 等于 roomId
  ydoc      Bytes    // Uint8Array, Y.encodeStateAsUpdate(doc) 结果
  updatedAt DateTime @updatedAt
}
```

**持久化 debounce 逻辑**：
```ts
const saveQueues = new Map<string, NodeJS.Timeout>();

function scheduleSave(roomId: string, doc: Y.Doc) {
  clearTimeout(saveQueues.get(roomId));
  saveQueues.set(roomId, setTimeout(async () => {
    const update = Y.encodeStateAsUpdate(doc);
    await prisma.yjsDoc.upsert({
      where: { id: roomId },
      update: { ydoc: Buffer.from(update) },
      create: { id: roomId, ydoc: Buffer.from(update) },
    });
  }, 500));
}
```

**启动时恢复**：
```ts
async function loadYjsDoc(roomId: string): Promise<Y.Doc | null> {
  const saved = await prisma.yjsDoc.findUnique({ where: { id: roomId } });
  if (!saved) return null; // 没有持久化记录
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(saved.ydoc));
  return doc;
}
```

### Decision: Yjs 文档结构与 REST 数据的转换
```ts
// REST → Yjs（首次初始化）
function restToYjs(doc: Y.Doc, tracks: TrackWithNotes[]) {
  const ytracks = doc.getMap('tracks');
  for (const track of tracks) {
    const ytrack = new Y.Map();
    ytrack.set('name', track.name);
    ytrack.set('instrumentType', track.instrumentType);
    // ...其他字段
    const ynotes = new Y.Array();
    for (const note of track.notes) {
      const ynote = new Y.Map();
      ynote.set('pitch', note.pitch);
      // ...其他字段
      ynotes.push([ynote]);
    }
    ytrack.set('notes', ynotes);
    ytracks.set(track.id, ytrack);
  }
}
```

**注意**：Yjs 的 Map/Array 不能直接用普通对象 push，必须 `new Y.Map()` / `new Y.Array()` 或用 `y.array.push([obj])`（obj 会自动变成 Y.Map）。

### Decision: 前端 Zustand + Yjs 双轨模式
```ts
// 真实数据源：Yjs
// UI 缓存：Zustand
// Yjs 变化 → 监听 → Zustand setState → React 重渲染

function useYjsRoom(roomId: string) {
  const docRef = useRef<Y.Doc | null>(null);
  const store = useTrackEditorStore();

  useEffect(() => {
    const doc = new Y.Doc();
    docRef.current = doc;

    // Socket.IO 连接
    const socket = io({ auth: { token, roomId } });

    // y-socket.io provider
    provider = new SocketIOProvider(socket, doc);

    // 首次：如果 Yjs 是空的，从 REST 初始化
    socket.on('initData', (restTracks) => {
      if (doc.getMap('tracks').size === 0) {
        restToYjs(doc, restTracks);
      }
    });

    // 监听 Yjs 变化 → Zustand 更新
    doc.observeDeep(() => {
      store.setState(yjsToState(doc));
    });

    return () => { socket.disconnect(); doc.destroy(); };
  }, [roomId]);
}
```

**本地优先**：用户自己编辑时，Yjs 更新立即触发 → Zustand 更新 → UI 立即反映 → Yjs 同步广播。其他成员收到广播后各自的 Yjs 也更新 → 各自 Zustand 更新 → 各自 UI 反映（~100ms 延迟）。

### Decision: 初始状态的"冷启动"问题
**场景**：房间结束后，SQLite 有 Track/Note 数据。下次有人进入这个房间（重新创建新 Yjs 文档），需要从 REST 数据初始化 Yjs。

**流程**：
1. 前端先 REST GET `/rooms/:id` 拿到 tracks + notes
2. 建立 Socket.IO + Yjs 连接
3. 如果 Yjs 文档是空的（服务端 SQLite yjs_docs 表无记录），前端把 REST 数据写入 Yjs
4. 后续 Yjs 成为唯一数据源

**优化**：服务端 Socket.IO `connection` 事件时，如果 Yjs 文档是空的，可以自己查 REST 数据初始化，前端就省一步。但两种做法都可以，先前端做。

## Risks / Trade-offs

**[风险] Yjs 文档与 SQLite Track/Note 表数据不一致** → 协同编辑时 Yjs 是真实数据源，SQLite 可能有脏数据（REST 写的 vs Yjs 写的）。MVP 接受——先不做 Yjs → SQLite 同步回写，或者在房间结束时做一次全量覆盖。这个问题比看起来小，因为 Phase 3 的 REST API 在 Phase 5 后实际上不会被协同场景下的用户使用（都走 Yjs 交互了）。

**[风险] Socket.IO + Yjs 引入的复杂度** → 调试难。建议：
- Socket.IO 层面加事件日志（debug 模式）
- Yjs 层面：在 observeDeep 中打印更新内容摘要（debug 模式）
- 生产模式只打错误日志

**[风险] 房间成员离开/结束合奏时 Yjs 文档的生命周期管理** → MVP：Yjs 文档在内存中保留，Socket.IO room 中最后一个用户断开时清理内存中的 Y.Doc + 停持久化定时器。SQLite yjs_docs 表保留编码，下次有人进入同一房间时重新加载。

**[风险] y-socket.io npm 包的稳定性** → npm 上可能包名变动或维护状态不稳定。design 建议先调研确认包名，如果没有稳定包就手动实现 Yjs sync over Socket.IO（约 100-200 行）。

## Open Questions

- **Socket.IO 用 namespace 还是普通 room？** 推荐：namespace `/collab`（专用协同通道），room 用 `room:${roomId}`。这样可以把 Socket.IO 协同和后续 WebRTC 信令（Phase 6）分开在不同 namespace。
## Purpose

让多个用户在同一个房间里实时协同编辑轨道和音符——任何一个人的编辑操作（添加音符、移动、删除、solo/mute）其他成员能立即看到，冲突通过 Yjs CRDT 自动合并无需人工处理。成员在线/离线状态也实时推送。Yjs 文档持久化防止重启丢失。

## ADDED Requirements

### Requirement: Socket.IO 鉴权与房间加入
Socket.IO 连接 MUST 用 JWT access token 鉴权，并校验用户是目标房间成员。

#### Scenario: Socket.IO 连接鉴权成功
- **WHEN** 客户端连接 Socket.IO namespace `/` 带 `auth: { token, roomId }`
- **THEN** 服务端验证 access token → 查询用户是否为 roomId 房间成员 → 成功则允许连接并加入 Socket.IO room

#### Scenario: Socket.IO 连接鉴权失败
- **WHEN** token 无效/过期 或 用户不是房间成员
- **THEN** Socket.IO 连接被拒绝（client 收到 connect_error）

#### Scenario: 重连
- **WHEN** Socket.IO 连接中断后客户端自动重连
- **THEN** 服务端重新鉴权 + 加入 room，Yjs 自动同步重连期间的操作

### Requirement: Yjs CRDT 多人协同编辑
后端 MUST 为每个活跃房间维护一个 Y.Doc，多人通过 y-websocket provider 实时同步编辑。

#### Scenario: A 用户添加音符，B 用户立即看到
- **WHEN** A 在钢琴卷帘上添加一个新音符
- **THEN** Yjs 产生一次更新
- **AND** B 的 Yjs provider 自动接收更新
- **AND** B 的 PianoRoll UI 在 100ms 内（网络延迟）显示新音符

#### Scenario: A 用户移动音符，B 用户实时追踪
- **WHEN** A 拖拽一个音符到新位置
- **THEN** B 的音符位置同步变化，B 看到一个音符"滑"到新位置（不是跳变）

#### Scenario: 两人同时编辑不同轨道，自动合并
- **WHEN** A 在钢琴轨编辑，B 在鼓轨编辑
- **THEN** 各自操作都被正确合并，互不干扰
- **AND** 最终所有轨道数据正确反映两人的操作

#### Scenario: 两人同时编辑同一音符（极端冲突）
- **WHEN** A 和 B 同时修改同一个音符的 pitch
- **THEN** Yjs CRDT 自动决策保留哪一个（按 clientID 排序规则）
- **AND** 合并结果对两人一致（最终状态收敛）

### Requirement: Yjs 文档结构
每个房间的 Yjs 文档 MUST 包含完整的轨道和音符数据结构，与 Phase 3 的 Track/Note 模型对应。

#### Scenario: Yjs 数据映射
- **WHEN** 客户端连接 Yjs 文档
- **THEN** 文档 root 包含：
  - `doc.getMap('tracks')` → 以 trackId 为 key 的 Map，每个轨道是一个 Y.Map（name, instrumentType, color, solo, mute, position）
  - 每个轨道 Map 里有 `notes` key → Y.Array，每个音符是 Y.Map（pitch, startTimeTicks, durationTicks, velocity）

#### Scenario: 初始状态从 REST API 加载
- **WHEN** 第一个用户连接一个房间的 Socket.IO + Yjs
- **AND** 该房间 Yjs 文档在 SQLite 持久化表中不存在（首次）
- **THEN** 客户端先 GET `/api/v1/rooms/:id` 拿到当前 Track + Note 数据
- **AND** 将 REST 数据写入 Yjs 文档作为初始状态
- **AND** 后续 Yjs 成为真实数据源（REST 只读，写入走 Yjs）

### Requirement: Yjs 文档 SQLite 持久化
后端 MUST 将每个房间的 Yjs 文档编码持久化到 SQLite，服务重启后恢复。

#### Scenario: 持久化时机
- **WHEN** Yjs 文档发生任何更新
- **THEN** 服务端 debounce 500ms 后将完整编码写入 SQLite 表 `yjs_docs`
- **AND** 写入内容是 `Y.encodeStateAsUpdate(doc)` 或 `Y.encodeStateAsSnapshot(doc)` 的结果（Uint8Array → BLOB）

#### Scenario: 服务重启后恢复
- **WHEN** 后端服务重启，某个活跃房间有用户连接
- **THEN** 服务端从 SQLite 读取该房间的 Yjs 文档编码
- **AND** `Y.applyUpdate(doc, savedUpdate)` 恢复内存 Yjs 文档状态
- **AND** 客户端连接后直接同步已恢复的状态

#### Scenario: 首次无持久化记录
- **WHEN** Yjs 文档首次更新（SQLite 中无记录）
- **THEN** 在 yjs_docs 表中 INSERT 一条新记录（id = roomId，ydoc = encoded Uint8Array）

### Requirement: 成员在线状态实时推送
Socket.IO MUST 推送成员在线/离线事件，让房间内所有用户知道谁还在。

#### Scenario: 新成员加入
- **WHEN** 某个用户连接 Socket.IO 进入房间
- **THEN** 服务端向该 room 广播 `member:online` 事件，含 `{ userId, username }`
- **AND** 已有成员的前端 RoomDetail 成员列表实时增加一行

#### Scenario: 成员断开
- **WHEN** 某个用户的 Socket.IO 连接断开（关闭浏览器、网络中断、离开房间）
- **THEN** 服务端向该 room 广播 `member:offline` 事件，含 `{ userId }`
- **AND** 其他成员的前端 RoomDetail 成员列表标记该用户为离线

#### Scenario: 初始在线列表
- **WHEN** 用户连接成功
- **THEN** 服务端立即推送当前已连接的成员列表（不是等有人 join/leave 才推送）

### Requirement: REST API 与 Yjs 双写策略
Phase 3 的 Track/Note REST API MUST 暂时保留用于初始化加载和单用户离线编辑，实时协同场景下 Yjs MUST 是真实数据源。

#### Scenario: 协同编辑时 REST 写入被覆盖
- **WHEN** 用户（A）在协同编辑中通过 REST API 写入一个音符
- **THEN** 该音符会被写进 SQLite
- **AND** 但其他协同用户（B、C）的 Yjs 文档可能不包含这条记录（除非 A 也通过 Yjs 广播了）
- **AND** 用户应该主要通过 PianoRoll 上的 Yjs 交互来编辑，REST 用于兜底和恢复场景

#### Scenario: 房间结束后从 Yjs 回写 SQLite（可选）
- **WHEN** 房主结束合奏（room.status = ended）
- **THEN** 后端从该房间的 Yjs 文档读取完整 tracks + notes 数据
- **AND** 全量覆盖写入 SQLite 的 Track/Note 表
- **AND** 之后该房间的只读数据统一从 SQLite 读取

### Requirement: 前端 Socket.IO + Yjs 连接
房间详情页 MUST 建立 Socket.IO 连接（鉴权 + 加入房间）和 Yjs 连接。

#### Scenario: 首次进入房间
- **WHEN** 用户导航到 `/rooms/:id`
- **THEN** 前端先 GET `/api/v1/rooms/:id` 拿到初始 Track + Note 数据（如果 Yjs 是首次）
- **AND** 建立 Socket.IO 连接（带 token + roomId 鉴权）
- **AND** 建立 y-websocket provider 连接（指向 Socket.IO namespace）
- **AND** 同步完成后 PianoRoll 和 TrackList 显示 Yjs 实时状态

#### Scenario: 协同编辑的本地优先渲染
- **WHEN** 用户自己编辑一个音符（拖/删）
- **THEN** 前端立即在本地 Yjs 文档中产生更新
- **AND** 本地 PianoRoll 立即反映（无网络延迟）
- **AND** Yjs 自动广播到其他成员
- **AND** 其他成员有 ~100ms 延迟看到

### Requirement: 离线与重连
客户端离线期间的编辑 MUST 在重连后自动合并。

#### Scenario: 用户临时断网重连
- **WHEN** 用户网络中断 30 秒期间编辑了几个音符
- **AND** Socket.IO 自动重连成功
- **THEN** 客户端 Yjs 将离线期间的更新同步到服务器
- **AND** 服务器将服务器侧更新同步给客户端
- **AND** 双方状态自动合并一致
- **AND** 用户无感知

#### Scenario: 关闭浏览器后重开
- **WHEN** 用户关闭浏览器再打开同一个房间
- **THEN** Socket.IO 新连接、Yjs 新建 provider
- **AND** 从服务端 Yjs 文档加载最新状态
- **AND** 恢复到关闭前大家协同编辑的最终状态
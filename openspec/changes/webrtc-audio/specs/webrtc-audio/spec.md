## Purpose

让房间内的多个用户能够实时 Peer-to-Peer 音频通话——边编曲边语音讨论。信令复用 Phase 5 Socket.IO 基础设施，STUN 用 Google 公共服务器做 NAT 穿透，MVP 不配 TURN 服务器（同局域网和大多数公网 IP 场景可直连）。

## ADDED Requirements

### Requirement: WebRTC 信令通道
Socket.IO MUST 提供 WebRTC 信令交换能力，处理 offer/answer/ICE candidate 三类消息。

#### Scenario: 信令走现有 Socket.IO namespace
- **WHEN** 房间内用户 A 发起或接收 WebRTC offer
- **THEN** 信令消息通过房间内 Socket.IO connection 点对点发送（`socket.emit('webrtc:signal', { to, signal })` → `socket.to(to).emit(...)`）
- **AND** 不创建新的 Socket.IO connection

#### Scenario: Offer-Answer 流程
- **WHEN** 用户 A 想和房间内所有其他人通话
- **THEN** A 向已在语音通道的每个成员发送 offer（逐一建立 PeerConnection）
- **AND** 收到 offer 的 B/C/D 各自生成 answer 回复
- **AND** 所有 PeerConnection 建立完成后，A 能听到 B/C/D，B 能听到 A/C/D，以此类推

#### Scenario: ICE Candidate 交换
- **WHEN** 任一方 PeerConnection 产生 ICE candidate
- **THEN** 通过 Socket.IO 发送给对端
- **AND** 对端用 `addIceCandidate` 加入本地 PeerConnection

### Requirement: 语音通道加入/离开
Socket.IO MUST 维护房间内正在语音通话的成员列表。

#### Scenario: 加入语音通道
- **WHEN** 用户点击"打开麦克风"按钮
- **THEN** 调用 `getUserMedia({ audio: true })` 获取本地音频流
- **AND** 向房间广播 `webrtc:join` 事件
- **AND** 已在语音通道的每个成员向新成员发送 offer
- **AND** 新成员收到 offer 后回复 answer

#### Scenario: 离开语音通道
- **WHEN** 用户点击"关闭麦克风"按钮
- **THEN** 关闭本地所有 PeerConnection（`peerConnection.close()`）
- **AND** 停止本地音频流（`getTracks().forEach(t => t.stop())`）
- **AND** 向房间广播 `webrtc:leave` 事件

#### Scenario: 成员断开 Socket.IO 连接
- **WHEN** 正在语音通话的成员 Socket.IO 连接断开
- **THEN** 所有其他成员自动清理与该成员的 PeerConnection

### Requirement: 麦克风静音控制
用户 MUST 能单独控制自己的麦克风开/关状态，静音后仍保持连接但不发送音频。

#### Scenario: 切换静音
- **WHEN** 用户点击自己的麦克风图标（成员列表中）
- **THEN** 本地音频流的 track.enabled = false / true 切换
- **AND** 向房间广播 `member:muted` / `member:unmuted` 事件
- **AND** 其他成员的 UI 显示该用户的麦克风图标变为"静音"样式（如红色斜线）

#### Scenario: 浏览器 getUserMedia 权限拒绝
- **WHEN** 用户首次点击"打开麦克风"但浏览器权限请求被拒绝
- **THEN** 捕获 `getUserMedia` 的 NotAllowedError
- **AND** UI 显示友好提示"麦克风权限被拒绝，请在浏览器设置中允许"
- **AND** 不尝试建立 WebRTC 连接

### Requirement: 前端 WebRTC 管理器
前端 MUST 提供封装好的 WebRTC 管理器，处理 PeerConnection 创建/销毁/信令/本地流管理。

#### Scenario: 同时与多人通话（mesh 拓扑）
- **WHEN** 房间内有 N 个人同时开启语音
- **THEN** 每个用户维护 N-1 个 RTCPeerConnection（完整 mesh 拓扑）
- **AND** 每个 PeerConnection 独立处理 offer/answer/ICE

#### Scenario: STUN 配置
- **WHEN** 创建 RTCPeerConnection
- **THEN** configuration 中 iceServers 含 Google 公共 STUN 服务器：
  ```
  [{ urls: 'stun:stun.l.google.com:19302' },
   { urls: 'stun:stun1.l.google.com:19302' },
   { urls: 'stun:stun2.l.google.com:19302' }]
  ```
- **AND** 不配置 TURN 服务器

### Requirement: WebRTC 安全
WebRTC 信令和媒体传输 MUST 使用加密通道。

#### Scenario: Socket.IO 走 WSS
- **WHEN** 生产环境部署（非 localhost）
- **THEN** Socket.IO 连接使用 WSS（WebSocket Secure）
- **AND** 后端 Socket.IO 强制 wss 或由上层 TLS 终止（nginx proxy）

#### Scenario: WebRTC 媒体走 DTLS-SRTP
- **WHEN** RTCPeerConnection 建立媒体通道
- **THEN** 浏览器自动使用 DTLS-SRTP 加密音频流（WebRTC 标准）
- **AND** 不暴露原始音频数据给任何中间层

### Requirement: 成员列表 UI 扩展
RoomDetail 页面的成员列表 MUST 显示每个成员的麦克风状态。

#### Scenario: 麦克风状态显示
- **WHEN** 进入房间且语音通道活跃
- **THEN** 成员列表中每个成员旁显示麦克风图标
- **AND** 有声时图标显示，静音时图标变灰/红色斜线，未加入语音通道时不显示
- **AND** 自己的麦克风图标可点击切换状态

#### Scenario: 说话指示器（可选增强）
- **WHEN** 某个成员正在说话
- **THEN** 其他成员的 UI 上该成员卡片有轻微高亮（如边框闪烁 200ms）
- **AND** MVP 可选——如实现简单就做，否则后续加
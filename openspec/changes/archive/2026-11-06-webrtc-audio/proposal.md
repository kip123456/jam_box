## Why

多人已经能实时协同编辑乐谱了（Phase 5），现在需要让多人在同一个房间里能"边聊边玩"——WebRTC Peer-to-Peer 音频通话。信令复用 Phase 5 已有的 Socket.IO 基础设施，STUN 用 Google 公共服务器，MVP 不配置 TURN（同局域网或公网 IP 可达场景覆盖）。

## What Changes

- **Socket.IO `/webrtc` namespace**（或复用 `/collab` namespace 里加事件）：
  - `webrtc:signal` → NAT 交换 offer/answer/ICE candidate
  - `webrtc:join` → 加入语音通道
  - `webrtc:leave` → 离开语音通道
- **前端 WebRTC 管理器**：`frontend/src/lib/webrtc.ts`，封装 RTCPeerConnection + getUserMedia + Socket.IO 信令
- **成员列表 UI 扩展**：RoomDetail 成员列表里每个人显示麦克风图标（开/关状态），点击切换静音/取消静音
- **语音状态推送**：`member:muted` / `member:speaking` 事件推送给房间内其他成员

## Capabilities

### New Capabilities
- `webrtc-audio`: WebRTC Peer-to-Peer 音频通话、Socket.IO 信令交换、麦克风静音控制

### Modified Capabilities
（无）

## Impact

- **新增文件**：`frontend/src/lib/webrtc.ts`、`frontend/src/components/webrtc/`
- **Socket.IO 扩展**：在 Phase 5 的 `/collab` namespace 或新 `/webrtc` namespace 中增加 WebRTC 信令事件
- **依赖**：无新增 npm 包（全部用浏览器原生 WebRTC API + 已有 socket.io-client）
- **STUN**：硬编码 Google 公共 STUN server（`stun:stun.l.google.com:19302`），不配 TURN
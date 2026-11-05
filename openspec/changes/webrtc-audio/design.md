## Context

Phase 5 提供了 Socket.IO（`/collab` namespace）。现在需要在同一个房间内实现 WebRTC 音频通话——信令直接复用 Socket.IO room 里的 `socket.emit('webrtc:signal', ...)`。WebRTC 纯浏览器端能力（getUserMedia + RTCPeerConnection），后端只做 NAT 穿透信令转发。MVP 不配 TURN，只配 Google STUN。

## Goals / Non-Goals

**Goals:**
- WebRTC mesh 拓扑多人音频通话
- Socket.IO 信令交换（offer/answer/ICE）
- 麦克风开/关 + 静音控制
- 成员列表 UI 显示语音状态
- getUserMedia 权限错误处理

**Non-Goals:**
- 不配置 TURN 服务器（同局域网和对称 NAT 外的场景可能不可用）
- 不实现 SFU（多人 mesh 拓扑，后续超过 5-6 人时考虑 mediasoup）
- 不实现屏幕共享/视频
- 不实现音频增强（降噪、回声消除等——浏览器自动做的足够）
- 不实现房间录音
- 不实现说话音量指示器（可选增强，MVP 不强制）
- 不实现音频设备选择（默认麦克风，后续加）

## Decisions

### Decision: 用完整 mesh 拓扑而非 SFU
**选择**：每个用户维护 N-1 个 RTCPeerConnection（mesh），不引入 SFU。

**理由**：
- MVP 用户量小（合奏盒子每个房间通常 ≤ 5 人），mesh 完全够用
- 零后端依赖（不需要 mediasoup/pion 等），后端只做信令转发
- 实现简单，前端代码清晰

**边界**：当单个房间超过 6-8 人时，mesh 带宽爆炸（每人 N-1 路上行），那时再引入 SFU。design 里明确记录这个升级路径。

### Decision: 信令事件格式
```ts
// Socket.IO client
interface WebrtcSignalPayload {
  to: string;        // 目标 socket.id
  from: string;      // 发送者 socket.id
  signal: {
    type: 'offer' | 'answer';
    sdp: string;
  } | {
    type: 'ice';
    candidate: RTCIceCandidateInit;
  };
}
```

**后端 Socket.IO 路由**（挂在 `/collab` namespace）：
```ts
socket.on('webrtc:signal', (payload) => {
  socket.to(payload.to).emit('webrtc:signal', { ...payload, from: socket.id });
});
socket.on('webrtc:join', () => {
  socket.broadcast.to(room).emit('webrtc:joined', { userId, username });
});
socket.on('webrtc:leave', () => {
  socket.broadcast.to(room).emit('webrtc:left', { userId });
});
```

### Decision: 前端 WebRTC 管理器接口
```ts
// frontend/src/lib/webrtc.ts
class WebRTCManager {
  private socket: Socket;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private localStream: MediaStream | null = null;
  private isMuted = false;

  async join(): Promise<void>          // getUserMedia + create peer connections with existing members
  async leave(): Promise<void>         // close all connections + stop stream
  toggleMute(): boolean                // toggle track.enabled, return new state

  // 内部
  private async createOffer(to: string, pc: RTCPeerConnection)
  private async handleOffer(from: string, offer: RTCSessionDescriptionInit)
  private async handleAnswer(from: string, answer: RTCSessionDescriptionInit)
  private handleIce(from: string, candidate: RTCIceCandidateInit)
}
```

### Decision: STUN 硬编码，TURN 不配置
```ts
const PC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};
```

**MVP 接受的局限**：两个用户在对称 NAT 后面时 WebRTC 可能不可连。用户反馈后再加 TURN（coturn 或 cloudflare 免费方案）。design 里记录升级路径。

### Decision: 说话指示器用简单的时间窗口检测
MVP 可选：监听 RTCPeerConnection 的 `ontrack` 事件 → 给接收到的 AudioTrack 挂 Web Audio API 的 AnalyserNode → 每 200ms 采样 → 音量超过阈值标记"正在说话"。如果实现简单就做，否则后续加。不影响核心功能。

## Risks / Trade-offs

**[风险] 对称 NAT 用户之间 WebRTC 不可连** → MVP 接受。Phase 6 实现后如果用户反馈多，加 coturn TURN 服务器（Docker 镜像一行就能跑，配置几行）。

**[风险] mesh 拓扑的带宽压力** → 单房间超过 6 人时用户体验下降。MVP 阶段目标用户数小。如果实际使用中需要支持大房间，引入 mediasoup SFU（需要后端 Node.js 集成）。

**[风险] 浏览器自动混音** → mesh 拓扑下用户接收多路音频，浏览器自动混音。但如果音频回声大，浏览器内置的 AEC（Acoustic Echo Cancellation）可能处理不好。建议在 getUserMedia constraints 里显式 `echoCancellation: true, noiseSuppression: true`。

**[风险] Socket.IO event name 冲突** → Phase 5 的 `/collab` namespace 已有成员事件。WebRTC 事件用 `webrtc:` 前缀区分，避免冲突。

## Open Questions

- **说话指示器 MVP 要不要做？** 技术上简单但实现时看时间——如果 30 行内搞定就加，否则留到后续。先在 tasks 里标记为可选任务。
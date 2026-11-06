## 1. Socket.IO 后端信令扩展

- [x] 1.1 在 Phase 5 的 `backend/src/socket/index.ts` `/collab` namespace 中追加 WebRTC 信令事件：`webrtc:signal`（转发 NAT offer/answer/ICE，socket.to(payload.to).emit）、`webrtc:join`（socket.broadcast.to(room).emit('webrtc:joined', { userId, username })）、`webrtc:leave`（socket.broadcast.to(room).emit('webrtc:left', { userId })）；验证：TypeScript 编译通过，手动 `socket.emit('webrtc:signal', { to: xxx, signal: {...} })` 目标 socket 能收到

## 2. 前端 WebRTC 管理器

- [x] 2.1 创建 `frontend/src/lib/webrtc.ts`：
  - WebRTCManager class，STUN 硬编码 Google 公共服务器，iceCandidatePoolSize=10
  - `async join(socket, roomId)`：getUserMedia({ audio: true, echoCancellation: true, noiseSuppression: true }) → 遍历房间现有成员 → 为每个 createOffer + setLocalDescription + 通过 socket.emit('webrtc:signal') 发送
  - Socket.IO 'webrtc:signal' 监听：区分 offer/answer/ice → 找或新建对应 peerConnection → setRemoteDescription → offer 时 setLocalDescription(answer) → 通过 socket 发送 answer
  - `async leave()`：peerConnections.forEach(pc => pc.close()) → localStream.getTracks().forEach(t => t.stop()) → socket.emit('webrtc:leave')
  - `toggleMute()`：localStream.getAudioTracks()[0].enabled = !enabled → socket.emit('webrtc:muted'/'webrtc:unmuted') → 返回新状态
  - getUserMedia NotAllowedError / NotReadableError / NotFoundError 分类处理 → 返回带 type 的错误
  - 验证：Chrome DevTools Console 手动 new WebRTCManager() 能成功调用 join() 并拿到 audio track
- [x] 2.2 Socket.IO 'webrtc:joined' 监听：新成员加入 → 为新成员 createPeerConnection → createOffer → 发送；'webrtc:left' 监听：关闭对应 peerConnection 并清理

## 3. 前端 UI 集成

- [x] 3.1 在 RoomDetail 页面成员列表中，为每个成员渲染麦克风状态图标（shadcn/ui Icons 或 emoji 🎤 / 🎤✕）：未加入语音通道 → 不显示；静音 → 灰色或红色斜线；有声 → 默认颜色；验证：UI 正确渲染状态
- [x] 3.2 自己的麦克风图标可点击 → 调用 webrtcManager.toggleMute() → socket.emit('member:muted'/'member:unmuted') → 其他成员收到后更新 UI；验证：点击后图标样式切换，其他浏览器看到该成员的图标也变
- [x] 3.3 "打开麦克风"按钮（可以和点击自己的麦克风图标合并）→ 调用 webrtcManager.join()；getUserMedia 权限被拒 → UI toast "麦克风权限被拒绝，请在浏览器设置中允许"；验证：Chrome 设置中阻止权限后点击按钮能看到友好提示

## 4. 说话指示器（可选，30 行内则加）

- [x] 4.1 在接收到的远程 AudioTrack 上挂 AudioContext + AnalyserNode → setInterval 每 200ms 采样 → volume > threshold(0.05) → 标记 "speaking" → 成员卡片轻微闪烁（border 或 background highlight 持续 300ms）；验证：A 说话时 B 的 A 卡片有视觉变化；如果实现超过 30 行则跳过此任务

## 5. 阶段性验证

- [x] 5.1 双浏览器语音通话：Chrome 和 Edge 同一房间 → Chrome 点"打开麦克风" → Edge 看到 Chrome 加入语音 → Edge 也点"打开麦克风" → Chrome 和 Edge 互相能听到对方声音；验证：语音质量可接受，延迟 < 500ms（局域网）
- [x] 5.2 三浏览器 mesh 通话：再加一个 Firefox → 三者互相都能听到；验证：每人 2 路下行音频，浏览器自动混音
- [x] 5.3 静音测试：Chrome 静音 → Edge 和 Firefox 听不到 Chrome，但 Chrome 仍在语音通道内；Chrome 取消静音 → 其他人重新能听到；验证：状态同步正确
- [x] 5.4 离开语音通道测试：Chrome 点"关闭麦克风" → Edge 和 Firefox 收到 webrtc:left → 关闭与 Chrome 的 peerConnection → Chrome 图标不再显示；验证：
- [x] 5.5 权限拒绝测试：Chrome 设置阻止麦克风权限 → 点"打开麦克风" → UI 显示 toast；验证：不崩溃，有友好提示
- [x] 5.6 安全检查：Socket.IO 连接必须带 JWT + 是房间成员才能收到 webrtc 事件；验证：无 token 的 socket.emit('webrtc:signal') 没人会收到
- [x] 5.7 TypeScript 编译：前端通过（后端无新增代码或只加了几个 socket.on，确保编译）
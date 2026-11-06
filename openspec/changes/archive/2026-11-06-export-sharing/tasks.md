## 1. 后端依赖与 Prisma 迁移

- [x] 1.1 后端安装 Tone.js：`npm install tone`；可选安装 fluent-ffmpeg：`npm install fluent-ffmpeg`；验证：node_modules 存在，`import * as Tone from 'tone'` 在 Node.js 中不报错
- [x] 1.2 在 `backend/prisma/schema.prisma` 追加 ShareLink model（id String @id @default(cuid()), token String @unique, roomId String, createdAt DateTime @default(now()), expiresAt DateTime?）；验证：`npx prisma validate`
- [x] 1.3 生成迁移：`npx prisma migrate dev --name add-share-link`；验证：数据库有 share_links 表
- [x] 1.4 创建 `backend/storage/exports/` 目录；添加到 `backend/.gitignore`（`storage/exports/`）；验证：git status 不显示该目录
- [x] 1.5 后端启动时自动创建导出目录：在 `backend/src/index.ts` 里 `fs.mkdirSync(path.join(__dirname, '..', 'storage', 'exports'), { recursive: true })`；验证：删除目录后重启后端自动重建

## 2. Job Queue Handler：export-audio

- [x] 2.1 创建 `backend/src/lib/renderer.ts`：Node.js Tone.js OfflineContext 封装
  - `renderTracksToAudio(tracks: TrackWithNotes[], bpm: number, durationTicks: number): Promise<{ sampleRate: number, left: Float32Array, right: Float32Array }>`
  - 为每条 Track 创建对应乐器（piano → PolySynth, guitar → FMSynth, bass → MonoSynth pitch-12, drums → MembraneSynth+MetalSynth）
  - 遍历 notes → synth.triggerAttackRelease(freq, durSec, startSec)
  - await offline.render()
  - 注意：ticks 转 seconds = ticks / (480 * bpm / 60)
  - 验证：测试脚本给 3 条 Track（piano + guitar + drums）各几个 Note → render → 检查返回的 Float32Array 不是全零
- [x] 2.2 创建 `backend/src/lib/wav.ts`：手写 WAV header + Float32 → Int16 转换 → Buffer
  - `encodeWav(sampleRate: number, left: Float32Array, right: Float32Array): Buffer`
  - 验证：生成的 WAV 可以用 Audacity 打开听到声音
- [x] 2.3 创建 `backend/src/lib/encoder.ts`：WAV → MP3 编码
  - `encodeMp3(wavBuffer: Buffer, outputPath: string): Promise<boolean>`（用 fluent-ffmpeg 或 child_process spawn ffmpeg）
  - 先检查 ffmpeg 是否可用（which ffmpeg），不可用时 throw Error → 调用方降级
  - 降级：直接把 WAV Buffer 写入 outputPath 后缀 `.wav`，返回 format='wav'
  - 验证：测试生成一个 WAV → encodeMp3 → 检查输出文件是有效 MP3
- [x] 2.4 创建 `backend/src/queues/handlers/exportHandler.ts`：
  - payload = { roomId, format?, bpm?, durationTicks? }
  - 查 Room 表 + Track 表 + Note 表（优先查 Yjs 文档——通过 Phase 5 暴露的 yjsDocs.get()，如果 Yjs 文档不可用则从 SQLite Track/Note 表）
  - 调 renderer.renderTracksToAudio → wav.encodeWav
  - 尝试 encoder.encodeMp3 → 成功则 .mp3，降级则 .wav
  - Job.result = { fileName, format, duration, url: `/exports/${fileName}`, size }
  - 验证：手动通过 queueClient.submitJob('export-audio', { roomId }) → 等 success → 检查 backend/storage/exports/ 有新文件 → 浏览器访问 /exports/xxx 能听
- [x] 2.5 在 Phase 0 的 handlers.ts registerAll 函数里注册 exportHandler：`registerHandler('export-audio', exportHandler)`；验证：worker 启动日志显示 export-audio 注册成功

## 3. Export / Share Routes 实现

- [x] 3.1 创建 `backend/src/zod/export.ts`：`exportSchema`（format enum wav|mp3, bpm optional int, durationTicks optional int）；验证：safeParse 测试
- [x] 3.2 创建 `backend/src/routes/export.ts`，挂 `/api/v1/rooms/:roomId/export`，全路由过 authenticateAccessToken：
  - POST `/`：zod exportSchema → 校验用户是该房间成员（查 RoomMember）→ queueClient.submitJob('export-audio', payload) → 返回 { jobId }
  - GET `/job/:jobId`：queueClient.getJob → 返回状态轮询（前端每 2 秒调）
  - 验证：curl POST → 拿到 jobId → 多次 GET → success 时返回 result.url
- [x] 3.3 创建 `backend/src/routes/share.ts`，挂 `/api/v1/rooms/:roomId/share`：
  - POST `/`：校验用户是房间成员且 status=ended → 生成 crypto.randomBytes(16).toString('hex') token → prisma.shareLink.create({ token, roomId }) → 返回 { shareUrl: `/shared/${token}` }
  - GET `/shared/:token`（免 JWT 鉴权！单独注册）：校验 token 存在且未过期 → 返回简化 HTML 页面（后端 res.send 或 res.render EJS），显示房间信息 + 一个"查看乐谱"按钮 → 点击前端跳转到 `/rooms/:roomId`（仍需登录，所以如果未登录会被 redirect 到 login）
  - 验证：POST share → 拿到 token → 浏览器访问 /shared/xxx → 看到简化页面
- [x] 3.4 创建 `backend/src/routes/rooms.ts` 的历史列表扩展（或已有 rooms 路由追加）：
  - GET `/api/v1/rooms?status=ended`：校验用户是 RoomMember → prisma.room.findMany where members some userId + status='ended' → orderBy endedAt desc → 返回 [{ id, code, name, bpm, status, endedAt, isHost }]
  - 验证：curl 带 token → 返回用户所有已结束房间
- [x] 3.5 在 `backend/src/index.ts` 挂载新路由：`app.use('/api/v1', shareRouter)`、`app.use('/api/v1/rooms', exportRouter)`、`app.use('/api/v1/rooms', roomsRouter)`；同时挂载静态目录：`app.use('/exports', express.static(path.join(__dirname, '..', 'storage', 'exports')))`；验证：`npx tsc --noEmit` 无错误

## 4. 前端历史房间列表页 + 只读回放

- [x] 4.1 新增前端路由 `/rooms` → 组件 `HistoryRoomsPage.tsx`：调 GET `/api/v1/rooms?status=ended` → 列表（shadcn/ui Card 或 Table），每行显示房间名、房主、BPM、结束时间、"查看"按钮；验证：UI 渲染正确
- [x] 4.2 修改 `/rooms/:id` 路由组件：判断房间 status → 如果 active/locked → 正常协同模式（Phase 5）；如果 ended → 只读模式（隐藏编辑控件、隐藏 AI 面板、隐藏 WebRTC）
- [x] 4.3 只读回放逻辑：底部新增"回放"按钮 → REST API 加载 Track + Note 数据 → Tone.Transport.schedule 按原始时间播放 → PianoRoll 播放头实时移动；验证：点击播放头移动，听到声音
- [x] 4.4 只读模式下底部新增"导出音频"按钮 → POST export → 轮询 → 下载 MP3；验证：导出完整流程
- [x] 4.5 分享按钮：房间详情页（active 或 ended 均可）→ 点击 → POST share → 拿到 URL → 复制到剪贴板（navigator.clipboard.writeText）→ toast "链接已复制"；验证：点击后浏览器有 toast，剪贴板有分享链接

## 5. 阶段性验证

- [x] 5.1 后端 Tone.js 渲染：3 条轨道各 10 个音符 → renderTracksToAudio → 返回非全零 Float32Array；验证：
- [x] 5.2 导出完整流程：创建房间 → 添加 3 条轨道各几个音符 → POST export → 轮询 → 下载文件 → 用 Audacity/VLC 播放 → 能听到合成音乐；验证：
- [x] 5.3 导出降级：删除系统 ffmpeg → 重启后端 → POST export → 返回 .wav 格式 → 下载 → 能播放；验证：
- [x] 5.4 历史房间：先有一个 active 房间 → 结束合奏 → 导航到 `/rooms` → 列表里有这个房间 → 点"查看" → 只读模式 → 回放 → 听到声音；验证：浏览器实测 `/history` 出现「演示合奏·夏夜」卡片 → 查看回放进入 `/rooms/cmw53wq4s0002kid8g116s62m`，无 BPM/循环编辑框、无「添加轨道」「AI 助手」，点击「回放」后播放头 0 → 7 / 16 拍；音频内容由 5.1/5.2/5.3 的渲染导出验证覆盖
- [x] 5.5 分享链接：结束房间 → 点"分享" → 拿到 token → 浏览器访问 /shared/xxx → 看到简化页面 → 点"查看乐谱" → 跳转到登录或房间详情；验证：浏览器访问 `/shared/0123456789abcdef0123456789abcdef` 免登录显示「演示合奏·夏夜 / 888888 / 轨道数 2」，点「查看乐谱」跳转 `/rooms/cmw53wq4s0002kid8g116s62m`；无效 token 返回 404
- [x] 5.6 路径穿越防护：curl /exports/../../../etc/passwd → 404；验证：
- [x] 5.7 TypeScript 编译：前后端通过
- [x] 5.8 安全检查：share 路由必须是房间成员；导出路由必须是房间成员；/exports 静态目录对所有登录用户暴露但文件本身是公开的（可考虑后续加 token 签名）；验证：非成员请求 export 返回 403
- [x] 5.9 ffmpeg 部署检查（手动）：部署到新环境后执行 `ffmpeg -version` → 确认已安装；未安装则 export 降级为 WAV 并打印 warning 日志
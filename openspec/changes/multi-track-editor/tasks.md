## 1. Prisma Track + Note 模型与迁移

- [ ] 1.1 在 `backend/prisma/schema.prisma` 追加 InstrumentType enum、Track model（roomId, name, instrumentType, color, solo, mute, position, createdById?）、Note model（trackId, pitch, startTimeTicks, durationTicks, velocity）；User model 追加 tracks 反向关联；验证：`npx prisma validate` 输出 valid
- [ ] 1.2 生成迁移：`cd backend && npx prisma migrate dev --name add-tracks`；验证：数据库有 Track 表和 Note 表，Track 外键级联删 Track 时自动删 Note

## 2. 后端 Zod Schema

- [ ] 2.1 创建 `backend/src/zod/track.ts`：`instrumentTypeEnum`（z.enum(['piano','guitar','bass','drums'])）、`createTrackSchema`（name 1-50, instrumentType, color hex optional）、`updateTrackSchema`（solo/mute/color/position partial，但 instrumentType/roomId 不可改）；验证：safeParse 边界值测试
- [ ] 2.2 创建 `backend/src/zod/note.ts`：`createNoteSchema`（pitch z.int().min(0).max(127), startTimeTicks z.int().min(0), durationTicks z.int().min(480), velocity z.int().min(0).max(127).default(100)）、`bulkCreateNotesSchema`（z.array(createNoteSchema)）、`bulkUpdateNotesSchema`（z.array({ id: z.string(), pitch?...., startTimeTicks?.... })）、`bulkDeleteNotesSchema`（{ noteIds: z.array(z.string()) }）；验证：safeParse 测试边界值

## 3. 后端 Track + Note Routes

- [ ] 3.1 创建 `backend/src/middleware/roomMember.ts`：类似 requireRoomRole 但只检查"是否是成员"（不检查 role），用于轨道/音符 API；验证：TypeScript 编译通过
- [ ] 3.2 创建 `backend/src/routes/tracks.ts`，全部先过 authenticateAccessToken + requireRoomMember：
  - `POST /`（在 /api/v1/rooms/:roomId/tracks 下）→ zod createTrackSchema → prisma.track.create（position = 当前房间 Track 最大 position + 1）→ 返回
  - `GET /` → prisma.track.findMany(where: { roomId }, include: { notes: true }, orderBy: { position: 'asc' })
  - `GET /:trackId` → 查 Track 校验属于当前房间 → 返回
  - `PUT /:trackId` → zod updateTrackSchema → prisma.track.update → 返回
  - `DELETE /:trackId` → prisma.track.delete（级联删 notes）→ 返回
  - 挂载在 `app.use('/api/v1/tracks', tracksRouter)` 时，room 相关的两个路由在 `app.use('/api/v1/rooms/:roomId/tracks', requireRoomMember, roomTracksRouter)`
- [ ] 3.3 创建 `backend/src/routes/notes.ts`，全部先过 authenticateAccessToken + 校验 Note 所属 Track 属于当前用户所在房间：
  - `POST /`（单个）
  - `POST /bulk` → zod bulkCreateNotesSchema → prisma.$transaction(tx.bulkCreate, ...)
  - `PUT /:noteId`（单个）
  - `PUT /bulk` → zod bulkUpdateNotesSchema → transaction 逐条 update
  - `DELETE /:noteId`（单个）
  - `DELETE /bulk` → zod bulkDeleteNotesSchema → prisma.note.deleteMany(where: { id: { in: noteIds } })
  - `GET /`
  - 挂载在 `app.use('/api/v1/tracks/:trackId/notes', notesRouter)` 时先过 trackBelongsToUser 中间件
- [ ] 3.4 扩展 GET `/api/v1/rooms/:roomId` 响应：追加 tracks 字段（include notes）；验证：`npx tsc --noEmit` 无错误

## 4. 前端依赖安装与 Tone.js 初始化

- [ ] 4.1 前端 package.json 新增 `tone@^14.7.77`、`zustand/immer`（通常 zustand 自带）；验证：npm install 成功，node_modules 有 tone

## 5. 前端房间详情页与路由

- [ ] 5.1 替换 `frontend/src/pages/RoomDetail.tsx` 占位页：加载时 GET `/api/v1/rooms/:id`（含 tracks + notes）→ 存入 Zustand 新 store（roomEditorStore）→ 渲染完整多轨编辑界面；验证：DevTools Network 看到 GET `/api/v1/rooms/:id` 携带 tracks 数据
- [ ] 5.2 在 router/index.tsx 中 `/rooms/:id` 路由指向 RoomDetail 组件；验证：访问房间详情 URL 渲染多轨界面

## 6. TrackList 组件

- [ ] 6.1 创建 `frontend/src/components/TrackList.tsx`：从 roomEditorStore 取 tracks 按 position 渲染；每条渲染乐器图标（piano🎹/guitar🎸/bass🎧/drums🥁 emoji 或 icon）、轨道名（input 可编辑）、solo/mute 开关（shadcn/ui Switch 组件）、删除按钮；底部"添加轨道"按钮 → shadcn/ui Select 选乐器 → POST 创建 Track → 重新加载；验证：UI 正确渲染，solo/mute 切换 store 状态（但还不会影响播放）

## 7. PianoRoll 组件（DOM div 实现）

- [ ] 7.1 创建 `frontend/src/components/PianoRoll.tsx`：
  - 状态：当前选中轨道（trackId）、当前 hover 音高
  - 网格渲染：背景 div 用 CSS grid，列 = 480 ticks 宽（一个小格），行 = 一个 MIDI 音高（cellHeight=8px）
  - 音符渲染：每个 Note 渲染为绝对定位 div（top = (127 - pitch) * cellHeight, left = startTimeTicks * pxPerTick, width = durationTicks * pxPerTick, height = cellHeight, backgroundColor = track.color）
  - 拖拽添加：pointerdown 在空白网格处 → 创建新 Note（默认 durationTicks=480, velocity=100）→ POST 到后端 → store 更新
  - 拖拽移动：pointerdown 在音符上 → 记录起始 pitch/timeTicks → pointermove 更新 top/left（吸附到网格）→ pointerup → PUT bulk 到后端
  - 删除：选中音符（点击高亮）→ Delete 键 → DELETE bulk 到后端
  - 时间轴 + 钢琴键盘：顶部显示 BPM 标尺，左侧显示 A0-C8 钢琴键（黑白键区分）
  - 验证：能在 PianoRoll 上添加一个音符、拖动它、删除它，每次操作 Network 看到对应的 API 调用

## 8. PlayControls + Tone.js 播放

- [ ] 8.1 创建 `frontend/src/components/PlayControls.tsx`：播放/暂停/停止按钮、BPM 输入框（default 120, range 40-240）、循环起止输入
- [ ] 8.2 创建 `frontend/src/lib/audio.ts`：封装 Tone.js 初始化和播放逻辑
  - `ensureAudio()`：首次调用时 await Tone.start()（必须在用户交互回调中）
  - `play(roomEditorStore.tracks, bpm)`：创建 PolySynth → 对每个 Track 创建 Tone.Part（调度每个 Note 的 AttackRelease 事件）→ Tone.Transport.bpm.value = bpm → Tone.Transport.start()
  - `stop()`：Tone.Transport.stop() → Tone.Transport.position = 0:0:0
  - solo/mute 逻辑：solo 激活时只放 solo 轨道；mute 激活轨道不放；两者叠加计算有效轨道集合
  - 播放头更新：用 requestAnimationFrame 或 Tone.Transport.scheduleRepeat 每 50ms 读取 Transport.position 更新 React 状态
  - 乐器音色映射：MVP 四种轨道都用 PolySynth，后续 Phase 4/5 换
  - 验证：点击播放按钮 → ensureAudio 成功 → PolySynth 发声 → 听得到钢琴音 → 暂停 → 声停止

## 9. 撤销/重做

- [ ] 9.1 在 roomEditorStore 中实现 past/future 栈（用 immer 的 undoRedo middleware 或手动维护）：每次 addNote/updateNote/deleteNote/bulkUpdate 等 mutation 前，将当前 state 快照 push 到 past，clear future；maxHistory = 50；验证：Ctrl+Z 撤销最后一次操作（如添加音符被删掉），Ctrl+Shift+Z 重做回来

## 10. 阶段性验证

- [ ] 10.1 后端 API 测试：用已有房间（Phase 2 创建的）→ 创建 4 个不同乐器轨道 → GET `/rooms/:id` 返回 tracks 含 notes → POST bulk 创建 10 个 notes → PUT bulk 更新 5 个 → DELETE bulk 删除 3 个；验证每个 curl 场景结果符合 spec
- [ ] 10.2 前端交互：进入房间详情 → 看到 TrackList（4 个轨道） → 点击轨道选中 → 在 PianoRoll 添加一个 C4 音符（听到钢琴音）→ 拖动音符到 G4（pitch 变化）→ 删除 → 撤销（Ctrl+Z 恢复）→ 重做；验证每步 Network 面板有正确 API 调用
- [ ] 10.3 多轨道同时播放：创建钢琴 + 吉他两个轨道各有旋律 → 点击播放 → 听到两个音色同时发声 → 吉他轨道 mute → 只有钢琴 → 钢琴轨道 solo → 吉他轨道也不响；验证 solo/mute 逻辑正确
- [ ] 10.4 房间详情 API 集成：GET `/api/v1/rooms/:id` 一次拿到房间信息 + tracks + 所有 notes → 前端单次渲染；验证 Network 面板只有一个请求
- [ ] 10.5 TypeScript 编译：前后端 `npx tsc --noEmit` 都通过
- [ ] 10.6 Tone.js AudioContext 安全验证：Chrome DevTools Console 查看 AudioContext 状态——首次播放前是 suspended，播放后是 running；验证：在没有任何用户交互时 AudioContext 不会自动启动
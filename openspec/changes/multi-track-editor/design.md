## Context

Phase 0-2 提供了 Prisma + SQLite + User/Room/RoomMember 模型 + JWT 鉴权。现在需要 Track 和 Note 两个新模型，以及一套完整的轨道/音符 REST API 和前端多轨编辑 UI（钢琴卷帘、Tone.js 播放、撤销/重做）。详见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- Track + Note Prisma model + 迁移
- 轨道和音符的完整 REST API（含批量操作）
- 前端完整多轨编辑界面（TrackList + PianoRoll + PlayControls）
- Tone.js 本地合成播放
- zustand/immer 实现撤销/重做

**Non-Goals:**
- 不实现多人实时协同编辑（Phase 5 用 Yjs 做）—— Phase 3 单人编辑，多人各自编辑然后手动刷新看
- 不实现 AI 自动编曲（Phase 4）
- 不实现 WebRTC 音频（Phase 6）
- 不实现 MID 文件导入导出（Phase 7）
- 不实现分轨音量/声像调节（solo/mute 足够，后续加）
- 不实现和弦自动生成（Phase 4 AI 做）

## Decisions

### Decision: Track + Note Prisma model
```prisma
model Track {
  id            String          @id @default(cuid())
  roomId        String
  name          String
  instrumentType InstrumentType
  color         String          @default("#3b82f6")
  solo          Boolean         @default(false)
  mute          Boolean         @default(false)
  position      Int
  createdAt     DateTime        @default(now())
  createdById   String?
  room          Room            @relation(fields: [roomId], references: [id], onDelete: Cascade)
  notes         Note[]

  @@index([roomId])
}

enum InstrumentType { piano guitar bass drums }

model Note {
  id             String   @id @default(cuid())
  trackId        String
  pitch          Int      // MIDI 0-127
  startTimeTicks Int      // tick 单位，480 ticks = 1/4 拍
  durationTicks  Int      // 最短 480（MVP 不做 1/8 拍）
  velocity       Int      // 0-127, default 100
  track          Track    @relation(fields: [trackId], references: [id], onDelete: Cascade)

  @@index([trackId])
}
```

### Decision: 时间粒度固定 480 ticks = 1/4 拍
**选择**：MVP 固定 `resolution = 480`（1 个四分音符 = 480 ticks），duration 最小 480（即不支持半分音符/八分音符）。

**理由**：
- 简化钢琴卷帘网格渲染（每个小格就是一个四分音符单位）
- 前端拖拽对齐逻辑简单
- 后续需要时改成变量 resolution 或支持 240/120 ticks 细分网格

**Tick → 秒转换**：`seconds = (ticks / 480) * (60 / BPM)`

### Decision: Tone.js 初始化策略
```ts
// 不要在模块顶层 new Tone.Synth()——浏览器自动暂停 AudioContext
let audioInitialized = false;

async function ensureAudio() {
  if (!audioInitialized) {
    await Tone.start(); // 必须在用户交互（点击播放按钮）中调用
    audioInitialized = true;
  }
}

// 播放时用 Tone.Part 调度音符事件
function schedulePart(track: Track, bpm: number) {
  const part = new Tone.Part((time, note) => {
    synth.triggerAttackRelease(Tone.Frequency(note.pitch, "midi"), tone.secondsToTicks(note.durationTicks * 60 / bpm / 480), time);
  }, track.notes.map(n => ({ time: n.startTimeTicks, ...n })));
  return part;
}
```

**MVP 先只做 Piano（PolySynth）音色**，其他乐器类型暂时也用 Piano 代替，Phase 4/5 时换对应 synth 或采样。

### Decision: 撤销/重做用 zustand + immer 的 patch history
```ts
const useTrackEditorStore = create<TrackEditorState>()(
  immer((set, get) => ({
    tracks: [],
    notes: {}, // trackId → Note[]
    past: [],
    future: [],

    addNote: (trackId, note) => {
      const prev = getState();
      set(state => { state.notes[trackId].push(note); });
      pushHistory(prev);
    },
    // ... 其他操作
  }))
);
```

**或者**更简单的：不自己实现 patch history，用 `use-immer` + 一个显式的 snapshot 栈。MVP 手动维护 past/future 栈，每次 mutation 前 push snapshot 到 past，clear future。

### Decision: 后端 Track/Note REST API 完整清单
```
POST   /api/v1/rooms/:roomId/tracks              # 创建轨道
GET    /api/v1/rooms/:roomId/tracks              # 获取该房间所有轨道（含 notes）
GET    /api/v1/tracks/:trackId                    # 获取单轨道（含 notes）
PUT    /api/v1/tracks/:trackId                    # 更新轨道（name/solo/mute/color/position）
DELETE /api/v1/tracks/:trackId                    # 删除轨道（级联删 notes）

POST   /api/v1/tracks/:trackId/notes              # 创建单个音符
POST   /api/v1/tracks/:trackId/notes/bulk        # 批量创建
PUT    /api/v1/tracks/:trackId/notes/:noteId     # 更新单个音符
PUT    /api/v1/tracks/:trackId/notes/bulk         # 批量更新
DELETE /api/v1/tracks/:trackId/notes/:noteId     # 删除单个音符
DELETE /api/v1/tracks/:trackId/notes/bulk         # 批量删除
GET    /api/v1/tracks/:trackId/notes              # 获取该轨道所有 notes

# 扩展：GET /api/v1/rooms/:id 返回 tracks 及其 notes
```

**所有轨道/音符 API 都先过 authenticateAccessToken + 房间成员校验 middleware**。

### Decision: MIDI pitch ↔ 钢琴卷帘网格位置
```ts
// MIDI 数字 → 钢琴卷帘 Y 轴（从上到下 127 → 0）
function pitchToY(midi: number, cellHeight: number): number {
  return (127 - midi) * cellHeight;
}

// 钢琴卷帘 Y 轴 → MIDI（吸附到整数）
function yToPitch(y: number, cellHeight: number): number {
  return Math.round(127 - y / cellHeight);
}

// 中央 C (C4) = MIDI 60，居中显示
// 网格 cellHeight = 8px（可调），显示范围：A0 (21) ~ C8 (108) 共 88 键
```

## Risks / Trade-offs

**[风险] PianoRoll 拖拽实现复杂度高** → 建议用一个成熟的音乐 UI 库辅助？比如 `vexflow`（乐谱渲染）或 `midi-recorder`。但 MVP 阶段直接用原生 HTML + Canvas/SVG 自己画网格和音符矩形，拖拽用 pointer 事件。够用但工作量大。

**[风险] 批量操作的事务一致性** → 后端 bulk 创建/更新/删除必须用 Prisma transaction 包裹，否则部分成功部分失败会导致前端和后端数据不一致。这是必须做的，不是可选项。

**[风险] 撤销/重做的栈管理** → 如果每次用户编辑一个音符就存一份全量 snapshot，内存会爆炸。改进：存 patch diff 而不是 snapshot。MVP 先存 snapshot（一次全量 JSON 序列化），限制 history 栈深度 ≤ 50，够用。

**[风险] Tone.js 版本兼容性** → Tone.js v14 和 v15 API 差异较大。design 建议指定 Tone.js v14（稳定版本），Phase 3 实现时锁定版本号。

## Open Questions

- **前端 PianoRoll 用 Canvas 还是 DOM？** Canvas 性能好但交互复杂；DOM + div 简单但大量音符时性能差。MVP 用 DOM + div 开始（音符数量通常几十个到几百个），性能有问题时再换 Canvas。先在 tasks 里写"PianoRoll 用 DOM div 实现，每个音符一个绝对定位 div"。
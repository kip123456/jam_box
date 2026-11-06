## Why

Phase 2 提供了房间容器，但进了房间还没东西可玩。现在需要实现多轨编曲核心——在房间里创建钢琴/吉他/贝斯/鼓轨道、在时间轴钢琴卷帘上编辑音符、solo/mute 轨道、播放合成合奏效果。这是整个合奏盒子的核心交互，也是后续 AI 编曲（Phase 4）和实时协同（Phase 5）的数据基础。

## What Changes

- **Prisma Track + Note 模型**：Track（id、room_id、name、instrument_type、color、solo、mute、position 排序、created_by）；Note（id、track_id、pitch、start_time_ticks、duration_ticks、velocity）
- **轨道管理 API**：CRUD 轨道（POST / GET / PUT / DELETE），仅限房间成员操作
- **音符 API**：单条 CRUD + 批量操作（BulkCreate/BulkUpdate/BulkDelete）
- **房间详情扩展**：GET `/api/v1/rooms/:id` 响应包含所有轨道及其音符数据，供前端一次加载
- **前端房间详情页** `/rooms/:id`：替换占位页为完整多轨编辑界面
  - 左侧：轨道列表（轨道名、乐器图标、solo/mute 开关、音量、删除）
  - 中间：钢琴卷帘（时间轴 × MIDI 音高网格、拖拽添加/移动/删除音符）
  - 顶部：播放控制（播放/暂停/停止、BPM、循环区域）
  - 撤销/重做（Ctrl+Z / Ctrl+Y）
- **Tone.js 集成**：前端本地合成播放，不依赖后端音频渲染
- **时间粒度**：tick 为单位（480 ticks = 1/4 拍），BPM 可配置（默认 120）

## Capabilities

### New Capabilities
- `multi-track-editor`: 轨道管理、音符编辑、钢琴卷帘 UI、播放控制、Tone.js 本地合成、撤销/重做

### Modified Capabilities
（无）

## Impact

- **新增目录**：`backend/src/routes/tracks.ts`、`backend/src/routes/notes.ts`、`frontend/src/pages/RoomDetail.tsx`、`frontend/src/components/PianoRoll.tsx`、`frontend/src/components/TrackList.tsx`
- **新增依赖**：前端新增 `tone`（Tone.js 合成库）、`zustand/immer`（撤销/重做）；后端无新增依赖
- **Prisma 变更**：Track 和 Note model → 新迁移
- **已有 API 扩展**：GET `/api/v1/rooms/:id` 响应中追加 `tracks: Track[]`，每个 Track 追加 `notes: Note[]`
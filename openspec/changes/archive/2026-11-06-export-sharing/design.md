## Context

Phase 0 提供了 job queue 基础设施。Phase 3 有 Track/Note 数据。Phase 5 有 Yjs 文档持久化。现在需要：① 后端用 Node.js Tone.js OfflineContext 渲染 + ffmpeg 编码导出音频；② 历史房间列表展示；③ 分享链接。ffmpeg 是系统级依赖（见 deploy.md），Tone.js Node.js 模式需要确认 v14+ 支持 OfflineContext 无浏览器依赖。

## Goals / Non-Goals

**Goals:**
- 异步音频导出（job queue）
- Node.js Tone.js OfflineContext 渲染所有轨道乐器
- ffmpeg WAV → MP3 编码（无 ffmpeg 时降级 WAV）
- Express 静态目录安全暴露导出文件
- 分享链接生成 + 简化房间展示页
- 历史房间列表（已结束）+ 只读回放

**Non-Goals:**
- 不做波形预览/频谱图
- 不支持自定义音色/导入 midi/导入音频采样
- 不做多轨独立导出（一次导出混合后 MP3）
- 不做分享链接的密码保护/多次访问计数
- 不做历史房间列表的分页/搜索/筛选（先全量返回，数据量大时再加）
- 不做导出文件的 CDN 分发

## Decisions

### Decision: Tone.js Node.js 渲染方案
Tone.js v14+ 的 OfflineContext 在 Node.js 环境不需要浏览器——它自己合成 PCM 数据。npm 包名 `tone`，`import * as Tone from 'tone'` 后用 `Tone.OfflineContext`。

```ts
// 伪代码
const offline = new Tone.OfflineContext({ sampleRate: 44100, numberOfChannels: 2 });

Tone.setContext(offline);

// 为每条轨道创建乐器
for (const track of tracks) {
  const synth = new Tone.PolySynth(...).connect(offline.destination);
  for (const note of track.notes) {
    synth.triggerAttackRelease(
      midiToFreq(note.pitch),
      ticksToSec(note.durationTicks),
      ticksToSec(note.startTimeTicks)
    );
  }
}

await offline.render();
// offline.raw === Float32Array(左声道) + Float32Array(右声道)
// 转 WAV → ffmpeg → MP3
```

**注意**：Tone.js Node.js 模式下有些 API 签名略有不同（比如 `Tone.start()` 不需要）。需要实际测试。

### Decision: 乐器类型简化映射
| instrumentType | Tone.js 乐器 | 说明 |
|---|---|---|
| piano | Tone.PolySynth + Tone.Synth | 简单钢琴音色 |
| guitar | Tone.PolySynth + Tone.FMSynth | FM 合成近似吉他 |
| bass | Tone.MonoSynth | 低音域（pitch - 12） |
| drums | Tone.MembraneSynth（kick/snare）+ Tone.MetalSynth（hihat） | 简化鼓组 |

MVP 音色近似即可，后续如需更真实的音色用 Tone.Sampler 加载采样文件。

### Decision: 导出 Job 数据来源优先级
1. **优先从 Yjs 文档取**（最权威——多人协同最终状态）
2. 若 Yjs 文档已清理（room idle 太久被回收）→ 从 SQLite Track/Note 表取（初始状态）

### Decision: WAV → MP3 转换
```ts
// Tone.js 渲染后得到 PCM Float32Array
// 手写 WAV header 包裹 → Buffer
// 用 child_process.spawn('ffmpeg', ['-i', 'pipe:0', '-ar', '44100', '-b:a', '128k', '-f', 'mp3', 'pipe:1'], { input: wavBuffer })
// 或者用 fluent-ffmpeg 库
```

**fluent-ffmpeg 不需要 ffmpeg-static**（后者打包二进制会让部署更重），直接依赖系统 `ffmpeg`。如果 ffmpeg 不存在，降级返回 WAV（Tone.js 直接能输出 WAV 格式——用 Tone.WavEncoder 或手写 WAV header）。

### Decision: 分享链接简化页面
MVP 分享页面是一个极简 HTML（后端渲染 EJS 或纯 HTML），显示：房间名、创建者用户名、时长、一个"查看乐谱"按钮。点击后跳转到 `/rooms/:id`（但房间状态 ended，所以是只读模式）。

**为什么不只给 token 然后直接跳 `/rooms/:id`？** 因为 `/rooms/:id` 需要登录才能访问（受保护路由）。分享链接是公开免登录的，所以需要 `/shared/:token` 路由绕过 JWT 鉴权。

### Decision: 历史房间查询 SQL
```sql
SELECT r.id, r.code, r.name, r.bpm, r.status, r.endedAt,
       rm.role, rm.userId
FROM rooms r
JOIN room_members rm ON rm.roomId = r.id
WHERE rm.userId = ? AND r.status = 'ended'
ORDER BY r.endedAt DESC
```

Prisma：
```ts
prisma.room.findMany({
  where: { members: { some: { userId } }, status: 'ended' },
  orderBy: { endedAt: 'desc' },
  include: { _count: { select: { tracks: true } } },
});
```

### Decision: 导出文件命名与存储
```
backend/storage/exports/<yyyy-mm-dd_HH-mm>-<roomId>.<format>
```

Git 忽略 `backend/storage/exports/`。

## Risks / Trade-offs

**[风险] ffmpeg 系统依赖** → 部署时必须安装 ffmpeg（见 deploy.md）。MVP 做降级方案：无 ffmpeg 时返回 WAV。

**[风险] Tone.js Node.js OfflineContext 渲染大房间耗时长** → 单次导出限制 16 小节（≈ 60 秒音频），控制渲染时间在几秒内。如果渲染超时（30 秒）→ job 标记 failed。

**[风险] 分享链接 token 碰撞** → 32 字符 hex（crypto.randomBytes(16).toString('hex')），碰撞概率可忽略。

**[风险] 导出文件存储膨胀** → MVP 不做自动清理（用户量小）。后续加 cron job 清理 30 天前的导出文件。

**[风险] 只读回放时 Yjs 文档已被清理** → 必须从 SQLite Track/Note 表取数据。Phase 3 的 Track/Note 表始终保留（即使协同编辑后可能和 Yjs 不一致），但 MVP 接受——回放的是初始状态不是协同最终状态。理想情况是协同结束（room status changed to ended）时做一次 Yjs → SQLite 全量覆盖。design 里建议在 Phase 5 或 Phase 7 补这个逻辑：`prisma.room.update({ where: { id: roomId }, data: { status: 'ended', endedAt: now } })` 同时触发 `syncYjsToSqlite(roomId)`。

## Open Questions

- **只读回放的数据一致性问题**：如果协同编辑后 Yjs 文档有最新数据但 SQLite Track/Note 还是初始状态，回放的乐谱和用户协同看到的不一致。解决方案：在 Room.end API 里触发一次 Yjs → SQLite 全量回写。但这个改动属于哪个 Phase？建议在 Phase 5 或 Phase 7 里顺便补。先在 tasks 里标记一个"Yjs → SQLite 同步回写"任务。
# export-sharing Specification

## Purpose

让用户能把完成的合奏导出成可分享的音频文件（MP3），以及查看历史合奏记录并回放乐谱。导出是耗时操作（Tone.js OfflineContext 渲染 + ffmpeg MP3 编码），走 Phase 0 的异步 job queue。

## Requirements

### Requirement: 音频导出（异步 Job）
后端 MUST 提供音频导出 API，提交任务后异步渲染并编码。

#### Scenario: 提交导出任务
- **WHEN** 用户 POST `/api/v1/rooms/:id/export`（body 可选 `{ format: 'mp3' | 'wav', bpm: number?, durationTicks: number? }`）
- **AND** 用户是该房间成员
- **THEN** 后端提交 `export-audio` job 到队列
- **AND** 返回 `{ code: 0, data: { jobId } }`

#### Scenario: 导出成功
- **WHEN** job handler 完成渲染 + 编码
- **THEN** 导出文件存到 `backend/storage/exports/<timestamp>-<roomId>.mp3`
- **AND** Job.result 存 `{ fileName, format, duration, url: `/exports/<fileName>` }`
- **AND** 前端轮询 GET `/api/v1/rooms/:id/export/:jobId` 时能拿到 result.url

#### Scenario: 导出失败（ffmpeg 不可用）
- **WHEN** 系统 ffmpeg 未安装或渲染异常
- **THEN** job 标记 failed，Job.result 存错误信息
- **AND** 前端收到友好提示"导出失败，请联系管理员或稍后再试"

#### Scenario: 导出权限
- **WHEN** 非房间成员请求导出
- **THEN** 返回 403 Forbidden

### Requirement: 后端 Tone.js OfflineContext 渲染
后端 MUST 使用 Node.js 环境的 Tone.js OfflineContext 渲染房间的所有轨道和音符。

#### Scenario: Tone.js Node.js 渲染
- **WHEN** job handler 执行 export-audio
- **THEN** 用 `Tone.OfflineContext`（Node.js 兼容模式）
- **AND** 遍历房间所有 Track → 为每条 Track 创建对应乐器（PianoSynth / MembraneSynth 等）
- **AND** 遍历每条 Track 的 Note → 在 startTimeTicks 触发，durationTicks 时长播放
- **AND** 渲染完成后 OfflineContext 的 destination → AudioBuffer

#### Scenario: 乐器映射
- **WHEN** Track.instrumentType 是 piano → Tone.Piano（或简单的 PolySynth）
- **AND** guitar → Tone.FMSynth
- **AND** bass → Tone.MonoSynth（低音域）
- **AND** drums → Tone.MembraneSynth（鼓点简化：kick=C1, snare=C#1, hihat=metronome）
- **AND** MVP 简化映射足够，不追求音色还原度

#### Scenario: BPM 和时间分辨率
- **WHEN** 渲染时
- **THEN** 从 Room.bpm（或请求的 bpm 参数）设置 Tone.Transport.bpm
- **AND** 480 ticks = 1/4 拍 的换算逻辑前端一致：`seconds = ticks / (480 * bpm / 60)`

#### Scenario: 渲染时间限制
- **WHEN** 导出请求的 durationTicks 超过 16 小节（16 × 4 × 480 = 30720 ticks，约 60s）
- **THEN** 截断到 16 小节
- **AND** 返回的音频时长约 ≤ 60 秒
- **AND** 导出时用 durationTicks 参数覆盖默认值（如果请求里有传）

### Requirement: ffmpeg MP3 编码
后端 MUST 用 ffmpeg 将 Tone.js 渲染的原始 PCM/WAV 编码成 MP3。

#### Scenario: ffmpeg 编码
- **WHEN** Tone.js OfflineContext 渲染完成得到 WAV
- **THEN** 用 fluent-ffmpeg 将 WAV → MP3（码率 128kbps）
- **AND** 输出文件存到 `backend/storage/exports/<timestamp>-<roomId>.mp3`

#### Scenario: ffmpeg 不可用时的降级
- **WHEN** 系统没有 ffmpeg 可执行文件
- **THEN** job handler 捕获 spawn 错误
- **AND** 只保存 WAV 文件（Tone.js 直接能输出 WAV）
- **AND** Job.result.format = 'wav'
- **AND** 告知前端用原始 WAV 下载

### Requirement: 导出文件静态服务
后端 MUST 通过 Express 静态目录暴露导出文件供下载。

#### Scenario: 下载导出文件
- **WHEN** 前端 GET `/exports/<fileName>`（直接浏览器访问）
- **THEN** Express 静态中间件从 `backend/storage/exports/` 返回文件
- **AND** 设置正确的 Content-Type（audio/mpeg 或 audio/wav）和 Content-Disposition

#### Scenario: 文件不存在
- **WHEN** 请求不存在的 fileName
- **THEN** Express 静态中间件返回 404

### Requirement: 分享链接（可选 MVP 先做）
后端 MUST 能为已结束房间生成分享链接。

#### Scenario: 生成分享链接
- **WHEN** 用户 POST `/api/v1/rooms/:id/share`（房间状态必须是 ended）
- **THEN** 后端生成 32 字符随机 token（crypto.randomBytes）
- **AND** 存入 ShareLink 表（token, roomId, expiresAt=30天后）
- **AND** 返回 `{ code: 0, data: { shareUrl: `/shared/${token}`, expiresAt } }`

#### Scenario: 访问分享链接（MVP 简化）
- **WHEN** 任何人（无需登录）GET `/shared/:token`
- **THEN** 校验 token 存在且未过期
- **AND** 返回一个简化房间详情页面（只读，显示乐谱历史）
- **AND** 不显示成员列表、不允许任何编辑/协同

### Requirement: 历史房间列表
前端 MUST 提供"我的合奏"页面，展示当前用户已结束的房间列表。

#### Scenario: 查询历史房间
- **WHEN** 用户 GET `/api/v1/rooms?status=ended`（鉴权）
- **THEN** 返回 `{ code: 0, data: { rooms: [{ id, code, name, bpm, status, endedAt, isHost }] } }`
- **AND** 只返回当前用户作为 RoomMember 的房间（用 JOIN RoomMember 过滤）

#### Scenario: 历史房间详情（只读）
- **WHEN** 用户导航到 `/rooms/:id` 且房间状态为 ended
- **THEN** PianoRoll 和 TrackList 以只读模式渲染
- **AND** 不显示编辑控件（拖音符、添加、删除按钮）
- **AND** 底部有"回放"按钮 → 用 Tone.js 以只读模式播放
- **AND** 底部有"导出"按钮 → 调导出 API

#### Scenario: 回放乐谱
- **WHEN** 已结束房间的用户点击"回放"
- **THEN** 前端从 REST API 加载 Track + Note 数据（已结束房间 Yjs 文档可能被清理）
- **AND** 用 Tone.js Transport.schedule 按原始时间粒度播放
- **AND** PianoRoll 上播放头实时移动（和活跃房间的播放逻辑一致，但只读）

### Requirement: 导出 Job Queue Handler
后端 worker MUST 注册 `export-audio` handler。

#### Scenario: export-audio handler 执行
- **WHEN** worker 取出 type: "export-audio" 的任务
- **THEN** handler payload = { roomId, format?, bpm?, durationTicks? }
- **AND** 查 Room 表 + Track 表 + Note 表（或者 Yjs 文档——优先从 Yjs 取最新最终状态，如果 Yjs 文档已被清理则从 Track/Note 表）
- **AND** 用 Node.js Tone.js OfflineContext 渲染
- **AND** ffmpeg 编码 MP3（不可用时降级 WAV）
- **AND** 写入文件系统
- **AND** Job.result = { fileName, format, duration, url, size }
- **AND** 状态标记 success 或 failed

### Requirement: Express 静态目录与安全性
Express MUST 正确配置静态目录，禁止路径穿越攻击。

#### Scenario: 路径穿越防护
- **WHEN** 恶意用户请求 `/exports/../../../etc/passwd`
- **THEN** Express 静态中间件自动阻止（基于 path.resolve 对比 root）
- **AND** 返回 404

#### Scenario: 导出目录不存在
- **WHEN** backend/storage/exports/ 目录不存在
- **THEN** 后端启动时自动创建（fs.mkdirSync recursive: true）
- **AND** 同时在 .gitignore 中排除该目录

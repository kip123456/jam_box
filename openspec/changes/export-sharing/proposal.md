## Why

用户完成合奏后需要两个功能：① 把乐谱导出成音频文件（WAV/MP3）分享给朋友；② 结束后能看到历史合奏记录（"我的房间"列表），点进去能回放当时的乐谱。导出音频是耗时操作（渲染 + 编码），走 Phase 0 的 job queue 异步处理。

## What Changes

- **导出 API**：
  - POST `/api/v1/rooms/:id/export`（异步，提交 job 渲染 + 编码）
  - GET `/api/v1/rooms/:id/export/:jobId`（轮询状态，成功返回下载 URL）
  - GET `/api/v1/exports/:fileName`（静态文件下载）
- **导出 Job Queue Handler**：
  - `export-audio` handler：查房间 Track/Note 数据 → Node.js Tone.js OfflineContext 渲染 → 生成 WAV → 用 fluent-ffmpeg 转 MP3 → 存 `backend/storage/exports/`
  - 注册到 Phase 0 的 worker
- **导出文件静态服务**：Express 挂载 `/exports` 静态目录
- **分享房间 API**（可选增强，MVP 先不做公开分享页面）：
  - POST `/api/v1/rooms/:id/share`（生成分享 token + 可选过期时间）
  - 前端"分享"按钮 → 复制分享链接
- **历史房间 API**：
  - GET `/api/v1/rooms?status=ended`（当前用户作为成员/房主的已结束房间列表）
  - GET `/api/v1/rooms/:id`（房间详情 + 最终 Track/Note 数据——用于回放）
- **前端历史房间列表页**：`/rooms` 路由 → 已结束房间列表 → 点进去只读模式查看/回放
- **Prisma 扩展**：ShareLink 表（token, roomId, expiresAt）、ExportJob 表（可选——也可以复用 Phase 0 的 Job 表）

## Capabilities

### New Capabilities
- `export-sharing`: 音频导出（Tone.js 后端渲染 + ffmpeg 编码）、分享链接生成、历史房间列表与回放

### Modified Capabilities
（无，Phase 0 的 job queue 注册新 handler）

## Impact

- **新增依赖**：后端 `tone`（Node.js 兼容 OfflineContext）、`fluent-ffmpeg`（MP3 编码，需要系统安装 ffmpeg）、前端新增 `ffmpeg` 也可以但后端统一处理更好
- **部署依赖**：需安装系统 ffmpeg（见 `.trae/rules/deploy.md`）
- **新增目录**：`backend/storage/exports/`（导出文件存储）、`backend/src/routes/export.ts`、`backend/src/routes/share.ts`
- **Prisma 变更**：ShareLink 表（token String @unique, roomId String, createdAt, expiresAt DateTime?）
- **Job Queue**：注册 `export-audio` handler
- **Express 入口扩展**：挂载 `/exports` 静态目录
- **前端路由**：新增 `/rooms`（历史列表）、`/rooms/:id` 增加只读模式（房间状态为 ended 时）
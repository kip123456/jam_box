## 1. LLM Provider 与依赖

- [x] 1.1 后端安装 zod-to-json-schema（用于给 LLM 提供结构化输出 schema）：`npm install zod-to-json-schema`；验证：node_modules 存在
- [x] 1.2 创建 `backend/src/lib/llm.ts`：导出 LLMProvider interface + OpenAICompatibleProvider 实现（fetch 调用 BASE_URL + /chat/completions、30s 超时、response_format=json_object、zod schema 二次校验、返回 JSON 解析后的 typed 对象）；getProvider() 函数惰性初始化，LLM_BASE_URL 缺失时返回 null；验证：编写一个测试脚本 `npx ts-node -e "import { getProvider } from './src/lib/llm'; const p = getProvider(); if(p) p.generateJSON([...], someSchema).then(console.log)"` 手动测试（需要 .env 配置）
- [x] 1.3 更新 `backend/src/utils/env.ts`：追加 LLM_BASE_URL / LLM_MODEL / LLM_API_KEY 三个字段的 zod optional 校验；验证：TypeScript 编译通过

## 2. Prompt 模板与乐理知识库

- [x] 2.1 创建 `backend/prompts/ai-compose.md`：智能编曲 prompt（instruction + existingTracksContext + bpm 占位符，要求返回 JSON 格式的轨道数组，每条轨道含 name/instrumentType/color/notes）；验证：文件存在且占位符 {instruction} {existingTracksContext} {bpm} 存在
- [x] 2.2 创建 `backend/prompts/ai-fix.md`：自动修复 prompt（tracks + issues 占位符，要求返回修复后的完整 tracks JSON）；验证：同上
- [x] 2.3 创建 `backend/prompts/ai-ask.md`：乐理问答系统 prompt（定义角色为专业乐理老师，简洁准确回答，回答完追问相关知识点引导深入）；验证：同上
- [x] 2.4 创建 `backend/data/music-theory.json`：手写约 100-200 条乐理条目（categories: 和弦、音阶、节奏、音程、术语、调式）；每条 `{ id, keywords: string[], question, answer, category }`；验证：文件存在且 JSON 格式正确，至少有 Dmaj7、C 大调、4/4 拍 等常见知识点
- [x] 2.5 创建 `backend/src/lib/prompts.ts`：加载 prompts/*.md → 内存 Map（key = 文件名不含扩展名）；提供 render(templateName, vars) 函数用 String.replace 填充占位符；验证：手动调用 render('ai-compose', { instruction: 'test', existingTracksContext: '', bpm: 120 }) 输出正确
- [x] 2.6 创建 `backend/src/lib/knowledge-base.ts`：加载 music-theory.json → search(question) 函数分词匹配 keywords → 返回 top 3 条目合并 answer；验证：search('Dmaj7 组成音') 能返回 Dmaj7 条目

## 3. Job Queue Handler 注册

- [x] 3.1 创建 `backend/src/queues/handlers/aiHandlers.ts`：
  - composeHandler(payload)：加载 ai-compose prompt → render({ instruction, existingTracksContext, bpm }) → LLM generateJSON（schema = tracks array）→ 业务校验（instrumentType ∈ enum, pitch 0-127, durationTicks ≥ 480, velocity 0-127）→ 校验通过返回 tracks 数组，校验失败 throw Error 让 job queue 标记 failed
  - fixHandler(payload)：类似流程
  - 在 worker 启动时（handlers.ts 的 registerAll 函数里）调用 `registerHandler('ai-compose', composeHandler)` 和 `registerHandler('ai-fix', fixHandler)`；验证：worker 启动日志输出两个 handler 注册成功；手动提交一个 ai-compose job → 等待处理 → 检查 Job 表 status

## 4. AI Routes 实现

- [x] 4.1 创建 `backend/src/zod/ai.ts`：`composeSchema`（instruction string 1-500, roomId string, existingTracks optional）、`askSchema`（question string 1-500）、`checkSchema`（tracks array）、`fixSchema`（tracks + issues + roomId）；验证：safeParse 测试
- [x] 4.2 创建 `backend/src/routes/ai.ts`，挂在 `/api/v1/ai`，所有路由过 authenticateAccessToken：
  - `POST /compose`：zod composeSchema → 构造 existingTracksContext（查 roomId 的 tracks 汇总 instrumentType + name → 不查全量 notes 节省 token）→ queueClient.submitJob('ai-compose', { instruction, existingTracksContext, bpm, roomId }) → 返回 { jobId }
  - `GET /compose/:jobId`：queueClient.getJob(jobId) → 前端轮询用
  - `POST /ask`：zod askSchema → 先调 knowledgeBase.search → score ≥ 0.3 返回知识库结果；否则 getProvider()?.generate([system prompt, user question]) 或返回 503；验证：同步快速返回
  - `POST /check`：zod checkSchema → 纯规则遍历（pitch 范围、duration ≥ 480、velocity 范围、音域 36-84、同一轨道音符重叠）→ 返回 issues 数组；验证：10ms 内返回
  - `POST /fix`：zod fixSchema → queueClient.submitJob('ai-fix', { tracks, issues }) → 返回 jobId
  - `GET /fix/:jobId`：同上轮询
- [x] 4.3 在 `backend/src/index.ts` 挂载 ai 路由：`app.use('/api/v1/ai', aiRouter)`；验证：`npx tsc --noEmit` 无错误

## 5. 前端 AI 侧边栏

- [x] 5.1 创建 `frontend/src/store/ai.ts` Zustand store：状态含 composeResult / askHistory / checkResult / fixResult 四个独立字段，及 isLoading flags；导出 acceptPreview / discardPreview actions；验证：TypeScript 编译通过
- [x] 5.2 创建 `frontend/src/components/ai/AISidebar.tsx`：shadcn/ui ResizablePanel + Tabs（三个 tab: 编曲/问答/修错），可折叠；集成下面三个子组件；验证：UI 渲染正确，三个 tab 可切换
- [x] 5.3 创建智能编曲子组件：输入框 + 生成按钮 → POST `/ai/compose`（body 含 instruction, roomId, existingTracks 从当前 roomEditorStore 取）→ 显示 spinner → setInterval 每 2 秒 GET `/ai/compose/:jobId` → success 时渲染预览（在 PianoRoll 上生成半透明轨道/音符或在 TrackList 底部追加预览轨道）→ 提供"接受"（调用 Track/Note API 写后端 + 清除预览）和"丢弃"按钮；验证：Network 面板看到 compose → 多次查询 → 接受后后端 Track 表有新记录
- [x] 5.4 创建乐理问答子组件：shadcn/ui ChatBubble 或自定义气泡（用户在右、AI 在左）→ 输入框回车发送 → POST `/ai/ask` → AI 回答显示在气泡中；前端 store 保留最近 5 轮上下文（如果后续后端要，就传给后端）；验证：连续提问"什么是和弦？"→ "大三和弦呢？" 能正常对话
- [x] 5.5 创建自动修错子组件："检查乐谱"按钮 → POST `/ai/check` → 返回 issues 列表（每条显示 "轨道: xxx / 音符位置: xxx / 问题: xxx / 建议: xxx"）→ "一键修复"按钮（有 issues 时才显示）→ POST `/ai/fix` → 轮询 → 预览修复结果 → 接受/丢弃；验证：构造一个 pitch=150 的非法音符 → check 返回 issue

## 6. AI 结果预览在 PianoRoll 中渲染

- [x] 6.1 修改 roomEditorStore：新增 `previewTracks` 字段（独立于正式 tracks），PianoRoll 和 TrackList 渲染时合并显示但 preview 的音符用 opacity 0.5 + 不同 border 样式区分；验证：接受后 previewTracks 清空，正式 tracks 增加

## 7. 阶段性验证

- [x] 7.1 后端 API 测试：在已有房间里 → POST compose → GET job → 等 success → 检查 result.tracks 数据结构正确 → POST ask "Cmaj7 是什么" → 检查返回 answer → POST check（故意 pitch=150）→ 返回 issues 列表含 pitch 超限 → POST fix（带 issues）→ GET fix job → 等 success；验证每个 curl 场景正确
- [x] 7.2 LLM 降级测试：把 `.env` LLM_API_KEY 清空 → 重启后端 → POST ai/compose → job handler 捕获错误 → GET job 返回 status: failed 含友好 message；验证：前端 AI 面板显示"AI 服务暂不可用"
- [x] 7.3 业务校验测试：LLM 返回 pitch=150 的音符 → 后端 ai-compose handler 的业务校验拦截 → Job 表 status=failed；验证：原始 LLM 输出不在前端响应里，只在服务端 debug 日志里
- [x] 7.4 前端交互：进入房间详情 → AI 侧边栏 → 输入"加一段鼓点" → 生成 → 看到预览鼓轨道 → 试听（Tone.js 应该能合成）→ 接受 → 正式出现在 TrackList；验证 Network 面板完整流程
- [x] 7.5 TypeScript 编译：前后端都通过
- [x] 7.6 安全检查：AI 路由全部过 authenticateAccessToken；.env.example 无敏感值；后端日志不打印 prompt 或 LLM 原始输出（只打结构化结果摘要）
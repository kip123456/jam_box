## Why

Phase 3 让用户能手动编曲，但 AI 增强体验是合奏盒子的核心差异化。现在需要接入 LLM API 实现三大 AI 能力：智能编曲（自然语言生成轨道/和弦/旋律）、乐理问答（对话式知识库）、自动修错（检测+修复乐谱问题）。LLM 调用耗时较长，必须走 Phase 0 建好的 job queue 异步处理。

## What Changes

- **LLM Provider 抽象层**：`backend/src/lib/llm.ts`，封装 OpenAI 兼容 API 格式调用（endpoint/model/api_key 全部从 `.env` 读取）
- **Prompt 模板集中管理**：`backend/prompts/` 目录，每个 AI 功能一个 prompt 模板文件（智能编曲、乐理问答、自动修错）
- **乐理知识库**：`backend/data/music-theory.json`，手写约 100-200 条核心乐理知识点，关键词匹配检索
- **智能编曲 API**：
  - POST `/api/v1/ai/compose`（提交自然语言指令，返回 job_id）
  - GET `/api/v1/ai/compose/:jobId`（查询生成状态，成功时返回可预览的轨道+音符数据）
- **乐理问答 API**：POST `/api/v1/ai/ask`（同步，简单问答直接返回，不排队）
- **自动修错 API**：
  - POST `/api/v1/ai/check`（提交轨道+音符数据，同步返回问题列表）
  - POST `/api/v1/ai/fix`（提交轨道+问题列表，异步修复，返回 job_id）
- **前端 AI 侧边栏**：房间详情页右侧新增 AI 面板，包含三个功能入口（智能编曲输入框、乐理问答聊天框、自动修错按钮）
- **AI 结果预览**：AI 生成的轨道/音符以预览形式显示（半透明或特殊标记），用户点击"接受"才真正写入后端
- **Job Queue 扩展**：注册 `ai-compose`、`ai-fix` 两种任务处理器

## Capabilities

### New Capabilities
- `ai-enhancements`: LLM Provider 抽象层、智能编曲（异步）、乐理问答（同步）、自动修错（同步检测 + 异步修复）、乐理知识库、前端 AI 侧边栏

### Modified Capabilities
（无，Phase 0 的 job-queue 基础设施已就绪，Phase 4 只是注册新 handler）

## Impact

- **新增目录**：`backend/src/routes/ai.ts`、`backend/src/lib/llm.ts`、`backend/prompts/`（各功能 prompt 模板）、`backend/data/music-theory.json`（乐理知识库）、`frontend/src/components/ai/`（侧边栏组件）
- **新增依赖**：后端新增 `zod-to-json-schema`（给 LLM 提供结构化输出 schema）、可选 `better-sqlite3`（后续嵌入向量搜索用）
- **环境变量**：`.env.example` 已有的 LLM_BASE_URL / LLM_MODEL / LLM_API_KEY 现在实际使用
- **Job Queue**：注册两个新 handler——`ai-compose` 和 `ai-fix`
- **前端 Zustand**：新增 `ai.ts` store 管理 AI 面板状态和生成结果
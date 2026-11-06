# ai-enhancements Specification

## Purpose

为合奏盒子提供 AI 增强能力——智能编曲（自然语言生成轨道/旋律/和弦）、乐理问答（对话式知识库检索）、自动修错（检测并修复乐谱问题）。LLM 调用走 Phase 0 的 job queue 异步处理，Prompt 模板集中管理，LLM 输出的业务数据必须过业务校验才能入库。

## Requirements

### Requirement: LLM Provider 抽象层
后端 MUST 提供统一的 LLM 调用接口，使用 OpenAI 兼容 API 格式，通过环境变量配置 endpoint、model 和 api_key。

#### Scenario: LLM 配置读取
- **WHEN** 后端启动
- **THEN** 从 `.env` 读取 `LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY`
- **AND** 如果三个变量任一缺失，后端启动不失败（打印 warning 日志），但 AI 相关端点返回 503 Service Unavailable

#### Scenario: LLM 调用超时
- **WHEN** 调用 LLM API 超过 30 秒
- **THEN** 调用主动超时中断
- **AND** 返回可重试的 timeout 错误

#### Scenario: LLM 返回结构化输出
- **WHEN** 调用 LLM 时指定 response_format（JSON schema）
- **THEN** LLM 按 schema 返回 JSON 格式结果
- **AND** 后端用 zod 对返回结果二次校验，校验失败时返回可重试错误

### Requirement: Prompt 模板集中管理
所有 AI 功能的 Prompt 模板 MUST 集中放在 `backend/prompts/` 目录下，禁止硬编码在业务代码里。

#### Scenario: Prompt 模板可加载
- **WHEN** 后端启动
- **THEN** 加载所有 `backend/prompts/*.md` 或 `*.txt` 文件到内存或按需加载
- **AND** 每个模板有明确的变量占位符（如 `{roomContext}`、`{instruction}`）

#### Scenario: Prompt 模板变更
- **WHEN** 开发者修改某个 prompt 模板文件
- **THEN** 重启后端后生效，无需改动任何业务代码

### Requirement: 智能编曲（异步）
后端 MUST 提供智能编曲 API，接收自然语言指令和房间上下文，异步生成新轨道/旋律/和弦。

#### Scenario: 提交智能编曲任务
- **WHEN** 前端提交 POST `/api/v1/ai/compose`，body 含 `{ instruction: "加一段欢快的鼓点", roomId: string, existingTracks: Track[]? }`
- **THEN** 后端将任务提交到 job queue（type: "ai-compose"）
- **AND** 返回 `{ code: 0, msg: "ok", data: { jobId } }`（立即返回，不等待 LLM）

#### Scenario: 查询智能编曲结果
- **WHEN** 前端 GET `/api/v1/ai/compose/:jobId`
- **AND** 任务状态为 success
- **THEN** 返回 `{ code: 0, msg: "ok", data: { status: "success", result: { tracks: [...], description: "..." } } }`
- **AND** result.tracks 是完整的 Track 对象数组（含 name、instrumentType、color、notes 数组）

#### Scenario: LLM 生成非法数据
- **WHEN** LLM 返回的轨道/音符数据不符合业务校验（如 pitch 超范围、duration 太短）
- **THEN** 后端拒绝入库，标记任务为 failed，返回可重试错误信息
- **AND** 原始 LLM 输出不返回给前端（防止泄露）

#### Scenario: LLM 降级
- **WHEN** `.env` 中 LLM_API_KEY 未配置或 LLM 调用持续失败
- **THEN** job queue handler 捕获错误，标记任务为 failed
- **AND** GET job status 时前端收到友好的降级提示"AI 服务暂不可用"

### Requirement: 乐理问答（同步）
后端 MUST 提供乐理问答 API，支持对话式多轮问答，优先从乐理知识库检索回答，知识库无匹配时走 LLM。

#### Scenario: 知识库命中
- **WHEN** 用户提问 "Dmaj7 和弦的组成音是什么？"
- **THEN** 后端先在乐理知识库中匹配相关条目（关键词 "Dmaj7"、"和弦"）
- **AND** 返回 `{ code: 0, msg: "ok", data: { answer: "Dmaj7 由 D-F#-A-C# 四个音组成...", source: "knowledge-base" } }`
- **AND** 响应时间 < 500ms

#### Scenario: 知识库未命中，走 LLM
- **WHEN** 用户提问知识库中没有覆盖的问题
- **THEN** 后端调用 LLM 生成回答
- **AND** 返回 `{ code: 0, msg: "ok", data: { answer: "...", source: "llm" } }`
- **AND** 调用带超时保护（15s）

#### Scenario: LLM 降级时的问答
- **WHEN** LLM 不可用，用户的问题知识库中也没有
- **THEN** 返回 `{ code: 503, msg: "AI 服务暂不可用，请稍后再试", data: null }`

### Requirement: 自动修错（同步检测 + 异步修复）
后端 MUST 提供自动检测乐谱问题和自动修复能力。

#### Scenario: 同步检测问题
- **WHEN** 用户提交 POST `/api/v1/ai/check`，body 含 `{ tracks: Track[] }`
- **THEN** 后端同步执行规则检查（音域超限、轨道内音符重叠、duration 太短等）
- **AND** 返回问题列表 `{ code: 0, msg: "ok", data: { issues: [{ trackId, noteId, type, message, suggestion }] } }`
- **AND** 不调用 LLM（规则检查纯同步快速完成）

#### Scenario: 异步自动修复
- **WHEN** 用户提交 POST `/api/v1/ai/fix`，body 含 `{ tracks, issues, roomId }`
- **THEN** 后端将修复任务提交到 job queue（type: "ai-fix"）
- **AND** 返回 jobId

#### Scenario: 自动修复结果
- **WHEN** 前端查询 ai-fix job 状态为 success
- **THEN** 返回修复后的完整 tracks 数据（可预览/对比）

### Requirement: 乐理知识库
后端 MUST 提供乐理知识库，MVP 阶段手写 JSON 文件，关键词匹配检索。

#### Scenario: 知识库文件结构
- **WHEN** 开发者查看 `backend/data/music-theory.json`
- **THEN** 包含约 100-200 条乐理知识条目
- **AND** 每条含 `id`、`keywords`（用于匹配）、`question`（典型提问）、`answer`（详细回答）、`category`（如 "和弦"、"音阶"、"节奏"、"术语"）

#### Scenario: 关键词匹配检索
- **WHEN** 后端收到用户提问
- **THEN** 将提问分词后与所有条目的 keywords 字段做模糊匹配
- **AND** 取匹配度最高的 top 3 条目拼接 answer 返回

### Requirement: Job Queue 新处理器注册
后端 MUST 在 worker 启动时注册 ai-compose 和 ai-fix 两种处理器。

#### Scenario: ai-compose handler 执行
- **WHEN** worker 从队列取出 type: "ai-compose" 的任务
- **THEN** handler 解析 payload（instruction, roomId, existingTracks）
- **AND** 加载智能编曲 prompt 模板，填充变量
- **AND** 调用 LLM（带超时 + zod 校验输出）
- **AND** 业务校验 LLM 返回的轨道/音符数据
- **AND** 校验通过后存入 Job.result 字段，状态标记 success；校验失败标记 failed

#### Scenario: ai-fix handler 执行
- **WHEN** worker 从队列取出 type: "ai-fix" 的任务
- **THEN** 类似流程：加载修复 prompt → 调用 LLM → 业务校验 → 存结果

### Requirement: 前端 AI 侧边栏
前端房间详情页 MUST 提供 AI 面板，包含智能编曲、乐理问答、自动修错三个功能入口。

#### Scenario: AI 面板可见
- **WHEN** 成员在房间详情页
- **THEN** 右侧显示可折叠的 AI 侧边栏

#### Scenario: 智能编曲交互
- **WHEN** 用户在输入框输入"给这个房间加一段鼓点"并回车/点击"生成"
- **THEN** 调用 POST `/api/v1/ai/compose`
- **AND** 显示 loading 状态（spinner）
- **AND** 轮询 GET `/api/v1/ai/compose/:jobId`（每 2 秒一次）
- **AND** 成功后在 PianoRoll 中渲染预览轨道（半透明或特殊颜色标记）
- **AND** 提供"接受"（调用 Phase 3 的 Track/Note API 真正写入）和"丢弃"按钮

#### Scenario: 乐理问答交互
- **WHEN** 用户在聊天框中提问
- **THEN** 显示用户消息气泡
- **AND** 调用 POST `/api/v1/ai/ask`
- **AND** 显示 AI 回答气泡
- **AND** 支持多轮对话（前端保留最近 5 轮上下文，后续一起发给后端）

#### Scenario: 自动修错交互
- **WHEN** 用户点击"检查乐谱"按钮
- **THEN** 调用 POST `/api/v1/ai/check`
- **AND** 如果有问题，显示问题列表（每条问题显示在哪个轨道/哪个音符上、什么问题、建议）
- **AND** 用户点击"一键修复" → 调用 POST `/api/v1/ai/fix` → 显示 loading → 轮询 → 返回修复预览

### Requirement: AI 输出业务校验
后端 MUST 对 LLM 生成的任何业务数据（轨道、音符、和弦）进行业务校验，校验失败则拒绝入库。

#### Scenario: pitch 超范围
- **WHEN** LLM 返回的音符 pitch 不在 0-127 范围
- **THEN** 业务校验拦截，标记任务 failed，错误信息指出具体问题

#### Scenario: duration 太短
- **WHEN** LLM 返回的音符 durationTicks < 480
- **THEN** 业务校验拦截

#### Scenario: 非法乐器类型
- **WHEN** LLM 返回的 instrumentType 不是 piano/guitar/bass/drums 之一
- **THEN** 业务校验拦截

#### Scenario: 原始 LLM 输出不泄露
- **WHEN** 业务校验失败
- **THEN** 返回给前端的是通用错误信息（如"AI 生成数据不符合规范，请重试"）
- **AND** 原始 LLM 输出仅记录到服务端 debug 日志（开发模式），不返回给前端

### Requirement: 安全——MCP 工具白名单
MVP 阶段不启用 MCP 工具调用，但后端架构 MUST 预留白名单机制，仅允许预定义工具集注册。

#### Scenario: MVP 阶段无 MCP 调用
- **WHEN** LLM prompt 中未提及工具使用
- **THEN** LLM 返回普通文本或结构化 JSON，不触发工具调用

#### Scenario: 工具调用拦截
- **WHEN** LLM 返回 function call / tool call 格式
- **THEN** 后端检查工具名是否在白名单中
- **AND** MVP 阶段白名单为空 → 拦截调用，返回"不支持的工具调用"错误
- **AND** 后续新增 MCP 工具时修改白名单配置即可

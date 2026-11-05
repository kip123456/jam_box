## Context

Phase 0 提供了 job queue 基础设施（`backend/src/queues/worker.ts` + `handlers.ts` + `client.ts`），Phase 3 提供了 Track/Note 数据模型和 API。现在需要在 Phase 0 的 queue handler 注册机制上挂接 AI 处理器，实现三大 AI 能力。LLM provider 用 OpenAI 兼容格式，endpoint/model/api_key 从 `.env` 读取。

## Goals / Non-Goals

**Goals:**
- LLM Provider 抽象层 + 超时保护 + zod 输出校验
- 智能编曲（异步 job queue）
- 乐理问答（同步，知识库优先 fallback LLM）
- 自动修错（同步检测规则 + 异步修复）
- Prompt 模板集中在 `backend/prompts/`
- 乐理知识库 JSON 文件 + 关键词匹配
- 前端 AI 侧边栏 + 结果预览 + 接受/丢弃
- Job queue 注册 `ai-compose` + `ai-fix` 处理器

**Non-Goals:**
- 不启用真实 MCP 工具调用（白名单机制预留但 MVP 禁用）
- 不做向量数据库语义检索——MVP 关键词匹配足够，后续 embedding 升级
- 不做风格迁移/变奏/音效处理等高级功能——后续 change
- 不做乐理问答的持久化会话历史——MVP 前端保留 5 轮上下文，后端 stateless
- 不做多模型支持（用户选择 LLM 提供商）——只有 LLM_BASE_URL 一个配置

## Decisions

### Decision: LLM Provider 接口设计
```ts
// backend/src/lib/llm.ts
export interface LLMProvider {
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string>;
  generateJSON<T>(messages: ChatMessage[], schema: ZodSchema<T>): Promise<T>;
}

class OpenAICompatibleProvider implements LLMProvider {
  async generateJSON<T>(messages, schema) {
    // fetch({ url: BASE_URL + '/chat/completions', body: { model, messages, response_format: 'json_object' } })
    // timeout 30s
    // 用 zod schema 解析 response.choices[0].message.content
  }
}

let provider: LLMProvider | null = null;

function getProvider(): LLMProvider | null {
  if (!provider && process.env.LLM_BASE_URL) {
    provider = new OpenAICompatibleProvider();
  }
  return provider;
}
```

**MVP 只有一个 provider 实现**，但接口设计好，后续加多提供商不改调用方。

### Decision: Prompt 模板格式
```
backend/prompts/ai-compose.md:
你是一个专业的音乐编曲助手。用户描述了他们想要的音乐效果："{instruction}"

当前房间已有轨道：
{existingTracksContext}

请生成新的轨道（1-3 条），每条包含：
- name: 轨道名称
- instrumentType: piano | guitar | bass | drums
- color: hex 颜色
- notes: 音符数组 [{ pitch, startTimeTicks, durationTicks, velocity }]

BPM: {bpm}
时间分辨率: 480 ticks = 1/4 拍

只返回 JSON 格式，不要任何解释文字。
```

加载方式：`fs.readFileSync(path, 'utf8')`，占位符用 `.replace()` 填充。

### Decision: 乐理问答的两级检索
```ts
async function askMusicTheory(question: string) {
  // 1. 关键词匹配知识库
  const kbResult = searchKnowledgeBase(question);
  if (kbResult.score > THRESHOLD) {
    return { answer: kbResult.answer, source: 'knowledge-base' };
  }
  // 2. fallback 到 LLM
  const provider = getProvider();
  if (!provider) throw new ServiceUnavailable();
  return { answer: await provider.generate([...]), source: 'llm' };
}
```

**关键词匹配算法**：对用户问题分词（按空格/标点），每个条目 keywords 字段中的词与用户词做 exact match 或包含匹配；匹配数 / 总 keywords 数 = score；THRESHOLD = 0.3。

### Decision: 智能编曲的房间上下文注入
LLM 必须知道当前房间已有的轨道才能生成与之匹配的新轨道。所以 payload 里必须有 `existingTracks`——包含所有 Track 的基本信息（instrumentType、name）但音符数据可以简化（只给 summary 如"钢琴轨 C4 大调，BPM 120"），不直接给全量 Note 数据（节省 token）。

**构造 existingTracksContext 的逻辑**：
```
"房间已有轨道：\n- 钢琴《主旋律》，C4-B4，BPM 120\n- 贝斯《低音》，根音跟和弦\n- 鼓《节奏》，4/4 拍"
```

### Decision: AI 结果不直接入库，前端预览后接受
后端只负责生成并存到 Job.result，不直接写 Track/Note 表。前端拿到 result 后渲染预览，用户点"接受"才调用 Phase 3 的 POST `/api/v1/tracks` + POST `/api/v1/tracks/:trackId/notes/bulk` 真正写入。

**理由**：
- 符合 GOAL.md 里"用户可以选择接受/拒绝/微调 AI 生成的内容"
- 如果 AI 生成的数据有问题，用户可以先手动调整再保存
- 避免后端 Job handler 里混入业务写入逻辑（保持职责分离）

### Decision: 自动修错的问题类型
MVP 同步检测覆盖：
1. pitch 超出 0-127
2. durationTicks < 480
3. velocity 超出 0-127
4. 同一轨道同一时间位置有两个音符重叠（startTimeTicks + durationTicks 相交）
5. 音域超限（pitch 不在 36-84 之间——A2-C6 适合普通乐器，可配置）

这些是纯规则检查，不需要 LLM，直接 Prisma 查数据遍历即可。

## Risks / Trade-offs

**[风险] LLM 返回的 JSON 不稳定** → 3 层防护：response_format=json_object → zod schema 校验 → 业务数据规则校验。任何一层失败都标记任务 failed，前端收到通用错误提示。

**[风险] 乐理知识库关键词匹配太简陋** → MVP 够用（命中率约 60-70%）。后续升级用 embedding（better-sqlite3 + cosine similarity）做向量检索，知识库 JSON 文件结构保持不变，换个检索引擎即可。

**[风险] Job result 里存大量 notes 数据可能超 Job 表 payload 限制** → SQLite TEXT 类型理论上无上限，JSON.stringify 100 个轨道 × 500 音符 ≈ 几 MB，没问题。但建议 AI 每次生成限制 ≤ 3 轨道 × ≤ 100 音符/轨道，控制在合理范围。

**[风险] LLM 生成的和弦/音符可能与现有轨道冲突** → 靠前端预览 + 用户审核解决，后端做基础范围校验但不做"与现有轨道兼容性"检查。用户觉得冲突可以丢弃重新生成。

## Open Questions

（无，所有技术决策已确定。不影响 specs 或 tasks 的可延迟决策在 implementation 时根据实际 LLM 返回情况再调。）
import { z, type ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { config } from "../utils/env";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  /** 覆盖默认超时（毫秒），generate 默认 30s */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** LLM 调用失败（网络/超时/5xx），job queue 可重试 */
export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMError";
  }
}

/** LLM 返回内容无法解析或不满足 schema，job queue 可重试 */
export class LLMOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMOutputError";
  }
}

export interface LLMProvider {
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string>;
  generateJSON<T>(messages: ChatMessage[], schema: ZodType<T>, options?: GenerateOptions): Promise<T>;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

class OpenAICompatibleProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = config.llm.baseUrl.replace(/\/+$/, "");
    this.model = config.llm.model;
    this.apiKey = config.llm.apiKey;
  }

  /** 纯文本生成 */
  async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const content = await this.chat(messages, undefined, options);
    return content;
  }

  /** 结构化生成：response_format=json_object + zod 二次校验 */
  async generateJSON<T>(messages: ChatMessage[], schema: ZodType<T>, options?: GenerateOptions): Promise<T> {
    const jsonSchema = zodToJsonSchema(schema as never, { target: "openApi3" });
    const hint: ChatMessage = {
      role: "system",
      content: `你必须只返回符合以下 JSON Schema 的 JSON 对象，不要输出任何解释文字或 Markdown 代码块：\n${JSON.stringify(jsonSchema)}`,
    };
    const content = await this.chat([hint, ...messages], { type: "json_object" }, options);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(content));
    } catch {
      throw new LLMOutputError("LLM 返回内容不是合法 JSON");
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new LLMOutputError(`LLM 返回数据结构不符合预期: ${result.error.issues[0]?.message ?? "schema 校验失败"}`);
    }
    return result.data;
  }

  private async chat(
    messages: ChatMessage[],
    responseFormat: { type: "json_object" } | undefined,
    options?: GenerateOptions
  ): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new LLMError(`LLM 调用超时（${timeoutMs}ms）`);
      }
      throw new LLMError(`LLM 请求失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // 不打印响应体，避免泄露上游错误中可能携带的敏感信息
      throw new LLMError(`LLM 服务返回 ${response.status}`);
    }

    let body: ChatCompletionResponse;
    try {
      body = (await response.json()) as ChatCompletionResponse;
    } catch {
      throw new LLMError("LLM 响应不是合法 JSON");
    }

    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new LLMOutputError("LLM 响应缺少 message.content");
    }
    return content;
  }
}

/** 去掉 ```json ... ``` 代码围栏，兼容部分模型的输出习惯 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return match ? match[1] : trimmed;
}

let provider: LLMProvider | null = null;
let warnedMissingConfig = false;

/** 惰性初始化 LLM provider；LLM_BASE_URL 缺失时返回 null（AI 端点据此返回 503） */
export function getProvider(): LLMProvider | null {
  if (!provider) {
    if (!config.llm.baseUrl) {
      if (!warnedMissingConfig) {
        warnedMissingConfig = true;
        console.warn("[llm] LLM_BASE_URL 未配置，AI 能力不可用");
      }
      return null;
    }
    provider = new OpenAICompatibleProvider();
  }
  return provider;
}

/** 测试辅助：重置惰性单例 */
export function resetProviderForTest(): void {
  provider = null;
  warnedMissingConfig = false;
}

export const llmMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

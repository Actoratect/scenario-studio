import { LlmProviderError } from '../types.js';
import type { LlmCapabilities, LlmProvider, LlmRequest } from '../types.js';

// OpenAI Chat Completions 互換 Provider。SDK 不使用、fetch 直叩き。
// baseUrl を差し替えれば OpenAI 互換 API (Mistral / DeepInfra / Together / Groq / vLLM など) でも動く。
// 詳細: ../../../../../Documentation/ScenarioEditor/11_ai-workflow.md §1.1

export interface OpenAiProviderConfig {
  apiKey: string;
  baseUrl?: string;
  /** OpenAI 互換 API を区別するための表示名 (例: "Groq Llama 3")。 */
  displayName?: string;
  /** OpenAI 互換 API の場合、id を変えて registry で他と区別できるようにする。 */
  id?: string;
  fetchImpl?: typeof fetch;
}

export class OpenAiProvider implements LlmProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: LlmCapabilities = {
    streaming: true, // 実装は Phase 1 で追加
    tools: true,
    structuredOutput: true,
    visionInput: true,
  };

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAiProviderConfig) {
    this.id = config.id ?? 'openai';
    this.displayName = config.displayName ?? 'OpenAI';
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async complete(req: LlmRequest, signal?: AbortSignal): Promise<string> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };
    if (req.maxTokens !== undefined) body['max_tokens'] = req.maxTokens;
    if (req.temperature !== undefined) body['temperature'] = req.temperature;

    const res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: signal ?? null,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new LlmProviderError(this.id, `HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as ChatCompletionsResponse;
    return json.choices[0]?.message.content ?? '';
  }

  // Phase 1 で SSE 解析を実装 (`data: {...}` 形式、`delta.content` を yield)。
  stream(_req: LlmRequest, _signal?: AbortSignal): AsyncIterable<string> {
    throw new LlmProviderError(this.id, 'stream: PoC-F の範囲外 — Phase 1 で実装予定');
  }

  // Phase 1 で response_format: json_schema もしくは tools (function calling) で実装。
  structured<T>(_req: LlmRequest, _schema: unknown, _signal?: AbortSignal): Promise<T> {
    return Promise.reject(
      new LlmProviderError(this.id, 'structured: PoC-F の範囲外 — Phase 1 で json_schema 実装予定'),
    );
  }
}

interface ChatCompletionsResponse {
  choices: ReadonlyArray<{ message: { content: string | null } }>;
}

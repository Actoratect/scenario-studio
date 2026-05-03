import { LlmProviderError } from '../types.js';
import type { LlmCapabilities, LlmProvider, LlmRequest } from '../types.js';

// Ollama (ローカル LLM サーバ) Provider。fetch 直叩き。
// 機密プロジェクト向けにオフライン LLM 完結を可能にする位置付け
// (11_ai-workflow.md §6, §8)。
// 詳細: ../../../../../Documentation/ScenarioEditor/11_ai-workflow.md §1.1

export interface OllamaProviderConfig {
  /** デフォルト http://localhost:11434。 */
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama';
  readonly displayName = 'Ollama (local)';
  readonly capabilities: LlmCapabilities = {
    streaming: true, // 実装は Phase 1 で追加 (NDJSON 解析)
    tools: false, // モデル依存だが PoC ではフラットに false
    structuredOutput: true, // /api/chat の format=json で簡易対応可能だが Phase 1 で実装
    visionInput: false,
  };

  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OllamaProviderConfig = {}) {
    this.endpoint = (config.endpoint ?? 'http://localhost:11434').replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async complete(req: LlmRequest, signal?: AbortSignal): Promise<string> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: false,
    };
    if (req.temperature !== undefined) {
      body['options'] = { temperature: req.temperature };
    }

    const res = await this.fetchImpl(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? null,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new LlmProviderError(this.id, `HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as OllamaChatResponse;
    return json.message?.content ?? '';
  }

  // Phase 1 で NDJSON (1 行 1 JSON) を line ごとに parse して yield。
  stream(_req: LlmRequest, _signal?: AbortSignal): AsyncIterable<string> {
    throw new LlmProviderError(this.id, 'stream: PoC-F の範囲外 — Phase 1 で NDJSON 実装予定');
  }

  structured<T>(_req: LlmRequest, _schema: unknown, _signal?: AbortSignal): Promise<T> {
    return Promise.reject(
      new LlmProviderError(this.id, 'structured: PoC-F の範囲外 — Phase 1 で format=json 実装予定'),
    );
  }
}

interface OllamaChatResponse {
  message?: { content: string };
}

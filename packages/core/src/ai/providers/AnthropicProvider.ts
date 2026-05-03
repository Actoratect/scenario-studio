import { LlmProviderError } from '../types.js';
import type { LlmCapabilities, LlmProvider, LlmRequest } from '../types.js';

// Claude (Anthropic Messages API) Provider。SDK は使わず fetch 直叩きで bundle を軽くする。
// CLAUDE.md: AI ベンダー固定の禁止 — このファイル内だけで Anthropic API を扱う。
// 詳細: ../../../../../Documentation/ScenarioEditor/11_ai-workflow.md §1.1

export interface AnthropicProviderConfig {
  /** Anthropic API キー (Browser では IndexedDB + WebCrypto から復号、Tauri/Unity は OS keychain)。 */
  apiKey: string;
  /** Anthropic API のベース URL。proxy 等に差し替え可。 */
  baseUrl?: string;
  /** Browser で使う場合は true (CORS 許可ヘッダ送信)。Phase 4+ では proxy 推奨。 */
  dangerouslyAllowBrowser?: boolean;
  /** テスト用 fetch スタブ。デフォルトはグローバル fetch。 */
  fetchImpl?: typeof fetch;
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic';
  readonly displayName = 'Anthropic Claude';
  readonly capabilities: LlmCapabilities = {
    streaming: true,
    tools: true,
    structuredOutput: true,
    visionInput: true,
  };

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly dangerouslyAllowBrowser: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(config: AnthropicProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    this.dangerouslyAllowBrowser = config.dangerouslyAllowBrowser ?? false;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async complete(req: LlmRequest, signal?: AbortSignal): Promise<string> {
    const body: Record<string, unknown> = {
      model: req.model,
      system: req.systemPrompt,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: req.maxTokens ?? 4096,
    };
    if (req.temperature !== undefined) body['temperature'] = req.temperature;

    const res = await this.post('/v1/messages', body, signal);
    const json = (await res.json()) as AnthropicMessagesResponse;
    return extractText(json);
  }

  async *stream(req: LlmRequest, signal?: AbortSignal): AsyncIterable<string> {
    const body: Record<string, unknown> = {
      model: req.model,
      system: req.systemPrompt,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: req.maxTokens ?? 4096,
      stream: true,
    };
    if (req.temperature !== undefined) body['temperature'] = req.temperature;

    const res = await this.post('/v1/messages', body, signal);
    if (!res.body) {
      throw new LlmProviderError(this.id, 'stream: response has no body');
    }
    yield* parseAnthropicSse(res.body);
  }

  structured<T>(_req: LlmRequest, _schema: unknown, _signal?: AbortSignal): Promise<T> {
    // Phase 1 で Tool Use ベースの structured output を実装予定。
    // Anthropic Messages API の tool_use を使い、schema を input_schema として渡す。
    return Promise.reject(
      new LlmProviderError(this.id, 'structured: PoC-F の範囲外 — Phase 1 で tool_use 実装予定'),
    );
  }

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (this.dangerouslyAllowBrowser) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: signal ?? null,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new LlmProviderError(this.id, `HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res;
  }
}

// ===== 内部ユーティリティ =====

interface AnthropicMessagesResponse {
  content: ReadonlyArray<{ type: string; text?: string }>;
}

function extractText(res: AnthropicMessagesResponse): string {
  const parts: string[] = [];
  for (const block of res.content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('');
}

async function* parseAnthropicSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE は `\n\n` でイベント区切り
      let idx = buffer.indexOf('\n\n');
      while (idx !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const text = parseSseEvent(event);
        if (text) yield text;
        idx = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseEvent(raw: string): string | undefined {
  // Anthropic は `event: content_block_delta\ndata: {...}` 形式。data 行だけ拾う。
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '' || payload === '[DONE]') continue;
    try {
      const json = JSON.parse(payload) as {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
        return json.delta.text;
      }
    } catch {
      // 壊れた payload は無視 (interim chunk の可能性)
    }
  }
  return undefined;
}

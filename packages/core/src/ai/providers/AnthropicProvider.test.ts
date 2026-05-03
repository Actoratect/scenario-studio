import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './AnthropicProvider.js';
import { LlmProviderError } from '../types.js';

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

describe('AnthropicProvider', () => {
  it('complete sends Messages API request and extracts text', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'hello world' }] }));
    const provider = new AnthropicProvider({ apiKey: 'sk-test', fetchImpl });

    const text = await provider.complete({
      systemPrompt: 'be helpful',
      messages: [{ role: 'user', content: 'hi' }],
      model: 'claude-opus-4-7',
      maxTokens: 256,
      temperature: 0.5,
    });

    expect(text).toBe('hello world');

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBeUndefined();

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      model: 'claude-opus-4-7',
      system: 'be helpful',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 256,
      temperature: 0.5,
    });
  });

  it('complete propagates server errors as LlmProviderError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const provider = new AnthropicProvider({ apiKey: 'sk-test', fetchImpl });

    await expect(
      provider.complete({
        systemPrompt: '',
        messages: [{ role: 'user', content: 'x' }],
        model: 'claude-opus-4-7',
      }),
    ).rejects.toBeInstanceOf(LlmProviderError);
  });

  it('dangerouslyAllowBrowser adds the CORS header', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));
    const provider = new AnthropicProvider({
      apiKey: 'sk-test',
      dangerouslyAllowBrowser: true,
      fetchImpl,
    });
    await provider.complete({
      systemPrompt: '',
      messages: [{ role: 'user', content: 'x' }],
      model: 'claude-opus-4-7',
    });
    const headers = (fetchImpl.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('stream yields text deltas from Anthropic SSE', async () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start"}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const provider = new AnthropicProvider({ apiKey: 'sk-test', fetchImpl });

    const collected: string[] = [];
    for await (const chunk of provider.stream({
      systemPrompt: '',
      messages: [{ role: 'user', content: 'x' }],
      model: 'claude-opus-4-7',
    })) {
      collected.push(chunk);
    }
    expect(collected.join('')).toBe('Hello');
  });

  it('structured rejects with LlmProviderError (PoC scope)', async () => {
    const provider = new AnthropicProvider({ apiKey: 'sk', fetchImpl: vi.fn() });
    await expect(
      provider.structured({ systemPrompt: '', messages: [], model: 'claude-opus-4-7' }, {}),
    ).rejects.toBeInstanceOf(LlmProviderError);
  });
});

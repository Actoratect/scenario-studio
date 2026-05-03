import { describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from './OllamaProvider.js';
import { LlmProviderError } from '../types.js';

describe('OllamaProvider', () => {
  it('complete posts /api/chat with messages including system + extracts text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: 'こんにちは' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const provider = new OllamaProvider({ fetchImpl });

    const text = await provider.complete({
      systemPrompt: 'be brief',
      messages: [{ role: 'user', content: 'hi' }],
      model: 'llama3:70b',
      temperature: 0.7,
    });

    expect(text).toBe('こんにちは');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      model: 'llama3:70b',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ],
      stream: false,
      options: { temperature: 0.7 },
    });
  });

  it('complete propagates non-2xx as LlmProviderError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('model not found', { status: 404 }));
    const provider = new OllamaProvider({ fetchImpl });
    await expect(
      provider.complete({
        systemPrompt: '',
        messages: [{ role: 'user', content: 'x' }],
        model: 'missing',
      }),
    ).rejects.toBeInstanceOf(LlmProviderError);
  });

  it('uses custom endpoint if configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: 'ok' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const provider = new OllamaProvider({ endpoint: 'http://192.168.1.10:11434/', fetchImpl });
    await provider.complete({
      systemPrompt: '',
      messages: [{ role: 'user', content: 'x' }],
      model: 'llama3',
    });
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://192.168.1.10:11434/api/chat');
  });
});

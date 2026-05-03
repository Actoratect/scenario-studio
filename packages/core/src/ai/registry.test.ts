import { describe, expect, it } from 'vitest';
import { AgentRunnerRegistry, LlmProviderRegistry } from './registry.js';
import type { AgentRunner, LlmProvider } from './types.js';

const fakeProvider = (id: string): LlmProvider => ({
  id,
  displayName: id,
  capabilities: { streaming: false, tools: false, structuredOutput: false, visionInput: false },
  complete: () => Promise.resolve(''),
  stream: async function* () {},
  structured: () => Promise.reject(new Error('not implemented')),
});

const fakeRunner = (id: string): AgentRunner => ({
  id,
  displayName: id,
  capabilities: {
    writesFiles: false,
    runsCommands: false,
    createsBranch: false,
    createsPullRequest: false,
  },
  run: () => Promise.resolve({ patches: [], log: '', exitCode: 0 }),
});

describe('LlmProviderRegistry', () => {
  it('register + get', () => {
    const reg = new LlmProviderRegistry();
    reg.register(fakeProvider('anthropic'));
    expect(reg.get('anthropic').id).toBe('anthropic');
  });

  it('rejects duplicate registration', () => {
    const reg = new LlmProviderRegistry();
    reg.register(fakeProvider('anthropic'));
    expect(() => reg.register(fakeProvider('anthropic'))).toThrow(/already registered/);
  });

  it('throws on unknown id', () => {
    const reg = new LlmProviderRegistry();
    expect(() => reg.get('missing')).toThrow(/not registered/);
  });

  it('list returns all registered providers', () => {
    const reg = new LlmProviderRegistry();
    reg.register(fakeProvider('anthropic'));
    reg.register(fakeProvider('openai'));
    expect(
      reg
        .list()
        .map((p) => p.id)
        .sort(),
    ).toEqual(['anthropic', 'openai']);
  });

  it('per-useCase defaults are independent', () => {
    const reg = new LlmProviderRegistry();
    reg.register(fakeProvider('anthropic'));
    reg.register(fakeProvider('ollama'));
    reg.setDefault('inline', 'ollama');
    reg.setDefault('linter', 'anthropic');
    expect(reg.getDefault('inline')?.id).toBe('ollama');
    expect(reg.getDefault('linter')?.id).toBe('anthropic');
    expect(reg.getDefault('translation')).toBeUndefined();
  });

  it('setDefault rejects unregistered providerId', () => {
    const reg = new LlmProviderRegistry();
    expect(() => reg.setDefault('inline', 'missing')).toThrow(/not registered/);
  });

  it('unregister also clears any default that pointed at it', () => {
    const reg = new LlmProviderRegistry();
    reg.register(fakeProvider('anthropic'));
    reg.setDefault('inline', 'anthropic');
    reg.unregister('anthropic');
    expect(reg.getDefault('inline')).toBeUndefined();
  });
});

describe('AgentRunnerRegistry', () => {
  it('register + get + list', () => {
    const reg = new AgentRunnerRegistry();
    reg.register(fakeRunner('claude-code'));
    reg.register(fakeRunner('codex'));
    expect(
      reg
        .list()
        .map((r) => r.id)
        .sort(),
    ).toEqual(['claude-code', 'codex']);
  });

  it('per-useCase defaults', () => {
    const reg = new AgentRunnerRegistry();
    reg.register(fakeRunner('claude-code'));
    reg.register(fakeRunner('aider'));
    reg.setDefault('refactor', 'claude-code');
    reg.setDefault('quick-fix', 'aider');
    expect(reg.getDefault('refactor')?.id).toBe('claude-code');
    expect(reg.getDefault('quick-fix')?.id).toBe('aider');
  });
});

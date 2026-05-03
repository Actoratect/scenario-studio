import type { AgentRunner, LlmProvider } from './types.js';

// AI Provider / Runner の登録と既定切替を担うレジストリ。
// 用途別に既定を分けたい場面 (例: 「Inline 補完は Ollama、Agent は Claude Code」)
// に備えて、用途キー (string) で defaults を保持する。
// 詳細: ../../../../Documentation/ScenarioEditor/11_ai-workflow.md §1.3

export class LlmProviderRegistry {
  private readonly providers = new Map<string, LlmProvider>();
  private readonly defaults = new Map<string, string>(); // useCase -> providerId

  register(provider: LlmProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`LlmProvider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
    for (const [useCase, defaultId] of this.defaults) {
      if (defaultId === id) this.defaults.delete(useCase);
    }
  }

  get(id: string): LlmProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`LlmProvider not registered: ${id}`);
    return p;
  }

  list(): readonly LlmProvider[] {
    return Array.from(this.providers.values());
  }

  setDefault(useCase: string, providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Cannot set default for ${useCase}: provider ${providerId} not registered`);
    }
    this.defaults.set(useCase, providerId);
  }

  getDefault(useCase: string): LlmProvider | undefined {
    const id = this.defaults.get(useCase);
    return id ? this.providers.get(id) : undefined;
  }
}

export class AgentRunnerRegistry {
  private readonly runners = new Map<string, AgentRunner>();
  private readonly defaults = new Map<string, string>();

  register(runner: AgentRunner): void {
    if (this.runners.has(runner.id)) {
      throw new Error(`AgentRunner already registered: ${runner.id}`);
    }
    this.runners.set(runner.id, runner);
  }

  unregister(id: string): void {
    this.runners.delete(id);
    for (const [useCase, defaultId] of this.defaults) {
      if (defaultId === id) this.defaults.delete(useCase);
    }
  }

  get(id: string): AgentRunner {
    const r = this.runners.get(id);
    if (!r) throw new Error(`AgentRunner not registered: ${id}`);
    return r;
  }

  list(): readonly AgentRunner[] {
    return Array.from(this.runners.values());
  }

  setDefault(useCase: string, runnerId: string): void {
    if (!this.runners.has(runnerId)) {
      throw new Error(`Cannot set default for ${useCase}: runner ${runnerId} not registered`);
    }
    this.defaults.set(useCase, runnerId);
  }

  getDefault(useCase: string): AgentRunner | undefined {
    const id = this.defaults.get(useCase);
    return id ? this.runners.get(id) : undefined;
  }
}

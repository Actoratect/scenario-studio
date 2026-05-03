// AI Provider 抽象 (PoC-F)。
// 詳細: ../../../../Documentation/ScenarioEditor/11_ai-workflow.md

export type {
  AgentCapabilities,
  AgentEvent,
  AgentRunResult,
  AgentRunner,
  AgentScope,
  AgentTask,
  GitPatch,
  LlmCapabilities,
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmRole,
} from './types.js';

export { AgentRunnerError, LlmProviderError } from './types.js';

export { AgentRunnerRegistry, LlmProviderRegistry } from './registry.js';

export { AnthropicProvider } from './providers/AnthropicProvider.js';
export type { AnthropicProviderConfig } from './providers/AnthropicProvider.js';
export { OllamaProvider } from './providers/OllamaProvider.js';
export type { OllamaProviderConfig } from './providers/OllamaProvider.js';
export { OpenAiProvider } from './providers/OpenAiProvider.js';
export type { OpenAiProviderConfig } from './providers/OpenAiProvider.js';

// Key vault (M7) — WebCrypto AES-GCM + PBKDF2 でパスフレーズ起動
export type { EncryptedKeyBlob } from './key-vault.js';
export { decryptApiKey, encryptApiKey } from './key-vault.js';

import { createSignal } from 'solid-js';
import {
  AnthropicProvider,
  decryptApiKey,
  encryptApiKey,
  OpenAiProvider,
  OllamaProvider,
} from '@scenario-studio/core';
import type { LlmMessage, LlmProvider } from '@scenario-studio/core';
import { clearKeyBlob, loadKeyBlob, saveKeyBlob } from './ai-key-store.js';

// AI Service (M8) — keyVault → unlock → Provider 構築 → prompt 送信。
// 設計: ベンダー固定禁止。Provider 切替は `AI_PROVIDERS` の 1 行追加で OK。
// 詳細: ../../../../Documentation/ScenarioEditor/11_ai-workflow.md §1, §6.1,
//       ../../../../Documentation/ScenarioEditor/16_security.md §2.7,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7, M8

export type ProviderId = 'anthropic' | 'openai' | 'ollama';

export interface AiProviderOption {
  id: ProviderId;
  displayName: string;
  /** その Provider のデフォルト model 文字列。 */
  defaultModel: string;
  /** API キーが要らない (Ollama 等) なら true。 */
  keyless: boolean;
}

export const AI_PROVIDERS: readonly AiProviderOption[] = [
  // 6 prerequisite decision: claude-opus-4-7 をデフォルト
  {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    defaultModel: 'claude-opus-4-7',
    keyless: false,
  },
  { id: 'openai', displayName: 'OpenAI GPT', defaultModel: 'gpt-4o-mini', keyless: false },
  { id: 'ollama', displayName: 'Ollama (local)', defaultModel: 'llama3', keyless: true },
];

export type AiStatus =
  | { kind: 'locked' }
  | { kind: 'no-key' }
  | { kind: 'unlocked'; providerId: ProviderId };

export interface AiSendRequest {
  systemPrompt: string;
  messages: readonly LlmMessage[];
  model?: string;
  /** 月次予算 / token 上限の早期警告に使う想定 (Phase 1 後半)。 */
  maxTokens?: number;
}

const [providerId, setProviderId] = createSignal<ProviderId>('anthropic');
const [status, setStatus] = createSignal<AiStatus>({ kind: 'locked' });
const [lastError, setLastError] = createSignal<Error | undefined>(undefined);
const [inlineEnabled, setInlineEnabled] = createSignal<boolean>(false);

let activeProvider: LlmProvider | undefined;

async function detectStatus(id: ProviderId): Promise<AiStatus> {
  const opt = providerOption(id);
  if (opt.keyless) return { kind: 'no-key' };
  const blob = await loadKeyBlob(id);
  return blob ? { kind: 'locked' } : { kind: 'no-key' };
}

function providerOption(id: ProviderId): AiProviderOption {
  const opt = AI_PROVIDERS.find((p) => p.id === id);
  if (!opt) throw new Error(`Unknown providerId: ${id}`);
  return opt;
}

function buildProvider(id: ProviderId, apiKey: string): LlmProvider {
  switch (id) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey, dangerouslyAllowBrowser: true });
    case 'openai':
      return new OpenAiProvider({ apiKey });
    case 'ollama':
      return new OllamaProvider({});
  }
}

export const AiService = {
  providerId,
  status,
  lastError,
  inlineEnabled,
  providers: AI_PROVIDERS,

  setInlineEnabled(v: boolean): void {
    setInlineEnabled(v);
  },

  /** 起動時に呼ぶ — 現在の providerId について鍵保有状況を判定。 */
  async refreshStatus(): Promise<void> {
    setStatus(await detectStatus(providerId()));
  },

  /** Provider を切替 (鍵保有状況を再判定)。 */
  async switchProvider(id: ProviderId): Promise<void> {
    setLastError(undefined);
    setProviderId(id);
    activeProvider = undefined;
    setStatus(await detectStatus(id));
  },

  /** 新規 API キーを設定 — encrypt して IDB に保存、Provider も unlock 状態に。 */
  async setKey(apiKey: string, passphrase: string): Promise<void> {
    setLastError(undefined);
    const id = providerId();
    const blob = await encryptApiKey(apiKey, passphrase);
    await saveKeyBlob(id, blob);
    activeProvider = buildProvider(id, apiKey);
    setStatus({ kind: 'unlocked', providerId: id });
  },

  /** 既存 blob をパスフレーズで復号して unlock。 */
  async unlock(passphrase: string): Promise<void> {
    setLastError(undefined);
    const id = providerId();
    const opt = providerOption(id);
    if (opt.keyless) {
      activeProvider = buildProvider(id, '');
      setStatus({ kind: 'unlocked', providerId: id });
      return;
    }
    const blob = await loadKeyBlob(id);
    if (!blob) throw new Error('No saved key — call setKey() first.');
    try {
      const apiKey = await decryptApiKey(blob, passphrase);
      activeProvider = buildProvider(id, apiKey);
      setStatus({ kind: 'unlocked', providerId: id });
    } catch (e) {
      const err =
        e instanceof Error
          ? new Error(`パスフレーズが違います (${e.message})`)
          : new Error(String(e));
      setLastError(err);
      throw err;
    }
  },

  /** メモリ上の Provider と APIキーを破棄 (IDB blob は残す)。 */
  lock(): void {
    activeProvider = undefined;
    setLastError(undefined);
    setStatus({ kind: 'locked' });
  },

  /** IDB から blob を削除 (鍵を完全に忘れる)。 */
  async forgetKey(): Promise<void> {
    await clearKeyBlob(providerId());
    activeProvider = undefined;
    setStatus({ kind: 'no-key' });
  },

  /**
   * Show prompt 確認後に呼ぶ送信エンドポイント。
   * 呼び出し側 UI が「これを送信します:」確認 → ユーザ承認 → send() の順で使う。
   */
  async send(req: AiSendRequest): Promise<string> {
    if (!activeProvider) throw new Error('AI not unlocked. Call unlock() first.');
    setLastError(undefined);
    const opt = providerOption(providerId());
    try {
      return await activeProvider.complete({
        systemPrompt: req.systemPrompt,
        messages: req.messages,
        model: req.model ?? opt.defaultModel,
        ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setLastError(err);
      throw err;
    }
  },

  /**
   * 脚本 inline 続き提案 (PR-F)。1 行のみ、低 maxTokens、Show prompt 不要。
   * inlineEnabled() == false / unlocked でない場合は undefined を返す (no-op)。
   * AbortSignal で外部からキャンセル可能 (ユーザのキー入力で前リクエスト中断)。
   */
  async requestInline(prefix: string, signal?: AbortSignal): Promise<string | undefined> {
    if (!inlineEnabled()) return undefined;
    if (!activeProvider) return undefined;
    if (status().kind !== 'unlocked') return undefined;
    const opt = providerOption(providerId());
    const systemPrompt =
      'あなたは日本語シナリオの執筆を補佐するアシスタントです。' +
      '与えられた脚本の続きを 1 行だけ、改行を含めずに提案してください。' +
      '余計な前置きや解説は不要、続きの本文のみ。';
    try {
      const response = await activeProvider.complete(
        {
          systemPrompt,
          messages: [{ role: 'user', content: prefix }],
          model: opt.defaultModel,
          maxTokens: 80,
          temperature: 0.7,
        },
        signal,
      );
      // 改行以降を捨てる (1 行制約)
      const firstLine = response.split(/\r?\n/)[0]?.trim() ?? '';
      return firstLine || undefined;
    } catch (e) {
      // abort は静かに無視
      if (e instanceof DOMException && e.name === 'AbortError') return undefined;
      // その他のエラーも inline では Toast を出さない (ユーザの邪魔をしない)
      return undefined;
    }
  },
};

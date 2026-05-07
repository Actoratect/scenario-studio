import { createSignal } from 'solid-js';
import {
  AnthropicProvider,
  decryptApiKey,
  encryptApiKey,
  OpenAiProvider,
  OllamaProvider,
  TEXT_SUGGESTION_PRESETS,
} from '@scenario-studio/core';
import type {
  FieldAiContext,
  LlmMessage,
  LlmProvider,
  TextSuggestionCandidate,
  TextSuggestionPresetId,
} from '@scenario-studio/core';
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
   * PR-AR: テキスト欄右クリック → 3 案提案。
   * 単一プリセット (短く / 自然に / 口調強め 等) を選び、temperature 違いで
   * 3 案を並列生成。Show prompt 確認は呼び側 UI で行う想定。
   * unlock 必須。
   */
  async requestTextSuggestions(
    context: FieldAiContext,
    presetId: TextSuggestionPresetId,
  ): Promise<readonly TextSuggestionCandidate[]> {
    if (!activeProvider) throw new Error('AI not unlocked. Call unlock() first.');
    if (status().kind !== 'unlocked') throw new Error('AI not unlocked.');
    const preset = TEXT_SUGGESTION_PRESETS.find((p) => p.id === presetId);
    if (!preset) throw new Error(`Unknown text preset: ${presetId}`);
    const opt = providerOption(providerId());
    const systemPrompt =
      `あなたはシナリオ執筆を支援する日本語アシスタントです。\n` +
      `タスク: ${preset.instruction}\n` +
      `重要:\n` +
      `- 与えられた以外のメタ情報を勝手に追加しない\n` +
      `- 出力は書き換え後のテキスト 1 つだけ。前置きや「以下が候補です」等は不要\n` +
      `- 改行は元テキストの構造を保つ範囲で\n`;
    const userPrompt = buildFieldUserPrompt(context);
    const provider = activeProvider;
    setLastError(undefined);
    // 3 並列生成: temperature を 0.3 / 0.6 / 0.9 で振って多様性を出す
    const temperatures = [0.3, 0.6, 0.9];
    const labels = ['案1: 控えめ', '案2: バランス', '案3: 大胆'];
    try {
      const results = await Promise.all(
        temperatures.map((t) =>
          provider.complete({
            systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            model: opt.defaultModel,
            maxTokens: 600,
            temperature: t,
          }),
        ),
      );
      return results.map((text, i) => ({
        id: `cand-${Date.now()}-${i}`,
        label: labels[i] ?? `案${i + 1}`,
        text: text.trim(),
      }));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setLastError(err);
      throw err;
    }
  },

  textSuggestionPresets: TEXT_SUGGESTION_PRESETS,

  /**
   * シーン全体の 1 行要約を生成 (PR-AJ)。Cmd+Shift+A 等から呼ばれる想定。
   * Show prompt 必要 (まとまった script 全文を送る) — 呼び側 UI が confirm すること。
   * unlock 必須 / lock 中は throw。
   */
  async requestSceneSummary(sceneText: string): Promise<string> {
    if (!activeProvider) throw new Error('AI not unlocked. Call unlock() first.');
    if (status().kind !== 'unlocked') throw new Error('AI not unlocked.');
    const opt = providerOption(providerId());
    const systemPrompt =
      'あなたは日本語シナリオを 1 行 (40 字以内) で要約するエディタアシスタントです。' +
      '与えられた scene の内容を、登場人物 + 主な出来事 + 結末の 3 要素で 1 行に圧縮してください。' +
      '余計な前置きや解説は不要、要約 1 行のみ。';
    setLastError(undefined);
    try {
      const response = await activeProvider.complete({
        systemPrompt,
        messages: [{ role: 'user', content: sceneText }],
        model: opt.defaultModel,
        maxTokens: 120,
        temperature: 0.3,
      });
      const firstLine = response.split(/\r?\n/)[0]?.trim() ?? '';
      return firstLine || response.trim();
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

/**
 * PR-AR: FieldAiContext から user prompt を組み立てる。
 * 構造化された「対象 / 現在値 / 周辺 / プロジェクト文脈」を Markdown で並べる。
 */
function buildFieldUserPrompt(c: FieldAiContext): string {
  const parts: string[] = [];
  parts.push(`## 編集対象`);
  switch (c.target.kind) {
    case 'node-field':
      parts.push(`- 種別: ノードフィールド`);
      parts.push(`- nodeId: ${c.target.nodeId}`);
      parts.push(`- fieldId: ${c.target.fieldId}`);
      break;
    case 'script-block':
      parts.push(`- 種別: 脚本ブロック ${c.target.field}`);
      parts.push(`- 章: ${c.target.chapterSlug}`);
      parts.push(`- シーン: ${c.target.sceneSlug}`);
      parts.push(`- ブロック index: ${c.target.blockIndex}`);
      break;
    case 'synopsis':
      parts.push(`- 種別: あらすじ Markdown`);
      parts.push(`- path: ${c.target.path}`);
      break;
  }
  if (c.projectContext.displayName) {
    parts.push(`- 関連キャラ表示名: ${c.projectContext.displayName}`);
  }
  if (c.projectContext.nodeSlug) {
    parts.push(`- ノード slug: ${c.projectContext.nodeSlug}`);
  }
  if (c.projectContext.eraId) {
    parts.push(`- 現在 Era: ${c.projectContext.eraId}`);
  }
  if (c.projectContext.glossaryTerms.length > 0) {
    parts.push(`- 用語集: ${c.projectContext.glossaryTerms.join(', ')}`);
  }
  if (c.selectedText && c.selectedText !== c.currentValue) {
    parts.push('');
    parts.push(`## 選択範囲 (この部分を書き換える)`);
    parts.push('```');
    parts.push(c.selectedText);
    parts.push('```');
    parts.push(`## 全体 (参考)`);
    parts.push('```');
    parts.push(c.currentValue ?? '');
    parts.push('```');
  } else {
    parts.push('');
    parts.push(`## 現在の値 (これを書き換える)`);
    parts.push('```');
    parts.push(c.currentValue ?? '');
    parts.push('```');
  }
  if (c.surroundingText) {
    parts.push('');
    parts.push(`## 前後の文脈 (参考、書き換えない)`);
    parts.push('```');
    parts.push(c.surroundingText);
    parts.push('```');
  }
  return parts.join('\n');
}

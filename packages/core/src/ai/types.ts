// AI 関連の共通型 (LlmProvider / AgentRunner)。
// 詳細: ../../../../Documentation/ScenarioEditor/11_ai-workflow.md §1
//
// 設計方針 (CLAUDE.md):
//   - AI ベンダー固定の禁止 — Claude / OpenAI / Gemini / Ollama / Codex / Aider 等を抽象越しに切替
//   - 直接 SDK を import するのは Provider 実装ファイルだけ

// ===== LLM 直叩き系 =====

export type LlmRole = 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmRequest {
  systemPrompt: string;
  messages: readonly LlmMessage[];
  /** Provider 依存の model ID 文字列 (例: "claude-opus-4-7", "gpt-4o", "llama3:70b")。 */
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** Anthropic prompt caching 等の指示 (Provider が無視可)。 */
  cache?: 'aggressive' | 'minimal' | 'off';
}

export interface LlmCapabilities {
  streaming: boolean;
  tools: boolean;
  structuredOutput: boolean;
  visionInput: boolean;
}

export interface LlmProvider {
  /** Registry での識別子 (例: "anthropic" | "openai" | "ollama")。 */
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: LlmCapabilities;

  /** 同期完了応答。Provider が streaming を内部利用しても外形は string を返す。 */
  complete(req: LlmRequest, signal?: AbortSignal): Promise<string>;

  /** Token / 部分文字列を逐次返す。capabilities.streaming=false の Provider は throw。 */
  stream(req: LlmRequest, signal?: AbortSignal): AsyncIterable<string>;

  /**
   * JSON Schema を強制した structured output。
   * capabilities.structuredOutput=false の Provider は throw。
   * Phase 1 で実装する Provider が増える想定 (Anthropic tool use / OpenAI function calling / Ollama format=json)。
   */
  structured<T>(req: LlmRequest, schema: unknown, signal?: AbortSignal): Promise<T>;
}

// ===== Agent 駆動系 =====

export interface AgentScope {
  include: readonly string[];
  exclude: readonly string[];
}

export interface AgentTask {
  prompt: string;
  /** プロジェクトルート相対 OR 絶対パス。Runner 実装が解決する。 */
  workingDirectory: string;
  scope: AgentScope;
  /** 新規 branch を作って作業させる場合の名前。空なら現在 branch 直接編集。 */
  branch?: string;
  /** true なら実ファイル変更なしで patches だけ返す。 */
  dryRun: boolean;
  envOverrides?: Readonly<Record<string, string>>;
}

export interface GitPatch {
  path: string;
  /** unified diff 全文。エディタ側が diff viewer に流す。 */
  unifiedDiff: string;
}

export interface AgentRunResult {
  patches: readonly GitPatch[];
  branchCreated?: string;
  prUrl?: string;
  log: string;
  exitCode: number;
}

export interface AgentEvent {
  kind: 'log' | 'patch' | 'progress' | 'error';
  message: string;
  /** progress は 0..1、error は detail を補足、patch は対象 path。 */
  detail?: string;
}

export interface AgentCapabilities {
  writesFiles: boolean;
  runsCommands: boolean;
  createsBranch: boolean;
  createsPullRequest: boolean;
}

export interface AgentRunner {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: AgentCapabilities;

  run(task: AgentTask, signal?: AbortSignal): Promise<AgentRunResult>;
  stream?(task: AgentTask, signal?: AbortSignal): AsyncIterable<AgentEvent>;
}

// ===== Field Context AI Actions (PR-AR / 22_ux_feature_review.md §G5) =====

/**
 * テキスト欄 / 画像欄の右クリック AI が、AI Service に渡す文脈。
 * UI 層が編集対象とプロジェクト内の関連情報を集約してから渡す。
 */
export interface FieldAiContext {
  /** 編集対象の場所。これを見て candidate 採用後の保存経路を切替える。 */
  target:
    | { kind: 'node-field'; nodeId: string; fieldId: string }
    | {
        kind: 'script-block';
        chapterSlug: string;
        sceneSlug: string;
        blockIndex: number;
        field: 'text' | 'prompt';
      }
    | { kind: 'synopsis'; path: string };

  /** カーソル選択範囲のテキスト (省略時は currentValue 全体を対象)。 */
  selectedText?: string;
  /** フィールドの現在値 (テキスト系のみ)。 */
  currentValue?: string;
  /** スクリプトブロック等で前後の文脈 (前 N ブロック + 後 1 ブロック等)。 */
  surroundingText?: string;

  /** プロジェクト内の関連メタ — prompt の品質を上げる。 */
  projectContext: {
    nodeSlug?: string;
    displayName?: string;
    templateId?: string;
    eraId?: string;
    glossaryTerms: readonly string[];
    relatedNodes: readonly string[];
  };
}

/** テキスト欄向け 3 案のプリセット (案 1 / 案 2 / 案 3 のラベル)。 */
export type TextSuggestionPresetId =
  | 'natural'
  | 'short'
  | 'character-voice'
  | 'translation-context'
  | 'fix-glossary';

export interface TextSuggestionPreset {
  id: TextSuggestionPresetId;
  label: string;
  /** systemPrompt / instruction の補完文。AI が「3 案を出す」前提で使う。 */
  instruction: string;
}

export interface TextSuggestionCandidate {
  id: string;
  /** "自然に" / "短く" / "口調強め" 等の表示ラベル。 */
  label: string;
  text: string;
  /** AI が「なぜこう書き換えたか」の補足 (省略可)。 */
  rationale?: string;
}

/** 画像生成 candidate (PR-AR では型のみ。実装は Phase 後段)。 */
export interface ImageGenerationCandidate {
  id: string;
  label: string;
  mimeType: 'image/png' | 'image/webp' | 'image/jpeg';
  bytes: Uint8Array;
  prompt: string;
  providerId: string;
}

export interface ImageGenerationProvider {
  readonly id: string;
  readonly displayName: string;
  generate(
    req: {
      prompt: string;
      n: 3;
      size: 'thumbnail' | 'portrait' | 'background';
      referenceImage?: Blob;
    },
    signal?: AbortSignal,
  ): Promise<readonly ImageGenerationCandidate[]>;
}

// ===== 共通エラー =====

export class LlmProviderError extends Error {
  constructor(
    readonly providerId: string,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(`[${providerId}] ${message}`);
    this.name = 'LlmProviderError';
  }
}

export class AgentRunnerError extends Error {
  constructor(
    readonly runnerId: string,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(`[${runnerId}] ${message}`);
    this.name = 'AgentRunnerError';
  }
}

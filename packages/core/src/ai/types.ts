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

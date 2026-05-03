import { spawn } from 'node:child_process';
import { AgentRunnerError } from '@scenario-studio/core';
import type {
  AgentCapabilities,
  AgentRunResult,
  AgentRunner,
  AgentTask,
  GitPatch,
} from '@scenario-studio/core';

// 汎用 CLI Agent Runner — `command` (例: "claude" / "codex" / "aider") を子プロセスで起動し、
// stdout/stderr を log として収集、終了コードを exitCode に。
// 11_ai-workflow.md §5.3 の「外部エージェント呼出し」パスの最小実装。
//
// branch 作成 / patch 抽出 / PR 連動は **Phase 1** で深掘り
// (今は AgentRunResult.patches は空配列、log だけが返る)。

export interface CliAgentRunnerConfig {
  id: string;
  displayName: string;
  /** 子プロセスとして起動するコマンド (例: "claude" / "codex" / "aider")。 */
  command: string;
  /** 固定引数。task ごとの追加引数は buildArgs() で組み立てる。 */
  baseArgs?: readonly string[];
  /** task → 追加引数の変換 (各 CLI ごとに異なる)。デフォルトは ["--print", task.prompt]。 */
  buildArgs?: (task: AgentTask) => readonly string[];
  capabilities?: AgentCapabilities;
  /**
   * Windows で `.cmd` / `.ps1` shim (claude.cmd 等) を解決する場合のみ true。
   * shell:true は引数がエスケープされず脆弱なので、純実行ファイルでは false 推奨。
   * デフォルト false。
   */
  shell?: boolean;
}

const DEFAULT_CAPABILITIES: AgentCapabilities = {
  writesFiles: true,
  runsCommands: true,
  createsBranch: false, // CLI 側がやる場合もあるが、Runner からは保証しない
  createsPullRequest: false,
};

export class CliAgentRunner implements AgentRunner {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: AgentCapabilities;

  private readonly command: string;
  private readonly baseArgs: readonly string[];
  private readonly buildArgs: (task: AgentTask) => readonly string[];
  private readonly shell: boolean;

  constructor(config: CliAgentRunnerConfig) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.command = config.command;
    this.baseArgs = config.baseArgs ?? [];
    this.buildArgs = config.buildArgs ?? defaultBuildArgs;
    this.capabilities = config.capabilities ?? DEFAULT_CAPABILITIES;
    this.shell = config.shell ?? false;
  }

  async run(task: AgentTask, signal?: AbortSignal): Promise<AgentRunResult> {
    const args = [...this.baseArgs, ...this.buildArgs(task)];
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (task.envOverrides) {
      for (const [k, v] of Object.entries(task.envOverrides)) env[k] = v;
    }

    return new Promise<AgentRunResult>((resolve, reject) => {
      let logBuf = '';
      const child = spawn(this.command, args, {
        cwd: task.workingDirectory,
        env,
        shell: this.shell,
      });

      const onAbort = () => {
        child.kill();
        reject(new AgentRunnerError(this.id, 'aborted'));
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        logBuf += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        logBuf += chunk.toString('utf8');
      });
      child.once('error', (err) => {
        signal?.removeEventListener('abort', onAbort);
        reject(new AgentRunnerError(this.id, 'spawn failed', err));
      });
      child.once('close', (code) => {
        signal?.removeEventListener('abort', onAbort);
        const result: AgentRunResult = {
          patches: [] as readonly GitPatch[],
          log: logBuf,
          exitCode: code ?? -1,
        };
        resolve(result);
      });
    });
  }
}

function defaultBuildArgs(task: AgentTask): readonly string[] {
  // Claude Code / 多くの汎用 CLI が `--print <prompt>` 形式に対応している前提。
  // 違う CLI (codex / aider 等) は config.buildArgs で上書きする。
  return ['--print', task.prompt];
}

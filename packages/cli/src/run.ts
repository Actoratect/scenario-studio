import { parseArgs } from './args.js';
import { exportNode } from './commands/export.js';
import { stats } from './commands/stats.js';
import { validate } from './commands/validate.js';

// CLI dispatch — bin スクリプトと vitest fixture から共通利用。
// 詳細: ../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export interface RunIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

const HELP = `scenario — Scenario Studio CLI

Usage:
  scenario validate <project-path> [--format text|json]
  scenario export   <project-path> --node <id> [--format yaml|json]
  scenario stats    <project-path> [--format text|json]
  scenario --help
`;

export async function run(argv: readonly string[], io: RunIo): Promise<number> {
  const args = parseArgs(argv);

  if (args.command === '' || args.command === '--help' || args.flags['help'] === true) {
    io.stdout(HELP.trimEnd());
    return 0;
  }

  switch (args.command) {
    case 'validate': {
      const projectPath = args.positional[0];
      if (!projectPath) {
        io.stderr('validate: missing <project-path>');
        return 2;
      }
      const r = await validate({
        projectPath,
        format: parseFormat(args.flags['format'], 'text'),
      });
      io.stdout(r.output);
      return r.exitCode;
    }
    case 'export': {
      const projectPath = args.positional[0];
      const nodeId = args.flags['node'];
      if (!projectPath) {
        io.stderr('export: missing <project-path>');
        return 2;
      }
      if (typeof nodeId !== 'string' || nodeId === '') {
        io.stderr('export: missing --node <id>');
        return 2;
      }
      const r = await exportNode({
        projectPath,
        nodeId,
        format: parseExportFormat(args.flags['format']),
      });
      if (r.exitCode === 0) io.stdout(r.output);
      else io.stderr(r.output);
      return r.exitCode;
    }
    case 'stats': {
      const projectPath = args.positional[0];
      if (!projectPath) {
        io.stderr('stats: missing <project-path>');
        return 2;
      }
      const r = await stats({
        projectPath,
        format: parseFormat(args.flags['format'], 'text'),
      });
      io.stdout(r.output);
      return r.exitCode;
    }
    default:
      io.stderr(`Unknown command: ${args.command}`);
      io.stderr(HELP.trimEnd());
      return 2;
  }
}

function parseFormat(v: unknown, fallback: 'text' | 'json'): 'text' | 'json' {
  return v === 'json' ? 'json' : v === 'text' ? 'text' : fallback;
}
function parseExportFormat(v: unknown): 'yaml' | 'json' {
  return v === 'json' ? 'json' : 'yaml';
}

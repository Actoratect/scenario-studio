// CLI 引数パーサ。第三者 dep を入れず、Phase 1 で扱う最小機能 (positional + --flag) のみ。
// 詳細: ../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export interface ParsedArgs {
  command: string;
  positional: readonly string[];
  flags: Readonly<Record<string, string | boolean>>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0) {
    return { command: '', positional: [], flags: {} };
  }
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i]!;
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      if (eq !== -1) {
        flags[tok.slice(2, eq)] = tok.slice(eq + 1);
      } else {
        const next = rest[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[tok.slice(2)] = next;
          i++;
        } else {
          flags[tok.slice(2)] = true;
        }
      }
    } else {
      positional.push(tok);
    }
  }
  return { command: command!, positional, flags };
}

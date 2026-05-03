// tsx 経由で起動される CLI エントリ (M8)。
// bin/scenario.mjs から呼ばれ、process.argv を解釈して run() に流す。
// 詳細: ../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

import { run } from './run.js';

const argv = process.argv.slice(2);
const code = await run(argv, {
  stdout: (line) => process.stdout.write(line + '\n'),
  stderr: (line) => process.stderr.write(line + '\n'),
}).catch((e) => {
  process.stderr.write(`scenario: ${e instanceof Error ? e.message : String(e)}\n`);
  return 1;
});
process.exit(code);

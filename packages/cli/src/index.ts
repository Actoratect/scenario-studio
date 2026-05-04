// `scenario` CLI のエントリ。
// サブコマンド: validate / export / stats
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §11,
//       ../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export const CLI_VERSION = '0.1.0';

export { parseArgs } from './args.js';
export type { ParsedArgs } from './args.js';

export { validate } from './commands/validate.js';
export type { ValidateOptions, ValidateResult } from './commands/validate.js';

export { exportNode } from './commands/export.js';
export type { ExportOptions, ExportResult } from './commands/export.js';

export { stats } from './commands/stats.js';
export type { StatsOptions, StatsReport, StatsResult } from './commands/stats.js';

export { exportAllCmd, exportSceneCmd } from './commands/export-scene.js';
export type {
  ExportAllCmdOptions,
  ExportCmdResult,
  ExportSceneCmdOptions,
} from './commands/export-scene.js';

export { run } from './run.js';

// @scenario-studio/core エントリ。layer 別にまとめて re-export。
// 詳細は ../../../Documentation/ScenarioEditor/12_architecture.md §1
export const VERSION = '0.0.0';

// Platform / Adapter abstractions (PoC-C)
export { assertSafePath, compileGlob, InvalidPathError } from './platform.js';
export type {
  FileSystemAdapter,
  ProjectHandle,
  WatchEvent,
  WatchEventKind,
  WatchHandler,
} from './platform.js';

// AI Provider 抽象 (PoC-F)
export * from './ai/index.js';

// Domain models (PoC-E)
export * from './domain/index.js';

// ローカル履歴 / Undo-Redo (PoC-H、Phase X SaaS への布石)
export * from './history/index.js';

// YAML parse / serialize (M1) + サニタイズ (M8)
export type { ParsedYaml, YamlValue } from './yaml/index.js';
export { parseYaml, serializeYaml, stringifyYaml } from './yaml/index.js';
export { sanitizeYamlKey, sanitizeYamlTree, sanitizeYamlValue } from './yaml/sanitize.js';

// Project layer (M1) — settings / model / loader / initializer
export * from './project/index.js';

// Graph (M5) — Relationship Lens + 初期レイアウト
export * from './graph/index.js';

// Lint (M7) — engine + 5 builtin rules
export * from './lint/index.js';

// Export (PR-K) — scene / project を text / Markdown に書き出す
export * from './export/index.js';

// Placeholder. PoC-D 以降で domain models を実装する。
// 詳細は ../../../Documentation/ScenarioEditor/03_data-model.md
export const VERSION = '0.0.0';

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

// Domain models (PoC-E から本格化)
export * from './domain/index.js';

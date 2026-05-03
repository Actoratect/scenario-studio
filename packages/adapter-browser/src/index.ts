// Browser 用 Adapter (FS Access API / OPFS / IndexedDB)。
// 実装は PoC-C で。詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §1
import type { FileSystemAdapter } from '@scenario-studio/core';

export type BrowserAdapter = FileSystemAdapter;

// Node.js 用 Adapter (CLI / CI / scripted 環境向け)。
// 実装は PoC-C で。詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §1, §11
import type { FileSystemAdapter } from '@scenario-studio/core';

export type NodeAdapter = FileSystemAdapter;

// Unity Editor Bridge 用 Adapter (HTTP + SSE for AssetDatabase)。
// 実装は Phase 2 で。詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §7,
// ../../../Documentation/ScenarioEditor/18_unity-integration.md
import type { FileSystemAdapter } from '@scenario-studio/core';

export type UnityAdapter = FileSystemAdapter;

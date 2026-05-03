// Unity Editor Bridge 用 Adapter (HTTP / SSE クライアント)。
// Bridge サーバ実体 (C#) は com.actoratect.editor-tools 側で Phase 2 に実装。
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §7,
//       ../../../Documentation/ScenarioEditor/18_unity-integration.md
export type { UnityBridgeConfig } from './UnityFileSystemAdapter.js';
export { UnityFileSystemAdapter } from './UnityFileSystemAdapter.js';

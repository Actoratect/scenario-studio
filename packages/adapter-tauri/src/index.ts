// Tauri 用 Adapter (invoke / Rust FS / native dialogs)。
// 実装は PoC-G / Phase 3 で。詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §1
import type { FileSystemAdapter } from '@scenario-studio/core';

export type TauriAdapter = FileSystemAdapter;

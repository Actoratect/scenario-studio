import { BrowserFileSystemAdapter } from './BrowserFileSystemAdapter.js';
import type { ProjectHandle } from '@scenario-studio/core';

// FS Access API のディレクトリピッカーラッパ。Chrome / Edge 限定。
// 「フォルダ選択 → BrowserFileSystemAdapter に register → ProjectHandle 返却」を 1 関数に。
// 詳細: ../../../Documentation/ScenarioEditor/16_security.md §2,
//       ../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1

export interface PickedProject {
  adapter: BrowserFileSystemAdapter;
  handle: ProjectHandle;
  /** 永続化用の生 FileSystemDirectoryHandle (IndexedDB に投入できる)。 */
  rawDirectoryHandle: FileSystemDirectoryHandle;
}

// FS Access API の `Window#showDirectoryPicker` は仕様化済だが lib.dom 未反映。
// 必要最小限のシグネチャを補う (実行時には標準 API が解決する)。
interface WindowWithFsAccess {
  showDirectoryPicker(options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string;
  }): Promise<FileSystemDirectoryHandle>;
}

function fsWindow(): WindowWithFsAccess | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Partial<WindowWithFsAccess>;
  return typeof w.showDirectoryPicker === 'function' ? (w as WindowWithFsAccess) : undefined;
}

/**
 * FS Access API がブラウザに実装されているか。Chrome/Edge は true、Safari/Firefox は false。
 */
export function supportsFileSystemAccess(): boolean {
  return fsWindow() !== undefined;
}

/**
 * ユーザにフォルダを選んでもらい、新規 BrowserFileSystemAdapter を作って register する。
 * mode='readwrite' で書き込み権限まで取る。
 *
 * @param adapter 既存の adapter を再利用する場合に渡す。省略時は新規作成。
 */
export async function pickProjectDirectory(options: {
  adapter?: BrowserFileSystemAdapter;
  /** 表示名 (ProjectHandle.name)。省略時はディレクトリ名を使う。 */
  name?: string;
  /** showDirectoryPicker のオプション (例: id, startIn 等)。 */
  pickerOptions?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string };
}): Promise<PickedProject> {
  const w = fsWindow();
  if (!w) {
    throw new Error('File System Access API is not supported in this browser. Use Chrome or Edge.');
  }
  const dir = await w.showDirectoryPicker({
    mode: 'readwrite',
    ...options.pickerOptions,
  });
  const adapter = options.adapter ?? new BrowserFileSystemAdapter();
  const handle = adapter.register(dir, options.name ?? dir.name);
  return { adapter, handle, rawDirectoryHandle: dir };
}

/**
 * IndexedDB から復元した FileSystemDirectoryHandle に対し、ユーザの再許可を取って register する。
 * permission が拒否されたら null を返す (UI 側で「再選択」フォールバック)。
 */
export async function restoreProjectDirectory(
  rawDirectoryHandle: FileSystemDirectoryHandle,
  options: { adapter?: BrowserFileSystemAdapter; name?: string } = {},
): Promise<PickedProject | null> {
  const queryHandle = rawDirectoryHandle as PermissionedHandle;
  const current = await queryHandle.queryPermission?.({ mode: 'readwrite' });
  if (current !== 'granted') {
    const requested = await queryHandle.requestPermission?.({ mode: 'readwrite' });
    if (requested !== 'granted') return null;
  }
  const adapter = options.adapter ?? new BrowserFileSystemAdapter();
  const handle = adapter.register(rawDirectoryHandle, options.name ?? rawDirectoryHandle.name);
  return { adapter, handle, rawDirectoryHandle };
}

// FileSystemHandle.{queryPermission, requestPermission} は仕様化済だが lib.dom 未反映のため最小型を補う。
interface PermissionedHandle {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

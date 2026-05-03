import {
  assertSafePath,
  type FileSystemAdapter,
  type ProjectHandle,
  type WatchHandler,
} from '@scenario-studio/core';

// Tauri 用 Adapter (Rust 側 invoke 経由で OS FS にアクセス)。
//
// PoC-C 範囲: TS 側のクラス骨格・Rust 側コマンドの **シグネチャ契約** を確定。
//   実 invoke 接続と Rust 実装は **PoC-G** で完成させる。
//
// PoC-G 着手時に必要なもの:
//   - `@tauri-apps/api` を deps に追加し、`import { invoke } from '@tauri-apps/api/core'` する
//   - Rust 側 `src-tauri/src/fs.rs` で同名コマンドを実装
//   - root 絶対パスは Rust 側で保持し、TS には不透明 ID だけ返す
//
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §3.2,
//       ../../../Documentation/ScenarioEditor/16_security.md §3

type Invoke = <T>(cmd: string, args: Record<string, unknown>) => Promise<T>;

export class TauriFileSystemAdapter implements FileSystemAdapter {
  private readonly invoke: Invoke;

  constructor(invoke: Invoke) {
    this.invoke = invoke;
  }

  async list(handle: ProjectHandle, glob: string): Promise<readonly string[]> {
    return this.invoke<readonly string[]>('ss_fs_list', { handleId: handle.id, glob });
  }

  async read(handle: ProjectHandle, path: string): Promise<string> {
    assertSafePath(path);
    return this.invoke<string>('ss_fs_read', { handleId: handle.id, path });
  }

  async readBytes(handle: ProjectHandle, path: string): Promise<Uint8Array> {
    assertSafePath(path);
    const arr = await this.invoke<number[]>('ss_fs_read_bytes', { handleId: handle.id, path });
    return Uint8Array.from(arr);
  }

  async write(handle: ProjectHandle, path: string, data: string): Promise<void> {
    assertSafePath(path);
    await this.invoke('ss_fs_write', { handleId: handle.id, path, data });
  }

  async writeBytes(handle: ProjectHandle, path: string, data: Uint8Array): Promise<void> {
    assertSafePath(path);
    await this.invoke('ss_fs_write_bytes', {
      handleId: handle.id,
      path,
      data: Array.from(data),
    });
  }

  async delete(handle: ProjectHandle, path: string): Promise<void> {
    assertSafePath(path);
    await this.invoke('ss_fs_delete', { handleId: handle.id, path });
  }

  async exists(handle: ProjectHandle, path: string): Promise<boolean> {
    assertSafePath(path);
    return this.invoke<boolean>('ss_fs_exists', { handleId: handle.id, path });
  }

  /**
   * Tauri 側は `notify` クレートで OS native watcher を回し、
   * `ss_fs_changed` イベントを emit する想定。
   * PoC-G で Rust 側を書いた時点で `Window.listen('ss_fs_changed', ...)` で受ける。
   */
  watch(_handle: ProjectHandle, _onEvent: WatchHandler): () => void {
    throw new Error('TauriFileSystemAdapter#watch: PoC-G で実装予定');
  }
}

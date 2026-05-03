// テスト専用 in-memory FS アダプタ。
// 本番コードから import しない (test fixture)。
// adapter-node を core から参照すると依存方向が逆転するため、core の domain/project ロジックを
// 単体で検証する用途では本クラスを使う。

import {
  assertSafePath,
  compileGlob,
  type FileSystemAdapter,
  type ProjectHandle,
  type WatchHandler,
} from '../platform.js';

export class InMemoryFileSystemAdapter implements FileSystemAdapter {
  private readonly files = new Map<string, string | Uint8Array>(); // key: `${handleId}\0${path}`
  private nextHandle = 0;

  register(name = 'memory'): ProjectHandle {
    const id = `mem-${++this.nextHandle}`;
    return Object.freeze({ id, name });
  }

  async list(handle: ProjectHandle, glob: string): Promise<readonly string[]> {
    const matcher = compileGlob(glob);
    const prefix = `${handle.id}\0`;
    const out: string[] = [];
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const path = key.slice(prefix.length);
      if (matcher(path)) out.push(path);
    }
    return out.sort();
  }

  async read(handle: ProjectHandle, path: string): Promise<string> {
    assertSafePath(path);
    const v = this.files.get(this.key(handle, path));
    if (v === undefined) throw new Error(`Not found: ${path}`);
    return typeof v === 'string' ? v : new TextDecoder().decode(v);
  }

  async readBytes(handle: ProjectHandle, path: string): Promise<Uint8Array> {
    assertSafePath(path);
    const v = this.files.get(this.key(handle, path));
    if (v === undefined) throw new Error(`Not found: ${path}`);
    return typeof v === 'string' ? new TextEncoder().encode(v) : v;
  }

  async write(handle: ProjectHandle, path: string, data: string): Promise<void> {
    assertSafePath(path);
    this.files.set(this.key(handle, path), data);
  }

  async writeBytes(handle: ProjectHandle, path: string, data: Uint8Array): Promise<void> {
    assertSafePath(path);
    this.files.set(this.key(handle, path), new Uint8Array(data));
  }

  async delete(handle: ProjectHandle, path: string): Promise<void> {
    assertSafePath(path);
    this.files.delete(this.key(handle, path));
  }

  async exists(handle: ProjectHandle, path: string): Promise<boolean> {
    assertSafePath(path);
    return this.files.has(this.key(handle, path));
  }

  watch(_handle: ProjectHandle, _onEvent: WatchHandler): () => void {
    // テスト用なので no-op
    return () => {};
  }

  private key(handle: ProjectHandle, path: string): string {
    return `${handle.id}\0${path}`;
  }
}

import {
  assertSafePath,
  compileGlob,
  type FileSystemAdapter,
  type ProjectHandle,
  type WatchHandler,
} from '@scenario-studio/core';

// Browser 用 Adapter (FS Access API / OPFS どちらでも、FileSystemDirectoryHandle を受け取る)。
// 実装は PoC-C 範囲: read/write/list/delete/exists/watch (polling)。
// Safari / Firefox は FS Access API 未対応のため、それらは OPFS で受ける (createOpfsRoot)。
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §1, §15,
//       ../../../Documentation/ScenarioEditor/16_security.md §2

export class BrowserFileSystemAdapter implements FileSystemAdapter {
  private readonly roots = new Map<string, FileSystemDirectoryHandle>();

  /** ユーザがピッカーで選んだ FileSystemDirectoryHandle を登録して Handle を返す。 */
  register(directory: FileSystemDirectoryHandle, name: string): ProjectHandle {
    const id = crypto.randomUUID();
    this.roots.set(id, directory);
    return Object.freeze({ id, name });
  }

  async list(handle: ProjectHandle, glob: string): Promise<readonly string[]> {
    const root = this.requireRoot(handle);
    const matcher = compileGlob(glob);
    const out: string[] = [];
    await walk(root, '', out);
    return out.filter(matcher).sort();
  }

  async read(handle: ProjectHandle, path: string): Promise<string> {
    const file = await this.openFile(handle, path);
    return file.text();
  }

  async readBytes(handle: ProjectHandle, path: string): Promise<Uint8Array> {
    const file = await this.openFile(handle, path);
    return new Uint8Array(await file.arrayBuffer());
  }

  async write(handle: ProjectHandle, path: string, data: string): Promise<void> {
    const fileHandle = await this.openWritable(handle, path);
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async writeBytes(handle: ProjectHandle, path: string, data: Uint8Array): Promise<void> {
    const fileHandle = await this.openWritable(handle, path);
    const writable = await fileHandle.createWritable();
    // SharedArrayBuffer-backed view を受け取った場合の型不一致を避けるため、ArrayBuffer に複製
    await writable.write(toOwnedArrayBuffer(data));
    await writable.close();
  }

  async delete(handle: ProjectHandle, path: string): Promise<void> {
    assertSafePath(path);
    const root = this.requireRoot(handle);
    const segments = path.split('/');
    const fileName = segments[segments.length - 1];
    if (fileName === undefined) {
      throw new Error(`delete: empty path resolved no segments: ${path}`);
    }
    const dirSegments = segments.slice(0, -1);
    const dir = await getDir(root, dirSegments, false);
    if (!dir) return;
    await dir.removeEntry(fileName);
  }

  async exists(handle: ProjectHandle, path: string): Promise<boolean> {
    try {
      await this.openFile(handle, path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Browser には信頼できる recursive watch がない (FS Observer API は SSE 段階)。
   * PoC-C では polling (5 秒間隔) で list の差分を通知する単純実装。
   * 本番運用での負荷とリアクティビティのバランスは Phase 1 で再検討。
   */
  watch(handle: ProjectHandle, onEvent: WatchHandler): () => void {
    let prev = new Set<string>();
    let cancelled = false;
    void (async () => {
      const initial = await this.list(handle, '**/*');
      prev = new Set(initial);
    })();
    const interval = setInterval(() => {
      void (async () => {
        if (cancelled) return;
        const current = new Set(await this.list(handle, '**/*'));
        for (const p of current) {
          if (!prev.has(p)) onEvent({ kind: 'add', path: p });
        }
        for (const p of prev) {
          if (!current.has(p)) onEvent({ kind: 'delete', path: p });
        }
        prev = current;
      })();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }

  private requireRoot(handle: ProjectHandle): FileSystemDirectoryHandle {
    const root = this.roots.get(handle.id);
    if (!root) throw new Error(`Unknown ProjectHandle: ${handle.id}`);
    return root;
  }

  private async openFile(handle: ProjectHandle, path: string): Promise<File> {
    assertSafePath(path);
    const root = this.requireRoot(handle);
    const segments = path.split('/');
    const fileName = segments[segments.length - 1];
    if (fileName === undefined) {
      throw new Error(`openFile: empty path resolved no segments: ${path}`);
    }
    const dir = await getDir(root, segments.slice(0, -1), false);
    if (!dir) throw new Error(`File not found: ${path}`);
    const fileHandle = await dir.getFileHandle(fileName);
    return fileHandle.getFile();
  }

  private async openWritable(handle: ProjectHandle, path: string): Promise<FileSystemFileHandle> {
    assertSafePath(path);
    const root = this.requireRoot(handle);
    const segments = path.split('/');
    const fileName = segments[segments.length - 1];
    if (fileName === undefined) {
      throw new Error(`openWritable: empty path resolved no segments: ${path}`);
    }
    const dir = await getDir(root, segments.slice(0, -1), true);
    if (!dir) throw new Error(`Could not create directory for path: ${path}`);
    return dir.getFileHandle(fileName, { create: true });
  }
}

async function getDir(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle | undefined> {
  let current = root;
  for (const seg of segments) {
    try {
      current = await current.getDirectoryHandle(seg, { create });
    } catch {
      return undefined;
    }
  }
  return current;
}

// FileSystemDirectoryHandle.entries() は仕様化済だが lib.dom の型に未反映。
// 必要最小限のシグネチャを補う (実行時には標準 API が解決する)。
interface DirectoryHandleWithEntries {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

async function walk(dir: FileSystemDirectoryHandle, rel: string, out: string[]): Promise<void> {
  const iter = (dir as unknown as DirectoryHandleWithEntries).entries();
  for await (const [name, entry] of iter) {
    const sub = rel === '' ? name : `${rel}/${name}`;
    if (entry.kind === 'directory') {
      await walk(entry as FileSystemDirectoryHandle, sub, out);
    } else {
      out.push(sub);
    }
  }
}

function toOwnedArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  return buf;
}

import { readFile, writeFile, mkdir, rm, stat, readdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import * as nodePath from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  assertSafePath,
  compileGlob,
  type FileSystemAdapter,
  type ProjectHandle,
  type WatchHandler,
  type WatchEventKind,
} from '@scenario-studio/core';

// Node.js 用 Adapter (CLI / CI / scripted 環境向け)。
// `handle.id` をキーに root 絶対パスを内部で保持する (handle 自体は不透明)。
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §1, §11

export class NodeFileSystemAdapter implements FileSystemAdapter {
  private readonly roots = new Map<string, string>();

  /** 既存のプロジェクトルート (絶対パス) を Adapter に登録し、Handle を返す。 */
  register(absoluteRoot: string, name: string): ProjectHandle {
    if (!nodePath.isAbsolute(absoluteRoot)) {
      throw new Error(`register: absoluteRoot must be absolute: ${absoluteRoot}`);
    }
    const id = randomUUID();
    this.roots.set(id, absoluteRoot);
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
    const abs = this.toAbs(handle, path);
    return readFile(abs, 'utf8');
  }

  async readBytes(handle: ProjectHandle, path: string): Promise<Uint8Array> {
    const abs = this.toAbs(handle, path);
    const buf = await readFile(abs);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  async write(handle: ProjectHandle, path: string, data: string): Promise<void> {
    const abs = this.toAbs(handle, path);
    await mkdir(nodePath.dirname(abs), { recursive: true });
    await writeFile(abs, data, 'utf8');
  }

  async writeBytes(handle: ProjectHandle, path: string, data: Uint8Array): Promise<void> {
    const abs = this.toAbs(handle, path);
    await mkdir(nodePath.dirname(abs), { recursive: true });
    await writeFile(abs, data);
  }

  async delete(handle: ProjectHandle, path: string): Promise<void> {
    const abs = this.toAbs(handle, path);
    await rm(abs, { force: true, recursive: false });
  }

  async exists(handle: ProjectHandle, path: string): Promise<boolean> {
    const abs = this.toAbs(handle, path);
    try {
      await stat(abs);
      return true;
    } catch {
      return false;
    }
  }

  watch(handle: ProjectHandle, onEvent: WatchHandler): () => void {
    const root = this.requireRoot(handle);
    // Node 20+ では recursive: true が全 OS で動く (Linux は experimental だが PoC 範囲内で許容)
    const watcher = watch(root, { recursive: true }, (eventType, filename) => {
      if (filename === null) return;
      // Node の filename は OS 区切り。POSIX 化して安全パスに通す
      const posix = filename.split(nodePath.sep).join('/');
      try {
        assertSafePath(posix);
      } catch {
        return;
      }
      // fs.watch の eventType は 'rename' (add/delete) / 'change' しか出ないため kind は粗い推定
      const kind: WatchEventKind = eventType === 'change' ? 'change' : 'add';
      onEvent({ kind, path: posix });
    });
    return () => watcher.close();
  }

  private requireRoot(handle: ProjectHandle): string {
    const root = this.roots.get(handle.id);
    if (!root) throw new Error(`Unknown ProjectHandle: ${handle.id}`);
    return root;
  }

  private toAbs(handle: ProjectHandle, relative: string): string {
    assertSafePath(relative);
    const root = this.requireRoot(handle);
    return nodePath.join(root, relative);
  }
}

async function walk(root: string, rel: string, out: string[]): Promise<void> {
  const here = rel === '' ? root : nodePath.join(root, rel);
  let entries;
  try {
    entries = await readdir(here, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const sub = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(root, sub, out);
    } else if (entry.isFile()) {
      out.push(sub);
    }
  }
}

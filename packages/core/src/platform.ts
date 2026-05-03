// Adapter interfaces — concrete implementations live in adapter-* packages.
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §1, §2,
//       ../../../Documentation/ScenarioEditor/16_security.md §4.3 (path traversal)

/**
 * プロジェクトルートを示す不透明なハンドル。
 * Browser: FS Access API の FileSystemDirectoryHandle 等を adapter 内部で保持する識別子
 * Tauri: Rust 側で保持する絶対パスの ID
 * Unity: Bridge セッション ID
 * Node: 絶対パス
 *
 * ハンドルの実体は Adapter 実装が握る (`fields` / `[brand]` で保持してもよい)。
 * 呼び出し側は `id` / `name` のみ参照する。
 */
export type ProjectHandle = Readonly<{
  id: string;
  name: string;
}>;

export type WatchEventKind = 'add' | 'change' | 'delete';

export type WatchEvent = Readonly<{
  kind: WatchEventKind;
  path: string;
}>;

export type WatchHandler = (event: WatchEvent) => void;

/**
 * 3 ターゲット (Browser / Tauri / Unity) + Node (CLI/CI) で共通の FS 抽象。
 *
 * - すべての `path` は `handle` のルートからの **POSIX 相対パス** (`/` 区切り)。
 *   絶対パス・`..`・Windows ドライブレター (`C:`)・null/制御文字は拒否される (`assertSafePath`)。
 * - text I/O は UTF-8。bytes I/O は媒体 (画像/音声等) 用。
 * - `list(handle, glob)` の glob は最小サブセット: `*` (path component 内任意文字)、`**` (任意深さ)、`?` (単一文字)、ブレース・否定は未対応。
 * - `watch` は best-effort。Browser は polling、Tauri は notify、Unity は SSE。
 */
export interface FileSystemAdapter {
  list(handle: ProjectHandle, glob: string): Promise<readonly string[]>;
  read(handle: ProjectHandle, path: string): Promise<string>;
  readBytes(handle: ProjectHandle, path: string): Promise<Uint8Array>;
  write(handle: ProjectHandle, path: string, data: string): Promise<void>;
  writeBytes(handle: ProjectHandle, path: string, data: Uint8Array): Promise<void>;
  delete(handle: ProjectHandle, path: string): Promise<void>;
  exists(handle: ProjectHandle, path: string): Promise<boolean>;
  watch(handle: ProjectHandle, onEvent: WatchHandler): () => void;
}

/**
 * Path traversal / 不正パス防止。Adapter 実装の入口で全引数に対して呼ぶ。
 * 拒否例: `..`、`/abs`、`C:\foo`、空文字、null 文字含み、`\` 区切り。
 * @throws InvalidPathError
 */
export function assertSafePath(path: string): void {
  if (typeof path !== 'string' || path.length === 0) {
    throw new InvalidPathError(path, 'empty or non-string');
  }
  if (path.includes('\0')) {
    throw new InvalidPathError(path, 'null byte');
  }
  if (path.includes('\\')) {
    throw new InvalidPathError(path, 'use POSIX `/` separator');
  }
  if (path.startsWith('/')) {
    throw new InvalidPathError(path, 'absolute path');
  }
  if (/^[A-Za-z]:/.test(path)) {
    throw new InvalidPathError(path, 'Windows drive letter');
  }
  for (const segment of path.split('/')) {
    if (segment === '..') {
      throw new InvalidPathError(path, 'parent traversal `..`');
    }
    if (segment === '.') {
      throw new InvalidPathError(path, '`.` segment');
    }
    if (segment === '') {
      throw new InvalidPathError(path, 'empty segment');
    }
  }
}

export class InvalidPathError extends Error {
  constructor(
    readonly input: string,
    readonly reason: string,
  ) {
    super(`Invalid path ${JSON.stringify(input)}: ${reason}`);
    this.name = 'InvalidPathError';
  }
}

/**
 * `*` `**` `?` だけをサポートする最小 glob。外部依存を持たないために自前。
 * 範囲外パターン (ブレース/否定/extglob) は使わない方針。
 */
export function compileGlob(pattern: string): (path: string) => boolean {
  const escapeRegex = (s: string): string => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // path を分割して segment 単位で正規表現化することで `**` の扱いを自然にする
  const segments = pattern.split('/');
  const parts = segments.map((seg) => {
    if (seg === '**') return '(?:.*)';
    let re = '';
    for (const ch of seg) {
      if (ch === '*') re += '[^/]*';
      else if (ch === '?') re += '[^/]';
      else re += escapeRegex(ch);
    }
    return re;
  });
  // segment 間は `/`。ただし `**` の隣接 `/` は省略可とする (= `a/**/b` が `a/b` にも一致)
  let body = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === undefined) continue;
    if (i === 0) {
      body += part;
    } else {
      const prev = parts[i - 1];
      if (prev === '(?:.*)' || part === '(?:.*)') {
        body += '/?' + part;
      } else {
        body += '/' + part;
      }
    }
  }
  const re = new RegExp(`^${body}$`);
  return (path) => re.test(path);
}

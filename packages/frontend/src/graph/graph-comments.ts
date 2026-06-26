import { createSignal } from 'solid-js';
import {
  parseYaml,
  sanitizeYamlTree,
  stringifyYaml,
  type FileSystemAdapter,
  type ProjectHandle,
  type YamlValue,
} from '@scenario-studio/core';

// PR (ux-overhaul): グラフ canvas 上に「自由メモ / グループ注釈」を置けるようにする。
// 1 件: text + x + y + width + height + color。プロジェクト ID 単位で localStorage に保存。
// node の上で重ねて使う想定 (ノードグループの説明・メモ)。

export interface GraphComment {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS 色 (背景)。未指定はデフォルト (薄黄)。 */
  color?: string;
}

const STORAGE_PREFIX = 'scenario-studio:graph-comments:';
const COMMENTS_FILE = 'Graph/comments.yaml';

const [comments, setComments] = createSignal<readonly GraphComment[]>([]);
const [activeProjectId, setActiveProjectId] = createSignal<string | undefined>(undefined);
let activeAdapter: FileSystemAdapter | undefined;
let activeHandle: ProjectHandle | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let lastProjectPersisted: readonly GraphComment[] = [];

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

function readStorage(projectId: string): GraphComment[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is GraphComment =>
        v !== null &&
        typeof v === 'object' &&
        typeof (v as GraphComment).id === 'string' &&
        typeof (v as GraphComment).text === 'string' &&
        typeof (v as GraphComment).x === 'number' &&
        typeof (v as GraphComment).y === 'number' &&
        typeof (v as GraphComment).width === 'number' &&
        typeof (v as GraphComment).height === 'number',
    );
  } catch {
    return [];
  }
}

function writeStorage(projectId: string, list: readonly GraphComment[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
}

async function readProjectFile(
  adapter: FileSystemAdapter,
  handle: ProjectHandle,
): Promise<GraphComment[] | undefined> {
  if (!(await adapter.exists(handle, COMMENTS_FILE))) return undefined;
  const text = await adapter.read(handle, COMMENTS_FILE);
  const { value } = parseYaml(text);
  if (!isMapping(value) || !Array.isArray(value['comments'])) return [];
  return (value['comments'] as unknown[]).filter(isGraphComment);
}

async function writeProjectFile(
  adapter: FileSystemAdapter,
  handle: ProjectHandle,
  list: readonly GraphComment[],
): Promise<void> {
  const commentsYaml = list.map((c): Record<string, YamlValue> => {
    const obj: Record<string, YamlValue> = {
      id: c.id,
      text: c.text,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
    };
    if (c.color !== undefined) obj['color'] = c.color;
    return obj;
  });
  await adapter.write(
    handle,
    COMMENTS_FILE,
    stringifyYaml(sanitizeYamlTree({ schemaVersion: 1, comments: commentsYaml })),
  );
}

function scheduleProjectPersist(list: readonly GraphComment[]): void {
  if (!activeAdapter || !activeHandle) return;
  const adapter = activeAdapter;
  const handle = activeHandle;
  const snapshot = list.map((c) => ({ ...c }));
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    void writeProjectFile(adapter, handle, snapshot).then(() => {
      lastProjectPersisted = snapshot;
    });
  }, 1000);
}

function persist(): void {
  const pid = activeProjectId();
  if (pid) writeStorage(pid, comments());
  scheduleProjectPersist(comments());
}

export const GraphComments = {
  comments,

  switchProject(adapter: FileSystemAdapter, handle: ProjectHandle): void {
    activeAdapter = adapter;
    activeHandle = handle;
    setActiveProjectId(handle.id);
    const fallback = readStorage(handle.id);
    setComments(fallback);
    lastProjectPersisted = fallback;
    void (async () => {
      try {
        const loaded = await readProjectFile(adapter, handle);
        if (activeHandle?.id !== handle.id) return;
        if (loaded) {
          setComments(loaded);
          lastProjectPersisted = loaded;
          writeStorage(handle.id, loaded);
        } else if (fallback.length > 0) {
          await writeProjectFile(adapter, handle, fallback);
          lastProjectPersisted = fallback;
        }
      } catch (e) {
        console.warn('[GraphComments] failed to load project comments', e);
      }
    })();
  },

  add(at: { x: number; y: number }): GraphComment {
    const next: GraphComment = {
      id: `cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      text: '新しいメモ',
      x: at.x,
      y: at.y,
      width: 180,
      height: 80,
    };
    setComments([...comments(), next]);
    persist();
    return next;
  },

  update(
    id: string,
    patch: Partial<Omit<GraphComment, 'id'>>,
    options: { persist?: boolean } = {},
  ): void {
    setComments(comments().map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (options.persist !== false) persist();
  },

  commit(id: string): void {
    const current = comments();
    const now = current.find((c) => c.id === id);
    const prev = lastProjectPersisted.find((c) => c.id === id);
    if (!now) return;
    const moved =
      !prev ||
      Math.hypot(now.x - prev.x, now.y - prev.y) >= 8 ||
      Math.abs(now.width - prev.width) >= 8 ||
      Math.abs(now.height - prev.height) >= 8 ||
      now.text !== prev.text ||
      now.color !== prev.color;
    if (moved) persist();
  },

  remove(id: string): void {
    setComments(comments().filter((c) => c.id !== id));
    persist();
  },

  clear(): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = undefined;
    activeAdapter = undefined;
    activeHandle = undefined;
    lastProjectPersisted = [];
    setActiveProjectId(undefined);
    setComments([]);
  },
};

function isMapping(v: unknown): v is { [key: string]: YamlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isGraphComment(v: unknown): v is GraphComment {
  return (
    isMapping(v) &&
    typeof v['id'] === 'string' &&
    typeof v['text'] === 'string' &&
    typeof v['x'] === 'number' &&
    typeof v['y'] === 'number' &&
    typeof v['width'] === 'number' &&
    typeof v['height'] === 'number' &&
    (v['color'] === undefined || typeof v['color'] === 'string')
  );
}

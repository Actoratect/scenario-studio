import { createSignal } from 'solid-js';

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

const [comments, setComments] = createSignal<readonly GraphComment[]>([]);
const [activeProjectId, setActiveProjectId] = createSignal<string | undefined>(undefined);

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

function persist(): void {
  const pid = activeProjectId();
  if (pid) writeStorage(pid, comments());
}

export const GraphComments = {
  comments,

  switchProject(projectId: string): void {
    setActiveProjectId(projectId);
    setComments(readStorage(projectId));
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

  update(id: string, patch: Partial<Omit<GraphComment, 'id'>>): void {
    setComments(comments().map((c) => (c.id === id ? { ...c, ...patch } : c)));
    persist();
  },

  remove(id: string): void {
    setComments(comments().filter((c) => c.id !== id));
    persist();
  },

  clear(): void {
    setActiveProjectId(undefined);
    setComments([]);
  },
};

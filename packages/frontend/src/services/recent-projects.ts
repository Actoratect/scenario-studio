import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

// IndexedDB ベースの「最近開いたプロジェクト」レジストリ。
// FileSystemDirectoryHandle は structured clone 可能なので IDB に直接 put できる。
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §8.2,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1

const DB_NAME = 'scenario-studio';
// PR-AE: v2 で pinned: boolean を追加 (デフォルト false)。
//        既存 v1 entry には upgrade で pinned: false を埋める。
const DB_VERSION = 2;
const STORE = 'recent_projects';

interface RecentProjectsSchema extends DBSchema {
  recent_projects: {
    key: string; // クライアント生成の UUID。FS Access の handle 自体は key にできない
    value: {
      id: string;
      name: string;
      lastOpened: number;
      directoryHandle: FileSystemDirectoryHandle;
      pinned?: boolean;
    };
  };
}

export interface RecentProject {
  id: string;
  name: string;
  lastOpened: number;
  directoryHandle: FileSystemDirectoryHandle;
  pinned: boolean;
}

let dbPromise: Promise<IDBPDatabase<RecentProjectsSchema>> | undefined;

function db(): Promise<IDBPDatabase<RecentProjectsSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RecentProjectsSchema>(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'id' });
        }
        // v1 → v2: pinned: false を default として埋める (古い entry は undefined のまま読まれる)
        // 値は次回 rememberProject / setPinned 時に明示的に書き戻る。
        void oldVersion;
      },
    });
  }
  return dbPromise;
}

export async function listRecentProjects(): Promise<readonly RecentProject[]> {
  const all = await (await db()).getAll(STORE);
  // pinned が先頭、その中で / 非 pinned の中でそれぞれ lastOpened 降順
  return all
    .map((p) => ({ ...p, pinned: p.pinned === true }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastOpened - a.lastOpened;
    });
}

export async function rememberProject(project: {
  id: string;
  name: string;
  directoryHandle: FileSystemDirectoryHandle;
}): Promise<void> {
  // 既存 entry の pinned を保持して、lastOpened のみ更新
  const existing = await (await db()).get(STORE, project.id);
  await (
    await db()
  ).put(STORE, {
    id: project.id,
    name: project.name,
    lastOpened: Date.now(),
    directoryHandle: project.directoryHandle,
    pinned: existing?.pinned === true,
  });
}

export async function forgetProject(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
}

/** PR-AE: 「最近開いた」リスト内で project を pin / unpin する。 */
export async function pinProject(id: string, pinned: boolean): Promise<void> {
  const conn = await db();
  const existing = await conn.get(STORE, id);
  if (!existing) return;
  await conn.put(STORE, { ...existing, pinned });
}

/**
 * テスト用: in-memory リセット (本番では呼ばない)。
 */
export function _resetForTesting(): void {
  dbPromise = undefined;
}

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

// IndexedDB ベースの「最近開いたプロジェクト」レジストリ。
// FileSystemDirectoryHandle は structured clone 可能なので IDB に直接 put できる。
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §8.2,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1

const DB_NAME = 'scenario-studio';
const DB_VERSION = 1;
const STORE = 'recent_projects';

interface RecentProjectsSchema extends DBSchema {
  recent_projects: {
    key: string; // クライアント生成の UUID。FS Access の handle 自体は key にできない
    value: {
      id: string;
      name: string;
      lastOpened: number;
      directoryHandle: FileSystemDirectoryHandle;
    };
  };
}

export interface RecentProject {
  id: string;
  name: string;
  lastOpened: number;
  directoryHandle: FileSystemDirectoryHandle;
}

let dbPromise: Promise<IDBPDatabase<RecentProjectsSchema>> | undefined;

function db(): Promise<IDBPDatabase<RecentProjectsSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RecentProjectsSchema>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function listRecentProjects(): Promise<readonly RecentProject[]> {
  const all = await (await db()).getAll(STORE);
  return all.sort((a, b) => b.lastOpened - a.lastOpened);
}

export async function rememberProject(project: {
  id: string;
  name: string;
  directoryHandle: FileSystemDirectoryHandle;
}): Promise<void> {
  await (
    await db()
  ).put(STORE, {
    id: project.id,
    name: project.name,
    lastOpened: Date.now(),
    directoryHandle: project.directoryHandle,
  });
}

export async function forgetProject(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
}

/**
 * テスト用: in-memory リセット (本番では呼ばない)。
 */
export function _resetForTesting(): void {
  dbPromise = undefined;
}

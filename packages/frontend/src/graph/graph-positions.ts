import { createSignal } from 'solid-js';
import {
  parseYaml,
  sanitizeYamlTree,
  stringifyYaml,
  type FileSystemAdapter,
  type NodeId,
  type ProjectHandle,
  type YamlValue,
} from '@scenario-studio/core';

// グラフ canvas のノード位置をプロジェクト ID 単位で保持・永続化 (PR-C)。
// ストレージ: localStorage (プロジェクト共有が必要になったら _layout.yaml に昇格)。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §3.2

export interface NodePosition {
  x: number;
  y: number;
}

const STORAGE_PREFIX = 'scenario-studio:graph-positions:';
const POSITIONS_FILE = 'Graph/positions.yaml';

const [positions, setPositions] = createSignal<ReadonlyMap<NodeId, NodePosition>>(new Map());
const [activeProjectId, setActiveProjectId] = createSignal<string | undefined>(undefined);
let activeAdapter: FileSystemAdapter | undefined;
let activeHandle: ProjectHandle | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let lastProjectPersisted = new Map<NodeId, NodePosition>();

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

function readStorage(projectId: string): Map<NodeId, NodePosition> {
  if (typeof localStorage === 'undefined') return new Map();
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return new Map();
    const out = new Map<NodeId, NodePosition>();
    for (const [k, v] of Object.entries(parsed)) {
      if (
        v !== null &&
        typeof v === 'object' &&
        typeof (v as NodePosition).x === 'number' &&
        typeof (v as NodePosition).y === 'number'
      ) {
        out.set(k as NodeId, v as NodePosition);
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

function writeStorage(projectId: string, map: ReadonlyMap<NodeId, NodePosition>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const obj: Record<string, NodePosition> = {};
    for (const [k, v] of map) obj[k] = v;
    localStorage.setItem(storageKey(projectId), JSON.stringify(obj));
  } catch {
    /* quota / private mode */
  }
}

async function readProjectFile(
  adapter: FileSystemAdapter,
  handle: ProjectHandle,
): Promise<Map<NodeId, NodePosition> | undefined> {
  if (!(await adapter.exists(handle, POSITIONS_FILE))) return undefined;
  const text = await adapter.read(handle, POSITIONS_FILE);
  const { value } = parseYaml(text);
  if (!isMapping(value) || !isMapping(value['positions'])) return new Map();
  const out = new Map<NodeId, NodePosition>();
  for (const [id, raw] of Object.entries(value['positions'])) {
    if (!isMapping(raw)) continue;
    const x = raw['x'];
    const y = raw['y'];
    if (typeof x === 'number' && typeof y === 'number') out.set(id as NodeId, { x, y });
  }
  return out;
}

async function writeProjectFile(
  adapter: FileSystemAdapter,
  handle: ProjectHandle,
  map: ReadonlyMap<NodeId, NodePosition>,
): Promise<void> {
  const obj: Record<string, YamlValue> = {};
  for (const [id, p] of map) obj[id] = { x: p.x, y: p.y };
  await adapter.write(
    handle,
    POSITIONS_FILE,
    stringifyYaml(sanitizeYamlTree({ schemaVersion: 1, positions: obj })),
  );
}

function scheduleProjectPersist(map: ReadonlyMap<NodeId, NodePosition>): void {
  if (!activeAdapter || !activeHandle) return;
  const adapter = activeAdapter;
  const handle = activeHandle;
  const snapshot = new Map(map);
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    void writeProjectFile(adapter, handle, snapshot).then(() => {
      lastProjectPersisted = new Map(snapshot);
    });
  }, 1000);
}

function movedEnough(a: NodePosition | undefined, b: NodePosition, threshold = 8): boolean {
  if (!a) return true;
  return Math.hypot(a.x - b.x, a.y - b.y) >= threshold;
}

function hasMeaningfulProjectChange(map: ReadonlyMap<NodeId, NodePosition>): boolean {
  if (map.size !== lastProjectPersisted.size) return true;
  for (const [id, p] of map) {
    if (movedEnough(lastProjectPersisted.get(id), p)) return true;
  }
  return false;
}

export const GraphPositions = {
  positions,
  /** プロジェクト切替時に呼ぶ。stored 位置を読み込む。 */
  switchProject(adapter: FileSystemAdapter, handle: ProjectHandle): void {
    activeAdapter = adapter;
    activeHandle = handle;
    setActiveProjectId(handle.id);
    const fallback = readStorage(handle.id);
    setPositions(fallback);
    lastProjectPersisted = new Map(fallback);
    void (async () => {
      try {
        const loaded = await readProjectFile(adapter, handle);
        if (activeHandle?.id !== handle.id) return;
        if (loaded) {
          setPositions(loaded);
          lastProjectPersisted = new Map(loaded);
          writeStorage(handle.id, loaded);
        } else if (fallback.size > 0) {
          await writeProjectFile(adapter, handle, fallback);
          lastProjectPersisted = new Map(fallback);
        }
      } catch (e) {
        console.warn('[GraphPositions] failed to load project positions', e);
      }
    })();
  },
  /** ドラッグ中の位置を更新する。persist=false なら画面だけ更新する。 */
  setPosition(id: NodeId, p: NodePosition, options: { persist?: boolean } = {}): void {
    const next = new Map(positions());
    const prev = next.get(id);
    if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 0.5) return;
    next.set(id, p);
    setPositions(next);
    const pid = activeProjectId();
    if (pid) writeStorage(pid, next);
    if (options.persist === false) return;
    if (hasMeaningfulProjectChange(next)) scheduleProjectPersist(next);
  },
  /** ドラッグ完了時に、意味のある移動だけプロジェクトファイルへ保存する。 */
  commitPosition(id: NodeId, p: NodePosition): void {
    GraphPositions.setPosition(id, p, { persist: false });
    const next = new Map(positions());
    if (movedEnough(lastProjectPersisted.get(id), p)) scheduleProjectPersist(next);
  },
  /** 既知の id を引く。無ければ undefined。 */
  get(id: NodeId): NodePosition | undefined {
    return positions().get(id);
  },
  /** プロジェクトを閉じた時のクリーンアップ (localStorage は残す)。 */
  clear(): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = undefined;
    activeAdapter = undefined;
    activeHandle = undefined;
    lastProjectPersisted = new Map();
    setActiveProjectId(undefined);
    setPositions(new Map());
  },
};

function isMapping(v: unknown): v is { [key: string]: YamlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

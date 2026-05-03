import { createSignal } from 'solid-js';
import type { NodeId } from '@scenario-studio/core';

// グラフ canvas のノード位置をプロジェクト ID 単位で保持・永続化 (PR-C)。
// ストレージ: localStorage (プロジェクト共有が必要になったら _layout.yaml に昇格)。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §3.2

export interface NodePosition {
  x: number;
  y: number;
}

const STORAGE_PREFIX = 'scenario-studio:graph-positions:';

const [positions, setPositions] = createSignal<ReadonlyMap<NodeId, NodePosition>>(new Map());
const [activeProjectId, setActiveProjectId] = createSignal<string | undefined>(undefined);

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

export const GraphPositions = {
  positions,
  /** プロジェクト切替時に呼ぶ。stored 位置を読み込む。 */
  switchProject(projectId: string): void {
    setActiveProjectId(projectId);
    setPositions(readStorage(projectId));
  },
  /** ドラッグ完了時に呼ぶ。1 ノードの位置を更新 + 永続化。 */
  setPosition(id: NodeId, p: NodePosition): void {
    const next = new Map(positions());
    next.set(id, p);
    setPositions(next);
    const pid = activeProjectId();
    if (pid) writeStorage(pid, next);
  },
  /** 既知の id を引く。無ければ undefined。 */
  get(id: NodeId): NodePosition | undefined {
    return positions().get(id);
  },
  /** プロジェクトを閉じた時のクリーンアップ (localStorage は残す)。 */
  clear(): void {
    setActiveProjectId(undefined);
    setPositions(new Map());
  },
};

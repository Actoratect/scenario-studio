import { NodeFieldStore } from './NodeFieldStore.js';
import type { NodeId } from '../domain/era.js';
import type { ScenarioNode } from '../domain/node.js';

// ProjectModel 全体のローカル履歴。per-node NodeFieldStore を保有し、
// global undo / redo (LIFO) は「最後に編集されたノード」の store に委譲する。
//
// MVP の挙動:
//   - 編集の time-order を記録 (lastEditedNode + history of editedNodes)
//   - undo() は最後に編集したノードの store.undo() を呼ぶ
//   - redo() は逆方向のスタックを使う
//
// この戦略は Phase 1 の要件 (1 ノード単位の編集 → ノード単位の undo) を満たし、
// 将来の Command スタック ベース global undo (12_architecture.md §6.1) に切替可能。
//
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §5.3, §6.1,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M2

export class ProjectHistory {
  private readonly stores = new Map<NodeId, NodeFieldStore>();
  /** 直近に編集された node ID の LIFO。 undo() で参照。 */
  private readonly undoStack: NodeId[] = [];
  /** undo() で消化したものを退避し、redo() で巻き戻す LIFO。 */
  private readonly redoStack: NodeId[] = [];

  /**
   * ノードを history 管理下に登録 (load 時に呼ぶ)。
   * 既に登録済の id を再登録すると、既存 store は destroy されない (新規作成しない)。
   */
  register(node: ScenarioNode): NodeFieldStore {
    const existing = this.stores.get(node.id);
    if (existing) return existing;
    const store = new NodeFieldStore(node.fields);
    this.stores.set(node.id, store);
    // local 編集 (origin=local) で undoStack に push
    store.observe((event) => {
      if (event.origin !== NodeFieldStore.REMOTE_ORIGIN) {
        this.undoStack.push(node.id);
        this.redoStack.length = 0; // 新しい編集が来たら redo は破棄
      }
    });
    return store;
  }

  /** ノード単位の store を取得 (Inspector が直接 set/delete したい時)。 */
  get(id: NodeId): NodeFieldStore | undefined {
    return this.stores.get(id);
  }

  /** 登録解除 + 内部 store を destroy。ノード削除時に呼ぶ。 */
  unregister(id: NodeId): void {
    const s = this.stores.get(id);
    if (s) {
      s.destroy();
      this.stores.delete(id);
    }
    // stack からは削除しない (undo すると消えるだけ — silent skip)
  }

  /**
   * 全 store を解放。プロジェクトを閉じる時。
   */
  destroy(): void {
    for (const s of this.stores.values()) s.destroy();
    this.stores.clear();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  /**
   * 最後に編集されたノードの 1 step を巻き戻す。
   * 該当ノードが既に削除されていたら次のスタックトップを試す。
   * 何も undo できなければ false。
   */
  undo(): boolean {
    while (this.undoStack.length > 0) {
      const id = this.undoStack.pop()!;
      const store = this.stores.get(id);
      if (!store) continue;
      if (store.undo()) {
        this.redoStack.push(id);
        return true;
      }
    }
    return false;
  }

  redo(): boolean {
    while (this.redoStack.length > 0) {
      const id = this.redoStack.pop()!;
      const store = this.stores.get(id);
      if (!store) continue;
      if (store.redo()) {
        this.undoStack.push(id);
        return true;
      }
    }
    return false;
  }

  /** UI の「履歴サイズ」表示などに使えるカウント。 */
  get pendingUndo(): number {
    return this.undoStack.length;
  }

  get pendingRedo(): number {
    return this.redoStack.length;
  }
}

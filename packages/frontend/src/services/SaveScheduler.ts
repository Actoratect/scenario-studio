import type { NodeId } from '@scenario-studio/core';

// 編集 → 永続化の 500ms デバウンス engine。
// 各 NodeId ごとに独立タイマー (= 1 ノードの編集中に他ノードが flush されない)。
// 12_architecture.md §9.1 「自動保存遅延 500ms」目標を実装。
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §9.1, §4.3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M3

export type SaveFlushHandler = (nodeId: NodeId) => Promise<void> | void;

export interface SaveSchedulerOptions {
  /** debounce 時間 (ms)。default 500ms。 */
  debounceMs?: number;
  /** flush 関数。失敗しても scheduler は止めない (例外は上位 EventBus へ)。 */
  flush: SaveFlushHandler;
  /** flush 失敗時の通知。デフォルトは console.error。 */
  onError?: (nodeId: NodeId, error: unknown) => void;
}

export class SaveScheduler {
  private readonly timers = new Map<NodeId, ReturnType<typeof setTimeout>>();
  private readonly debounceMs: number;
  private readonly flush: SaveFlushHandler;
  private readonly onError: (nodeId: NodeId, error: unknown) => void;

  constructor(options: SaveSchedulerOptions) {
    this.debounceMs = options.debounceMs ?? 500;
    this.flush = options.flush;
    this.onError = options.onError ?? ((id, e) => console.error(`save failed for ${id}`, e));
  }

  /** ノード変更を通知。debounce 後に flush() が呼ばれる。 */
  schedule(nodeId: NodeId): void {
    const existing = this.timers.get(nodeId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.timers.delete(nodeId);
      try {
        const result = this.flush(nodeId);
        if (result instanceof Promise) {
          result.catch((e: unknown) => this.onError(nodeId, e));
        }
      } catch (e) {
        this.onError(nodeId, e);
      }
    }, this.debounceMs);
    this.timers.set(nodeId, t);
  }

  /** 特定ノードの pending を即時 flush (例: フォーカスを外した瞬間に "失わない" 保証)。 */
  flushNow(nodeId: NodeId): void {
    const t = this.timers.get(nodeId);
    if (!t) return;
    clearTimeout(t);
    this.timers.delete(nodeId);
    try {
      const result = this.flush(nodeId);
      if (result instanceof Promise) {
        result.catch((e: unknown) => this.onError(nodeId, e));
      }
    } catch (e) {
      this.onError(nodeId, e);
    }
  }

  /** 全 pending を即時 flush (project close / Ctrl+S)。 */
  flushAll(): void {
    for (const id of Array.from(this.timers.keys())) {
      this.flushNow(id);
    }
  }

  /** 全タイマー破棄 (project close 時に flushAll の後で呼ぶ)。 */
  destroy(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  get pendingCount(): number {
    return this.timers.size;
  }
}

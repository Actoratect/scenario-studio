import type { NodeId } from '@scenario-studio/core';

// 編集 → 永続化のスケジューラ。
// PR (ux-overhaul): 自動保存を廃止し、明示的な「保存ボタン」運用に切替。
//   schedule() は dirty マークだけし、flush は flushAll() / flushNow() の明示呼び出し時のみ。
//   debounceMs は廃止 (互換のため interface には残す)。
//   詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §9.1, §4.3

export type SaveFlushHandler = (nodeId: NodeId) => Promise<void> | void;

export interface SaveSchedulerOptions {
  /** legacy 互換のため受け取るが PR (ux-overhaul) 後は無視される。 */
  debounceMs?: number;
  /** flush 関数。失敗しても scheduler は止めない (例外は上位 EventBus へ)。 */
  flush: SaveFlushHandler;
  /** flush 失敗時の通知。デフォルトは console.error。 */
  onError?: (nodeId: NodeId, error: unknown) => void;
}

export class SaveScheduler {
  private readonly dirtyIds = new Set<NodeId>();
  private readonly flush: SaveFlushHandler;
  private readonly onError: (nodeId: NodeId, error: unknown) => void;

  constructor(options: SaveSchedulerOptions) {
    void options.debounceMs;
    this.flush = options.flush;
    this.onError = options.onError ?? ((id, e) => console.error(`save failed for ${id}`, e));
  }

  /** ノード変更を通知。dirty に積むだけ。flush は明示呼び出しが必要。 */
  schedule(nodeId: NodeId): void {
    this.dirtyIds.add(nodeId);
  }

  /** 特定ノードの pending を即時 flush。失敗しても dirty には残す (再試行可能に)。 */
  flushNow(nodeId: NodeId): void {
    if (!this.dirtyIds.has(nodeId)) return;
    try {
      const result = this.flush(nodeId);
      if (result instanceof Promise) {
        result
          .then(() => {
            this.dirtyIds.delete(nodeId);
          })
          .catch((e: unknown) => this.onError(nodeId, e));
      } else {
        this.dirtyIds.delete(nodeId);
      }
    } catch (e) {
      this.onError(nodeId, e);
    }
  }

  /** 全 dirty を flush (Cmd+S / 保存ボタン)。失敗した key は dirty に残る。 */
  flushAll(): void {
    for (const id of Array.from(this.dirtyIds)) {
      this.flushNow(id);
    }
  }

  /** 全 dirty を flush し、Promise として完了を待てる版。 */
  async flushAllAsync(): Promise<void> {
    const ids = [...this.dirtyIds];
    for (const id of ids) {
      try {
        await this.flush(id);
        this.dirtyIds.delete(id);
      } catch (e) {
        this.onError(id, e);
      }
    }
  }

  /** project close 時 — dirty を捨てる (flush 済みの想定)。 */
  destroy(): void {
    this.dirtyIds.clear();
  }

  get pendingCount(): number {
    return this.dirtyIds.size;
  }

  /** 現時点で dirty な NodeId 一覧 (UI 表示用)。 */
  pendingIds(): readonly NodeId[] {
    return [...this.dirtyIds];
  }
}

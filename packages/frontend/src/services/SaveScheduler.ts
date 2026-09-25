import type { NodeId } from '@scenario-studio/core';
import { createSignal } from 'solid-js';

// 編集 → 永続化のスケジューラ。
// PR (ux-overhaul): 自動保存を廃止し、明示的な「保存ボタン」運用に切替。
//   schedule() は dirty マークだけし、flush は flushAll() / flushNow() の明示呼び出し時のみ。
//   debounceMs は廃止 (互換のため interface には残す)。
//   詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §9.1, §4.3

/**
 * flush 関数の戻り値。'skipped' は「意図的に書き込まなかった」(競合で外部変更を温存した等)
 * ことを示し、dirty を解除せず残す。void / undefined は成功扱い。
 */
export type SaveFlushResult = void | 'skipped';

export type SaveFlushHandler = (nodeId: NodeId) => Promise<SaveFlushResult> | SaveFlushResult;

export interface SaveFlushSummary {
  saved: number;
  failed: number;
  /** 競合温存等で書かなかった件数。dirty のまま残っている。 */
  skipped: number;
  errors: string[];
}

export interface SaveSchedulerOptions {
  /** legacy 互換のため受け取るが PR (ux-overhaul) 後は無視される。 */
  debounceMs?: number;
  /** flush 関数。失敗しても scheduler は止めない (例外は上位 EventBus へ)。 */
  flush: SaveFlushHandler;
  /** flush 失敗時の通知。デフォルトは console.error。 */
  onError?: (nodeId: NodeId, error: unknown) => void;
}

export class SaveScheduler {
  private readonly dirtyIds = new Map<NodeId, number>();
  private readonly inflight = new Map<NodeId, Promise<SaveFlushResult>>();
  private revision = 0;
  private readonly readChange: () => number;
  private readonly touch: () => void;
  private readonly flush: SaveFlushHandler;
  private readonly onError: (nodeId: NodeId, error: unknown) => void;

  constructor(options: SaveSchedulerOptions) {
    const [change, setChange] = createSignal(0);
    this.readChange = change;
    this.touch = () => {
      setChange((value) => value + 1);
    };
    void options.debounceMs;
    this.flush = options.flush;
    this.onError = options.onError ?? ((id, e) => console.error(`save failed for ${id}`, e));
  }

  /** ノード変更を通知。dirty に積むだけ。flush は明示呼び出しが必要。 */
  schedule(nodeId: NodeId): void {
    this.dirtyIds.set(nodeId, ++this.revision);
    this.touch();
  }

  /** 同じノードへの重複書き込みをまとめ、保存開始後に追加された変更を残す。 */
  private flushPending(nodeId: NodeId): SaveFlushResult | Promise<SaveFlushResult> {
    const running = this.inflight.get(nodeId);
    if (running) return running;
    const revision = this.dirtyIds.get(nodeId);
    const finish = (result: SaveFlushResult): SaveFlushResult => {
      if (result !== 'skipped' && this.dirtyIds.get(nodeId) === revision) {
        this.dirtyIds.delete(nodeId);
        this.touch();
      }
      return result;
    };
    const result = this.flush(nodeId);
    if (!(result instanceof Promise)) return finish(result);
    const pending = result.then(finish).finally(() => {
      if (this.inflight.get(nodeId) === pending) this.inflight.delete(nodeId);
    });
    this.inflight.set(nodeId, pending);
    return pending;
  }

  /** 特定ノードの pending を即時 flush。失敗 / skip 時は dirty に残す (再試行可能に)。 */
  flushNow(nodeId: NodeId): void {
    if (!this.dirtyIds.has(nodeId)) return;
    try {
      const result = this.flushPending(nodeId);
      if (result instanceof Promise) {
        void result.catch((e: unknown) => this.onError(nodeId, e));
      }
    } catch (e) {
      this.onError(nodeId, e);
    }
  }

  /** 全 dirty を flush (Cmd+S / 保存ボタン)。失敗した key は dirty に残る。 */
  flushAll(): void {
    for (const id of this.dirtyIds.keys()) {
      this.flushNow(id);
    }
  }

  /**
   * 全 dirty を flush し、結果 (成功 / 失敗 / skip) を集計して返す版。
   * Cmd+S からはこちらを await して「保存しました」を実際の書込完了後に出す。
   * 失敗 / skip した id は dirty に残る (次の保存で再試行できる)。
   */
  async flushAllAsync(): Promise<SaveFlushSummary> {
    const ids = [...this.dirtyIds.keys()];
    const summary: SaveFlushSummary = { saved: 0, failed: 0, skipped: 0, errors: [] };
    for (const id of ids) {
      try {
        if (!this.dirtyIds.has(id)) continue;
        const result = await this.flushPending(id);
        if (result === 'skipped') {
          summary.skipped += 1;
          continue;
        }
        summary.saved += 1;
      } catch (e) {
        summary.failed += 1;
        summary.errors.push(e instanceof Error ? e.message : String(e));
        this.onError(id, e);
      }
    }
    return summary;
  }

  /** project close 時 — dirty を捨てる (flush 済みの想定)。 */
  destroy(): void {
    this.dirtyIds.clear();
    this.touch();
  }

  get pendingCount(): number {
    this.readChange();
    return this.dirtyIds.size;
  }

  /** 現時点で dirty な NodeId 一覧 (UI 表示用)。 */
  pendingIds(): readonly NodeId[] {
    this.readChange();
    return [...this.dirtyIds.keys()];
  }
}

import { SaveStatus } from '../services/SaveStatus';
import { Toast } from '../services/Toast';
import { createSignal, type Accessor, type Setter } from 'solid-js';

/** グラフ補助ファイルの遅延保存。失敗分を保持し、保存中の新しい変更も順番に書く。 */
export class GraphPersistence {
  private readonly revision: Accessor<number>;
  private readonly setRevision: Setter<number>;
  constructor() {
    const [revision, setRevision] = createSignal(0);
    this.revision = revision;
    this.setRevision = setRevision;
  }
  private pending = new Map<string, () => Promise<void>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<{ saved: number; failed: number }> | undefined;
  private generation = 0;

  /** 明示的な破棄。開始済みI/Oは止められないが、未開始分と失敗の再試行は除く。 */
  discardPending(): void {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
    this.setRevision((value) => value + 1);
  }

  schedule(key: string, write: () => Promise<void>, immediate = false): void {
    this.pending.set(key, write);
    this.setRevision((value) => value + 1);
    SaveStatus.markPending();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (immediate) void this.flushPending();
    else this.timer = setTimeout(() => void this.flushPending(), 1000);
  }

  hasPending(): boolean {
    this.revision();
    return this.pending.size > 0 || this.running !== undefined;
  }

  async flushPending(): Promise<{ saved: number; failed: number }> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running) return this.running;
    const work = async (): Promise<{ saved: number; failed: number }> => {
      const result = { saved: 0, failed: 0 };
      const failedKeys = new Set<string>();
      while ([...this.pending.keys()].some((key) => !failedKeys.has(key))) {
        const item = [...this.pending.entries()].find(([key]) => !failedKeys.has(key));
        if (!item) break;
        const [key, write] = item;
        const generation = this.generation;
        this.pending.delete(key);
        const token = SaveStatus.beginSave();
        try {
          await write();
          result.saved += 1;
          SaveStatus.endSave(token);
        } catch (error) {
          if (this.generation !== generation) {
            SaveStatus.endSave(token);
            continue;
          }
          if (this.generation === generation && !this.pending.has(key))
            this.pending.set(key, write);
          failedKeys.add(key);
          result.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          SaveStatus.failSave(token, message);
          Toast.error(`グラフの保存に失敗しました: ${message}`, 7000);
        }
      }
      return result;
    };
    this.running = work();
    try {
      return await this.running;
    } finally {
      this.running = undefined;
      this.setRevision((value) => value + 1);
    }
  }
}

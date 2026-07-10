import { createSignal } from 'solid-js';

// PR (ux-overhaul): 「保存ボタンで明示的に保存する」運用への切り替えに伴って導入。
//
// 編集 (Inspector / Script / 他) は即座に file 書き込みするのではなく、
// このトラッカーに「どの key (= file path) が dirty か」と「いま flush するなら呼ぶ saveFn」を
// 登録する。Cmd+S またはヘッダの保存ボタンで全 dirty を flush する。
//
// NodeRepository.save() ベースの SaveScheduler とは別系統 (Scene 脚本のように
// NodeId に紐づかないファイルも追跡できるようにするため)。SaveScheduler は manual mode に
// 切り替えて、こちらの flushAll() と並走する。

/**
 * saveFn の戻り値。'skipped' は「意図的に書き込まなかった」(競合で外部変更を温存した等)
 * ことを示し、flushAll は dirty を解除せず残す。void / undefined は成功扱い。
 */
export type SaveResult = void | 'skipped';

export interface DirtyEntry {
  /** 一意キー (ファイル相対パス推奨)。 */
  key: string;
  /** UI 表示用 (Toast やバッジ用)。 */
  label: string;
  /** flush 時に呼ぶ。失敗したら throw、書かずに終えたら 'skipped' を返す。 */
  saveFn: () => Promise<SaveResult> | SaveResult;
}

const [dirty, setDirty] = createSignal<ReadonlyMap<string, DirtyEntry>>(new Map());

export const DirtyTracker = {
  dirty,

  count(): number {
    return dirty().size;
  },

  isDirty(): boolean {
    return dirty().size > 0;
  },

  /** key の編集を記録。saveFn は最新版で上書き (毎回最新 closure を渡すこと)。 */
  mark(entry: DirtyEntry): void {
    const next = new Map(dirty());
    next.set(entry.key, entry);
    setDirty(next);
  },

  /** key の dirty を解除 (= 保存に成功した時に呼ぶ)。 */
  clear(key: string): void {
    if (!dirty().has(key)) return;
    const next = new Map(dirty());
    next.delete(key);
    setDirty(next);
  },

  /** 全 dirty を順に flush。失敗 / skip した key は dirty に残す (次の保存で再試行可)。 */
  async flushAll(): Promise<{
    saved: number;
    failed: number;
    skipped: number;
    errors: string[];
  }> {
    const entries = [...dirty().values()];
    let saved = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const entry of entries) {
      try {
        const result = await entry.saveFn();
        if (result === 'skipped') {
          // 意図的に書かなかった (競合温存等)。dirty のまま残す。
          skipped++;
          continue;
        }
        DirtyTracker.clear(entry.key);
        saved++;
      } catch (e) {
        failed++;
        errors.push(`${entry.label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { saved, failed, skipped, errors };
  },

  /** プロジェクト close 時の reset。 */
  reset(): void {
    setDirty(new Map());
  },
};

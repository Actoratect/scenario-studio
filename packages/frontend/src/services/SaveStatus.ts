import { createSignal } from 'solid-js';

// プロジェクト全体の自動保存ステータス (PR-D)。
// SaveScheduler の lifecycle event を集約して reactive signal で公開し、
// Workspace header の StatusPill / Inspector の保存表示に流す。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface SaveSnapshot {
  state: SaveState;
  /** 最後に状態が変わった時刻 (ms epoch)。 */
  changedAt: number;
  /** debounce 待ち / 進行中の総数。 */
  inflight: number;
  /** 直近のエラーメッセージ (state=error の時のみ意味あり)。 */
  lastError?: string;
}

const INITIAL: SaveSnapshot = { state: 'idle', changedAt: Date.now(), inflight: 0 };

const [snapshot, setSnapshot] = createSignal<SaveSnapshot>(INITIAL);

let inflight = 0;

function update(patch: Partial<SaveSnapshot>): void {
  setSnapshot({ ...snapshot(), ...patch, changedAt: Date.now(), inflight });
}

export const SaveStatus = {
  snapshot,

  /** Scheduler が schedule() を受けた時に呼ぶ。debounce 待ち開始。 */
  markPending(): void {
    inflight++;
    update({ state: 'pending' });
  },
  /** flush() 開始時に呼ぶ。 */
  markSaving(): void {
    update({ state: 'saving' });
  },
  /** flush() 成功時に呼ぶ。inflight が 0 になったら 'saved' に遷移。 */
  markSaved(): void {
    inflight = Math.max(0, inflight - 1);
    if (inflight === 0) {
      update({ state: 'saved' });
    } else {
      update({ state: 'saving' });
    }
  },
  /** flush() 失敗時に呼ぶ。inflight は 1 減らす (再試行は呼び側責任)。 */
  markError(message: string): void {
    inflight = Math.max(0, inflight - 1);
    update({ state: 'error', lastError: message });
  },
  /** プロジェクトを閉じた時にリセット。 */
  reset(): void {
    inflight = 0;
    setSnapshot(INITIAL);
  },
};

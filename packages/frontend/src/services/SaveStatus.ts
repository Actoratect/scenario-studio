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

// 進行中の保存操作を token 集合で管理する。begin↔end/fail/skip を必ずペアにすることで、
// 「schedule のたびに inflight++」「競合スキップで markPending を追加」といった旧実装の
// 収支不均衡 (保存後も 'saving' のまま固まる / idle に戻れない) を構造的に防ぐ。
const active = new Set<number>();
let nextToken = 1;
// 未保存の変更が積まれているか (schedule / debounce 開始で true、保存完了で false)。
let pending = false;
let lastError: string | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function clearIdleTimer(): void {
  if (!idleTimer) return;
  clearTimeout(idleTimer);
  idleTimer = undefined;
}

function publish(state: SaveState): void {
  setSnapshot({
    state,
    changedAt: Date.now(),
    inflight: active.size,
    ...(state === 'error' && lastError ? { lastError } : {}),
  });
}

function scheduleIdleReset(): void {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    if (active.size === 0 && !pending && snapshot().state === 'saved') {
      setSnapshot({ ...INITIAL, changedAt: Date.now() });
    }
  }, 1800);
}

export const SaveStatus = {
  snapshot,

  /** 未保存の変更が積まれた時に呼ぶ (schedule / debounce 待ち開始)。冪等。 */
  markPending(): void {
    clearIdleTimer();
    pending = true;
    if (active.size === 0) publish('pending');
  },
  /** 1 回の保存操作の開始。返り値の token を end / fail / skip に渡す。 */
  beginSave(): number {
    clearIdleTimer();
    const token = nextToken++;
    active.add(token);
    // この保存で現在の dirty を処理する想定。完了するまで pending を倒しておく。
    pending = false;
    publish('saving');
    return token;
  },
  /** 保存成功時に呼ぶ。全 token が閉じたら 'saved' に遷移。 */
  endSave(token: number): void {
    if (!active.delete(token)) return;
    if (active.size > 0) {
      publish('saving');
      return;
    }
    // 保存中に新たな編集が入っていれば pending を維持する。
    publish(pending ? 'pending' : 'saved');
    if (!pending) scheduleIdleReset();
  },
  /** 保存失敗時に呼ぶ (再試行は呼び側責任)。 */
  failSave(token: number, message: string): void {
    if (!active.delete(token)) return;
    lastError = message;
    clearIdleTimer();
    publish('error');
  },
  /** 書き込みせず操作終了 (競合スキップ等)。変更は dirty のまま残す。 */
  skipSave(token: number): void {
    if (!active.delete(token)) return;
    pending = true;
    publish(active.size > 0 ? 'saving' : 'pending');
  },
  /** プロジェクトを閉じた時にリセット。 */
  reset(): void {
    clearIdleTimer();
    active.clear();
    pending = false;
    lastError = undefined;
    setSnapshot(INITIAL);
  },
};

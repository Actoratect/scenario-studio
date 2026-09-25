import { createSignal } from 'solid-js';

// Toast 通知 service (PR-D)。
// グローバル mute UI: window.alert / console.error の置換。CUDO 配色 + アイコン + テキスト の 3 重表現。
// 詳細: ../../../../Documentation/ScenarioEditor/16_security.md (UX),
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: string;
  /** ms after which the toast is auto-removed. 0 = sticky. */
  ttlMs: number;
  createdAt: number;
  /** 退場アニメーション中 (ui-motion)。true の間だけ DOM に残り、その後除去。 */
  leaving?: boolean;
}

const DEFAULT_TTL: Record<ToastKind, number> = {
  info: 4000,
  success: 3000,
  warning: 6000,
  error: 0, // エラーは sticky — ユーザが読んで dismiss
};

// 退場アニメーション (styles.css の ss-toast-out) を流し切ってから除去するまでの時間。
// --ss-dur-2 (140ms) と同期。多少ずれても forwards fill で見た目は破綻しない。
const LEAVE_MS = 140;

const [toasts, setToasts] = createSignal<readonly ToastEntry[]>([]);
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const leaveTimers = new Map<number, ReturnType<typeof setTimeout>>();

function push(kind: ToastKind, message: string, ttlMs?: number): number {
  const id = nextId++;
  const ttl = ttlMs ?? DEFAULT_TTL[kind];
  const entry: ToastEntry = {
    id,
    kind,
    message,
    ttlMs: ttl,
    createdAt: Date.now(),
  };
  setToasts([...toasts(), entry]);
  if (ttl > 0) {
    const t = setTimeout(() => dismiss(id), ttl);
    timers.set(id, t);
  }
  return id;
}

function dismiss(id: number): void {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  // 2 段階除去: まず leaving を立てて退場アニメを流し、完了後に配列から外す。
  // 既に退場中なら何もしない (close 連打 / TTL と手動 dismiss の競合)。
  const entry = toasts().find((t) => t.id === id);
  if (!entry || entry.leaving) return;
  setToasts(toasts().map((t) => (t.id === id ? { ...t, leaving: true } : t)));
  const lt = setTimeout(() => {
    leaveTimers.delete(id);
    setToasts(toasts().filter((t) => t.id !== id));
  }, LEAVE_MS);
  leaveTimers.set(id, lt);
}

export const Toast = {
  toasts,
  info(message: string, ttlMs?: number): number {
    return push('info', message, ttlMs);
  },
  success(message: string, ttlMs?: number): number {
    return push('success', message, ttlMs);
  },
  warning(message: string, ttlMs?: number): number {
    return push('warning', message, ttlMs);
  },
  error(message: string, ttlMs?: number): number {
    return push('error', message, ttlMs);
  },
  dismiss(id: number): void {
    dismiss(id);
  },
  /** テスト用: 全トースト即時削除 (退場アニメは流さない)。 */
  clear(): void {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    for (const t of leaveTimers.values()) clearTimeout(t);
    leaveTimers.clear();
    setToasts([]);
  },
};

import { For } from 'solid-js';
import type { Component } from 'solid-js';
import { Toast } from '../services/Toast';
import type { ToastKind } from '../services/Toast';

// Toast 表示コンポーネント。App ルートで 1 度だけ render。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

const ICON: Record<ToastKind, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '⛔',
};

export const Toaster: Component = () => {
  return (
    <div class="ss-toaster" role="region" aria-live="polite" aria-label="通知">
      <For each={Toast.toasts()}>
        {(t) => (
          <div class="ss-toast" data-kind={t.kind} role="status">
            <span class="ss-toast-icon" aria-hidden="true">
              {ICON[t.kind]}
            </span>
            <span class="ss-toast-message">{t.message}</span>
            <button
              class="ss-toast-close"
              type="button"
              onClick={() => Toast.dismiss(t.id)}
              title="閉じる"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        )}
      </For>
    </div>
  );
};

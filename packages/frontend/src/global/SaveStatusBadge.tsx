import { Show } from 'solid-js';
import type { Component } from 'solid-js';
import { SaveStatus } from '../services/SaveStatus';

// Workspace header に置く保存ステータスのトースト型バッジ (PR-D)。
// 色 + アイコン + 文字 + 進捗バー で「いま保存されているか」を伝える。
// 保存モデルは明示保存 (Ctrl/Cmd+S)。pending は「未保存の変更が積まれている」状態で
// 自動 flush は走らないため、文言でも「未保存 (Ctrl+S)」と手動保存を促す。
// (プロットボードのみ debounce 自動保存で、その間は saving を共有表示する)
// error は role=alert/aria-live=assertive で即時読み上げる。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

const ICON = {
  idle: '·',
  pending: '○',
  saving: '⟳',
  saved: '✓',
  error: '⛔',
} as const;

const TEXT = {
  idle: '待機',
  pending: '未保存 (Ctrl+S)',
  saving: '保存中',
  saved: '保存済',
  error: 'エラー',
} as const;

export const SaveStatusBadge: Component = () => {
  const state = (): keyof typeof ICON => SaveStatus.snapshot().state;
  return (
    <Show when={state() !== 'idle'}>
      <div
        class="ss-save-async-toast"
        data-state={state()}
        role={state() === 'error' ? 'alert' : 'status'}
        aria-live={state() === 'error' ? 'assertive' : 'polite'}
      >
        <div class="ss-save-async-row">
          <span class="ss-save-async-kicker">保存状態</span>
          <span aria-hidden="true">{ICON[state()]}</span>
          <span>{TEXT[state()]}</span>
        </div>
        <div class="ss-save-async-bar" />
        <Show when={state() === 'error' && SaveStatus.snapshot().lastError}>
          {(msg) => <span class="ss-save-status-error-detail">{msg()}</span>}
        </Show>
      </div>
    </Show>
  );
};

import { Show } from 'solid-js';
import type { Component } from 'solid-js';
import { StatusPill } from '@scenario-studio/ui-kit';
import { SaveStatus } from '../services/SaveStatus';

// Workspace header に置く 自動保存ステータス バッジ (PR-D)。
// 色 + アイコン + 文字 の 3 重表現で「いま保存されているか」を伝える。
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
  pending: '保存待機',
  saving: '保存中',
  saved: '保存済',
  error: 'エラー',
} as const;

export const SaveStatusBadge: Component = () => {
  const state = (): keyof typeof ICON => SaveStatus.snapshot().state;
  const pillState = (): 'idle' | 'busy' | 'ok' | 'error' => {
    const s = state();
    if (s === 'pending' || s === 'saving') return 'busy';
    if (s === 'saved') return 'ok';
    if (s === 'error') return 'error';
    return 'idle';
  };
  return (
    <StatusPill state={pillState()}>
      <span aria-hidden="true">{ICON[state()]}</span>
      <span>{TEXT[state()]}</span>
      <Show when={state() === 'error' && SaveStatus.snapshot().lastError}>
        {(msg) => <span class="ss-save-status-error-detail"> ({msg()})</span>}
      </Show>
    </StatusPill>
  );
};

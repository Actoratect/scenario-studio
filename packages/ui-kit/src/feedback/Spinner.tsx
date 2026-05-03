import type { Component, JSX } from 'solid-js';
import { Show } from 'solid-js';

// CUDO 配色のロード spinner。色だけでなく回転アニメで「動いている」を伝える。
// 詳細: ../../../../Documentation/ScenarioEditor/16_security.md (UX),
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export interface SpinnerProps {
  /** デフォルト sm。lg は 28px。 */
  size?: 'sm' | 'lg';
  label?: string;
}

export const Spinner: Component<SpinnerProps> = (props) => {
  return (
    <span class="ss-spinner-wrap" role="status" aria-live="polite">
      <span class={`ss-spinner ${props.size === 'lg' ? 'ss-spinner-lg' : ''}`} aria-hidden="true" />
      <Show when={props.label}>
        <span class="ss-spinner-label">{props.label}</span>
      </Show>
    </span>
  );
};

export interface LoadingOverlayProps {
  when: boolean;
  label?: string;
  children?: JSX.Element;
}

/** Panel 内に半透明 overlay を被せて「処理中」を視認化する。 */
export const LoadingOverlay: Component<LoadingOverlayProps> = (props) => {
  return (
    <Show when={props.when}>
      <div class="ss-loading-overlay" role="status" aria-live="polite">
        <span class="ss-spinner ss-spinner-lg" aria-hidden="true" />
        <Show when={props.label}>
          <span>{props.label}</span>
        </Show>
        {props.children}
      </div>
    </Show>
  );
};

export type StatusKind = 'idle' | 'busy' | 'ok' | 'error';

export interface StatusPillProps {
  state: StatusKind;
  children: JSX.Element;
}

/**
 * 状態を「色 + 文字 + 枠線」の 3 重で示す pill。
 * 色覚に依存しないよう状態テキストを必ず children に渡す。
 */
export const StatusPill: Component<StatusPillProps> = (props) => {
  return (
    <span class="ss-status-pill" data-state={props.state}>
      {props.children}
    </span>
  );
};

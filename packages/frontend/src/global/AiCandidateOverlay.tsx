import { createSignal, For, Match, Show, Switch } from 'solid-js';
import type { Component } from 'solid-js';
import type {
  FieldAiContext,
  TextSuggestionCandidate,
  TextSuggestionPresetId,
} from '@scenario-studio/core';
import { Spinner } from '@scenario-studio/ui-kit';
import { Toast } from '../services/Toast';

// PR-AR: AI 3 案を比較する overlay。テキスト用 + 画像用 (画像は型のみ、UI は将来)。
// FieldAiActions から起動される。
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §G8

interface TextRequest {
  kind: 'text';
  context: FieldAiContext;
  presetId: TextSuggestionPresetId;
  copyOnly: boolean;
  onAccept: (text: string) => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'pending-text'; req: TextRequest }
  | { kind: 'done-text'; req: TextRequest; candidates: readonly TextSuggestionCandidate[] }
  | { kind: 'error'; message: string };

const [open, setOpen] = createSignal(false);
const [state, setState] = createSignal<State>({ kind: 'idle' });

export const AiCandidateOverlay = {
  open,
  startText(req: {
    context: FieldAiContext;
    presetId: TextSuggestionPresetId;
    copyOnly?: boolean;
    onAccept: (text: string) => void;
  }): void {
    setState({
      kind: 'pending-text',
      req: { kind: 'text', ...req, copyOnly: req.copyOnly ?? false },
    });
    setOpen(true);
  },
  setTextResults(candidates: readonly TextSuggestionCandidate[]): void {
    const cur = state();
    if (cur.kind !== 'pending-text') return;
    setState({ kind: 'done-text', req: cur.req, candidates });
  },
  setError(message: string): void {
    setState({ kind: 'error', message });
  },
  hide(): void {
    setOpen(false);
    setState({ kind: 'idle' });
  },
};

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    Toast.success('コピーしました', 1500);
  } catch (e) {
    Toast.error(`コピー失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const TextDoneView: Component<{
  req: TextRequest;
  candidates: readonly TextSuggestionCandidate[];
}> = (props) => {
  function accept(text: string, mode: 'replace' | 'append'): void {
    const next = mode === 'replace' ? text : (props.req.context.currentValue ?? '') + '\n' + text;
    props.req.onAccept(next);
    AiCandidateOverlay.hide();
    Toast.success(mode === 'replace' ? '提案で置換しました' : '提案を末尾に追記しました', 1500);
  }
  return (
    <>
      <p class="ss-modal-caption">現在値と 3 案。差分を見比べて採用するものを選んでください。</p>
      <Show when={props.req.context.currentValue}>
        <details class="ss-ai-candidate-current">
          <summary>現在値 (折りたたみ)</summary>
          <pre>{props.req.context.currentValue}</pre>
        </details>
      </Show>
      <ul class="ss-ai-candidate-list">
        <For each={props.candidates}>
          {(c) => (
            <li class="ss-ai-candidate-item">
              <header class="ss-ai-candidate-head">
                <span class="ss-ai-candidate-label">{c.label}</span>
                <span class="ss-ai-candidate-len">{c.text.length} 字</span>
              </header>
              <pre class="ss-ai-candidate-text">{c.text}</pre>
              <div class="ss-ai-candidate-actions">
                <Show when={!props.req.copyOnly}>
                  <button
                    type="button"
                    data-variant="primary"
                    onClick={() => accept(c.text, 'replace')}
                  >
                    ✎ 置換
                  </button>
                  <button type="button" onClick={() => accept(c.text, 'append')}>
                    ＋ 末尾追記
                  </button>
                </Show>
                <button type="button" onClick={() => void copyText(c.text)}>
                  📋 コピー
                </button>
              </div>
            </li>
          )}
        </For>
      </ul>
      <div class="ss-modal-actions">
        <span class="ss-modal-spacer" />
        <button type="button" onClick={() => AiCandidateOverlay.hide()}>
          閉じる
        </button>
      </div>
    </>
  );
};

const Ui: Component = () => {
  return (
    <div class="ss-modal-backdrop" onClick={() => AiCandidateOverlay.hide()}>
      <div class="ss-modal ss-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>🤖 AI 提案 (3 案)</h3>
        <Switch>
          <Match when={state().kind === 'pending-text'}>
            <p class="ss-modal-caption">
              <Spinner /> AI に問い合わせ中… (3 案を並列生成)
            </p>
          </Match>
          <Match
            when={state().kind === 'done-text' ? (state() as State & { kind: 'done-text' }) : null}
          >
            {(s) => <TextDoneView req={s().req} candidates={s().candidates} />}
          </Match>
          <Match when={state().kind === 'error' ? (state() as State & { kind: 'error' }) : null}>
            {(s) => (
              <>
                <p class="ss-modal-caption ss-ai-summary-error">⚠ {s().message}</p>
                <div class="ss-modal-actions">
                  <span class="ss-modal-spacer" />
                  <button
                    type="button"
                    data-variant="primary"
                    onClick={() => AiCandidateOverlay.hide()}
                  >
                    閉じる
                  </button>
                </div>
              </>
            )}
          </Match>
        </Switch>
      </div>
    </div>
  );
};

export const AiCandidateOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <Ui />
    </Show>
  );
};

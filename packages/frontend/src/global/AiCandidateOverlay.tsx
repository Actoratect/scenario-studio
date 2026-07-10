import { createSignal, For, Match, Show, Switch } from 'solid-js';
import type { Component } from 'solid-js';
import type {
  FieldAiContext,
  TextSuggestionCandidate,
  TextSuggestionPresetId,
} from '@scenario-studio/core';
import { Spinner } from '@scenario-studio/ui-kit';
import {
  AiService,
  buildFieldUserPrompt,
  buildTextSuggestionSystemPrompt,
  formatCostEstimate,
} from '../services/AiService';
import { Toast } from '../services/Toast';
import { ModalBase } from './ModalBase';

// PR-AR: AI 3 案を比較する overlay。テキスト用 + 画像用 (画像は型のみ、UI は将来)。
// FieldAiActions から起動される。
//
// Show prompt: 送信 prompt 全文 (system + user) を confirm 段階でプレビューし、
// ユーザが承認して初めて requestTextSuggestions を呼ぶ (AiSummaryOverlay と同型)。
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §G8,
//       ../../../../Documentation/ScenarioEditor/11_ai-workflow.md §4 (Show prompt)

interface TextRequest {
  kind: 'text';
  context: FieldAiContext;
  presetId: TextSuggestionPresetId;
  copyOnly: boolean;
  onAccept: (text: string) => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'confirm-text'; req: TextRequest; systemPrompt: string; userPrompt: string }
  | { kind: 'pending-text'; req: TextRequest }
  | { kind: 'done-text'; req: TextRequest; candidates: readonly TextSuggestionCandidate[] }
  | { kind: 'error'; message: string };

const [open, setOpen] = createSignal(false);
const [state, setState] = createSignal<State>({ kind: 'idle' });

export const AiCandidateOverlay = {
  open,
  /** 確認画面 (Show prompt) を開く。送信は confirm ボタン押下まで行わない。 */
  startText(req: {
    context: FieldAiContext;
    presetId: TextSuggestionPresetId;
    copyOnly?: boolean;
    onAccept: (text: string) => void;
  }): void {
    setState({
      kind: 'confirm-text',
      req: { kind: 'text', ...req, copyOnly: req.copyOnly ?? false },
      systemPrompt: buildTextSuggestionSystemPrompt(req.presetId),
      userPrompt: buildFieldUserPrompt(req.context),
    });
    setOpen(true);
  },
  hide(): void {
    setOpen(false);
    setState({ kind: 'idle' });
  },
};

/** confirm 段階でユーザが承認したら初めて AI に送信する。 */
async function confirmAndSend(): Promise<void> {
  const cur = state();
  if (cur.kind !== 'confirm-text') return;
  setState({ kind: 'pending-text', req: cur.req });
  try {
    const candidates = await AiService.requestTextSuggestions(cur.req.context, cur.req.presetId);
    // 応答待ちの間に閉じられた / 別リクエストが始まった場合は結果を捨てる
    const now = state();
    if (now.kind !== 'pending-text' || now.req !== cur.req) return;
    setState({ kind: 'done-text', req: cur.req, candidates });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const now = state();
    if (now.kind === 'pending-text' && now.req === cur.req) {
      setState({ kind: 'error', message });
    }
    Toast.error(`AI 提案に失敗: ${message}`);
  }
}

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
    <ModalBase
      onClose={() => AiCandidateOverlay.hide()}
      dialogClass="ss-modal ss-modal--wide"
      labelledBy="ss-ai-candidate-title"
    >
      <h3 id="ss-ai-candidate-title">🤖 AI 提案 (3 案)</h3>
      <Switch>
        <Match
          when={
            state().kind === 'confirm-text' ? (state() as State & { kind: 'confirm-text' }) : null
          }
        >
          {(cur) => (
            <>
              <p class="ss-modal-caption">
                次の内容を AI provider に送信して 3 案を並列生成します。 internet 経由で provider
                に送られるため、機密データに注意してください。
              </p>
              <pre class="ss-ai-summary-preview">
                {`[System]\n${cur().systemPrompt}\n[User]\n${cur().userPrompt}`}
              </pre>
              <p class="ss-ai-cost">
                {formatCostEstimate(cur().systemPrompt + '\n' + cur().userPrompt, 3)}
              </p>
              <div class="ss-modal-actions">
                <button type="button" onClick={() => AiCandidateOverlay.hide()}>
                  キャンセル
                </button>
                <span class="ss-modal-spacer" />
                <button type="button" data-variant="primary" onClick={() => void confirmAndSend()}>
                  送信する (3 案生成)
                </button>
              </div>
            </>
          )}
        </Match>
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
    </ModalBase>
  );
};

export const AiCandidateOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <Ui />
    </Show>
  );
};

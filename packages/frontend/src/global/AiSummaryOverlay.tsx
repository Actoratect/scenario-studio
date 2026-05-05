import { createSignal, Match, Show, Switch } from 'solid-js';
import type { Component } from 'solid-js';
import { Spinner } from '@scenario-studio/ui-kit';
import { AiService } from '../services/AiService';
import { PanelFocus } from '../services/PanelFocus';
import { ProjectService } from '../services/ProjectService';
import { SceneSelection } from '../services/SceneSelection';
import { Toast } from '../services/Toast';

// PR-AJ: AI シーン要約 overlay。Cmd+Shift+A で起動。
// 現在 SceneSelection の scene を読み、AI Provider に 1 行要約させ、
// 結果を表示してコピーできる。
//
// Show prompt: 送信前に「次の内容を AI に送信します」確認 prompt。
// 詳細: ../../../../Documentation/ScenarioEditor/11_ai-workflow.md §4 (Show prompt)

type State =
  | { kind: 'idle' }
  | { kind: 'pending'; preview: string }
  | { kind: 'loading' }
  | { kind: 'done'; summary: string }
  | { kind: 'error'; message: string };

const [open, setOpen] = createSignal(false);
const [state, setState] = createSignal<State>({ kind: 'idle' });

async function startSummary(): Promise<void> {
  setState({ kind: 'idle' });
  setOpen(true);
  const sel = SceneSelection.selected();
  const ctx = ProjectService.currentProject();
  if (!ctx || !sel) {
    setState({
      kind: 'error',
      message:
        'シーンが選択されていません。Outline / Plot / Script で 1 シーンを選んでから実行してください。',
    });
    return;
  }
  if (AiService.status().kind !== 'unlocked') {
    setState({
      kind: 'error',
      message: 'AI が unlock されていません。AI panel で provider を選び unlock してください。',
    });
    return;
  }
  const path = `Scenarios/${sel.chapterSlug}/${sel.sceneSlug}.scn.yaml`;
  if (!(await ctx.adapter.exists(ctx.handle, path))) {
    setState({ kind: 'error', message: `シーンファイルが見つかりません: ${path}` });
    return;
  }
  try {
    const text = await ctx.adapter.read(ctx.handle, path);
    setState({ kind: 'pending', preview: text });
  } catch (e) {
    setState({
      kind: 'error',
      message: `シーン読込に失敗: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

async function confirmAndSend(): Promise<void> {
  const cur = state();
  if (cur.kind !== 'pending') return;
  setState({ kind: 'loading' });
  try {
    const summary = await AiService.requestSceneSummary(cur.preview);
    setState({ kind: 'done', summary });
  } catch (e) {
    setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

async function copySummary(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    Toast.success('要約をコピーしました', 1500);
  } catch (e) {
    Toast.error(`コピー失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export const AiSummaryOverlay = {
  open,
  show(): void {
    void startSummary();
  },
  hide(): void {
    setOpen(false);
    setState({ kind: 'idle' });
  },
};

const AiSummaryUi: Component = () => {
  return (
    <div class="ss-modal-backdrop" onClick={() => AiSummaryOverlay.hide()}>
      <div class="ss-modal ss-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>🤖 シーン要約 (AI)</h3>
        <Switch fallback={<p class="ss-modal-caption">準備中…</p>}>
          <Match
            when={state().kind === 'pending' ? (state() as State & { kind: 'pending' }) : null}
          >
            {(cur) => (
              <>
                <p class="ss-modal-caption">
                  次のシーン内容を AI provider に送信して 1 行要約を作成します。 internet 経由で
                  provider に送られるため、機密データに注意してください。
                </p>
                <pre class="ss-ai-summary-preview">{cur().preview}</pre>
                <div class="ss-modal-actions">
                  <button type="button" onClick={() => AiSummaryOverlay.hide()}>
                    キャンセル
                  </button>
                  <span class="ss-modal-spacer" />
                  <button
                    type="button"
                    data-variant="primary"
                    onClick={() => void confirmAndSend()}
                  >
                    送信して要約を作る
                  </button>
                </div>
              </>
            )}
          </Match>
          <Match when={state().kind === 'loading'}>
            <p class="ss-modal-caption">
              <Spinner /> AI に問い合わせ中…
            </p>
          </Match>
          <Match when={state().kind === 'done' ? (state() as State & { kind: 'done' }) : null}>
            {(cur) => (
              <>
                <p class="ss-modal-caption">要約結果:</p>
                <p class="ss-ai-summary-result">{cur().summary}</p>
                <div class="ss-modal-actions">
                  <button type="button" onClick={() => void copySummary(cur().summary)}>
                    📋 コピー
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      AiSummaryOverlay.hide();
                      PanelFocus.focus('script-1');
                    }}
                    title="Script panel に戻る"
                  >
                    Script に戻る
                  </button>
                  <span class="ss-modal-spacer" />
                  <button
                    type="button"
                    data-variant="primary"
                    onClick={() => AiSummaryOverlay.hide()}
                  >
                    閉じる
                  </button>
                </div>
              </>
            )}
          </Match>
          <Match when={state().kind === 'error' ? (state() as State & { kind: 'error' }) : null}>
            {(cur) => (
              <>
                <p class="ss-modal-caption ss-ai-summary-error">⚠ {cur().message}</p>
                <div class="ss-modal-actions">
                  <span class="ss-modal-spacer" />
                  <button
                    type="button"
                    data-variant="primary"
                    onClick={() => AiSummaryOverlay.hide()}
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

export const AiSummaryOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <AiSummaryUi />
    </Show>
  );
};

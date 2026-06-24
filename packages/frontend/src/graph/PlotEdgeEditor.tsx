import { createEffect, createSignal, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { StableTextInput } from '../global/StableTextControl';

// Modal: プロットボードの線 (edge) の種類/ラベルを編集 + 削除する。
// 旧版は window.prompt/confirm でテーマ非対応かつ削除が「空欄送信」と分かりにくかった。
// RelationTypePicker と同じ ss-modal スタイルに揃え、単一フィールドで編集する。

export interface PlotEdgeEditorProps {
  open: boolean;
  /** 現在の種類/ラベル。表示は label を優先し、無ければ type をフォールバック。 */
  initial?: { type: string; label?: string | undefined } | undefined;
  /** "始点 → 終点" のキャプション。 */
  caption?: string | undefined;
  onClose: () => void;
  /** ラベルを確定。空文字なら種類 (type) 表示に戻る。 */
  onSubmit: (label: string) => void;
  onDelete: () => void;
}

export const PlotEdgeEditor: Component<PlotEdgeEditorProps> = (props) => {
  const [text, setText] = createSignal('');

  createEffect(() => {
    if (props.open) setText(props.initial?.label || props.initial?.type || '');
  });

  function submit(): void {
    props.onSubmit(text().trim());
    props.onClose();
  }

  return (
    <Show when={props.open}>
      <div class="ss-modal-backdrop" onClick={() => props.onClose()} role="dialog" aria-modal="true">
        <div class="ss-modal" onClick={(e) => e.stopPropagation()}>
          <h3>線を編集</h3>
          <Show when={props.caption}>{(c) => <p class="ss-modal-caption">{c()}</p>}</Show>

          <div class="ss-modal-section">
            <label>
              <strong>種類 / ラベル</strong>
              <StableTextInput
                value={text()}
                onInput={setText}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
                placeholder="例: 伏線 / 対立 / きっかけ"
                autofocus
              />
            </label>
          </div>

          <div class="ss-modal-actions">
            <button
              type="button"
              class="ss-modal-danger"
              onClick={() => {
                props.onDelete();
                props.onClose();
              }}
            >
              線を削除
            </button>
            <span class="ss-modal-spacer" />
            <button type="button" onClick={() => props.onClose()}>
              キャンセル
            </button>
            <button type="button" data-variant="primary" onClick={() => submit()}>
              保存
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

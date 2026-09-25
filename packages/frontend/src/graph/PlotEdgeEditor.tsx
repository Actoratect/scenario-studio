import { createEffect, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { StableTextInput } from '../global/StableTextControl';
import { clampPopoverPosition } from './RelationTypePicker';

// Modal: プロットボード / Plot Flow の線 (edge) の種類/ラベルを編集 + 削除する。
// 旧版は window.prompt/confirm でテーマ非対応かつ削除が「空欄送信」と分かりにくかった。
// RelationTypePicker と同じ ss-modal スタイルに揃え、単一フィールドで編集する。

export interface PlotEdgeEditorProps {
  open: boolean;
  editType?: boolean;
  /** 現在の種類/ラベル。表示は label を優先し、無ければ type をフォールバック。 */
  initial?: { type: string; label?: string | undefined } | undefined;
  /** "始点 → 終点" のキャプション。 */
  caption?: string | undefined;
  /** ダイアログ見出し。既定は「線を編集」。 */
  title?: string | undefined;
  /** ラベル入力の placeholder。 */
  placeholder?: string | undefined;
  /** 削除ボタンを出すか。構造由来 (暗黙 next 等) の線は消せないので false。既定 true。 */
  canDelete?: boolean | undefined;
  /** 表示位置 (client 座標)。指定するとマウス位置近くにポップアップ (P1 dogfood)。 */
  at?: { x: number; y: number } | undefined;
  onClose: () => void;
  /** ラベルを確定。空文字なら種類 (type) 表示 / ラベル無しに戻る。 */
  onSubmit: (label: string, type?: string) => void;
  onDelete: () => void;
}

export const PlotEdgeEditor: Component<PlotEdgeEditorProps> = (props) => {
  const [text, setText] = createSignal('');
  const [edgeType, setEdgeType] = createSignal('next');
  const types = [
    ['next', '次へ'],
    ['causes', '原因'],
    ['foreshadows', '伏線'],
    ['resolves', '回収'],
    ['blocks', '障害'],
    ['contrasts', '対比'],
    ['belongs_to', '所属'],
    ['realized_in', '実現先'],
  ];
  let dialogRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.open) {
      setText(props.initial?.label ?? '');
      setEdgeType(props.initial?.type || 'next');
      // ポップアップと同時に入力可能にする (autofocus 属性は動的挿入では効かない)
      queueMicrotask(() => dialogRef?.querySelector('input')?.focus());
    }
  });

  function submit(): void {
    props.onSubmit(text().trim(), props.editType ? edgeType() : undefined);
    props.onClose();
  }

  return (
    <Show when={props.open}>
      <div
        class="ss-modal-backdrop"
        classList={{ 'ss-modal-backdrop--popover': !!props.at }}
        onClick={() => props.onClose()}
        role="dialog"
        aria-modal="true"
      >
        <div
          ref={dialogRef}
          class="ss-modal"
          style={props.at ? clampPopoverPosition(props.at, { w: 420, h: 220 }) : undefined}
          classList={{ 'ss-modal--popover': !!props.at }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !e.isComposing) props.onClose();
          }}
        >
          <h3>{props.title ?? '線を編集'}</h3>
          <Show when={props.caption}>{(c) => <p class="ss-modal-caption">{c()}</p>}</Show>

          <div class="ss-modal-section">
            <Show when={props.editType}>
              <label>
                <strong>接続の意味</strong>
                <select
                  value={edgeType()}
                  onChange={(event) => setEdgeType(event.currentTarget.value)}
                >
                  <For each={types}>{(entry) => <option value={entry[0]}>{entry[1]}</option>}</For>
                  <Show when={!types.some((entry) => entry[0] === edgeType())}>
                    <option value={edgeType()}>{edgeType()}</option>
                  </Show>
                </select>
              </label>
            </Show>
            <label>
              <strong>ラベル</strong>
              <StableTextInput
                value={text()}
                onInput={setText}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.isComposing) submit();
                }}
                placeholder={props.placeholder ?? '例: 伏線 / 対立 / きっかけ'}
                autofocus
              />
            </label>
          </div>

          <div class="ss-modal-actions">
            <Show when={props.canDelete !== false}>
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
            </Show>
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

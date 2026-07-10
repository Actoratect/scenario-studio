import { createEffect, createSignal, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { StableTextarea } from '../global/StableTextControl';

// Modal: ノード間関係の編集 (作成 / 変更兼用)。
// 1 関係 = source→target 方向の自由テキスト 1 本。
// 作成時のみ逆方向 (target→source) のテキストも入力でき、入れると逆向きの関係をもう 1 本作る。
// 空欄の向きには矢印を出さない (= その向きの関係を作らない)。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §2

export interface RelationPickerProps {
  open: boolean;
  /** 編集時の現在テキスト (新規作成なら undefined)。 */
  initial?: { text: string } | undefined;
  /** "A → B" 形式の端点ラベル。 */
  caption?: string | undefined;
  /** 削除ボタンの表示可否。新規作成時は false (= 逆方向欄を表示)。 */
  canDelete: boolean;
  /**
   * 表示位置 (client 座標)。指定するとマウス位置近くにポップアップし、
   * 画面中央への視線移動なしですぐ入力できる (P1 dogfood)。無指定は中央。
   */
  at?: { x: number; y: number } | undefined;
  onClose: () => void;
  onSubmit: (input: { text: string; reverseText?: string }) => void;
  onDelete?: () => void;
}

/** マウス位置ポップアップが画面からはみ出さないよう client 座標を丸める。 */
export function clampPopoverPosition(
  at: { x: number; y: number },
  size: { w: number; h: number },
): { left: string; top: string } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.max(8, Math.min(at.x + 8, vw - size.w - 8));
  const top = Math.max(8, Math.min(at.y + 8, vh - size.h - 8));
  return { left: `${left}px`, top: `${top}px` };
}

export const RelationTypePicker: Component<RelationPickerProps> = (props) => {
  const [text, setText] = createSignal<string>(props.initial?.text ?? '');
  const [reverseText, setReverseText] = createSignal<string>('');
  let dialogRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.open) {
      setText(props.initial?.text ?? '');
      setReverseText('');
      // ポップアップと同時に入力可能にする (autofocus 属性は動的挿入では効かない)
      queueMicrotask(() => dialogRef?.querySelector('textarea')?.focus());
    }
  });

  const endpoints = () => {
    const parts = props.caption?.split(' → ');
    return { source: parts?.[0] ?? 'A', target: parts?.[1] ?? 'B' };
  };

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
          style={props.at ? clampPopoverPosition(props.at, { w: 420, h: 380 }) : undefined}
          classList={{ 'ss-modal--popover': !!props.at }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !e.isComposing) props.onClose();
          }}
        >
          <h3>関係を{props.canDelete ? '編集' : '追加'}</h3>
          <Show when={props.caption}>{(c) => <p class="ss-modal-caption">{c()}</p>}</Show>

          <div class="ss-modal-section">
            <label>
              <strong>
                {endpoints().source} → {endpoints().target}
              </strong>
              <StableTextarea
                class="ss-relation-free-text"
                value={text()}
                onInput={setText}
                placeholder="例: 幼馴染。互いに遠慮なく言い合えるが、過去の約束が二人の距離を複雑にしている。"
                rows={4}
                autofocus
              />
            </label>
          </div>

          <Show when={!props.canDelete}>
            <div class="ss-modal-section">
              <label>
                <strong>
                  {endpoints().target} → {endpoints().source}（任意・逆向き）
                </strong>
                <StableTextarea
                  class="ss-relation-free-text"
                  value={reverseText()}
                  onInput={setReverseText}
                  placeholder="逆方向の関係性も入れたいならどうぞ。空欄ならこの向きの矢印は作りません。"
                  rows={4}
                />
              </label>
            </div>
          </Show>

          <div class="ss-modal-actions">
            <Show when={props.canDelete && props.onDelete}>
              <button
                type="button"
                class="ss-modal-danger"
                onClick={() => {
                  props.onDelete?.();
                  props.onClose();
                }}
              >
                関係を削除
              </button>
            </Show>
            <span class="ss-modal-spacer" />
            <button type="button" onClick={() => props.onClose()}>
              キャンセル
            </button>
            <button
              type="button"
              data-variant="primary"
              disabled={text().trim() === ''}
              onClick={() => {
                const reverse = reverseText().trim();
                props.onSubmit({
                  text: text().trim(),
                  ...(reverse !== '' ? { reverseText: reverse } : {}),
                });
                props.onClose();
              }}
            >
              {props.canDelete ? '保存' : '追加'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

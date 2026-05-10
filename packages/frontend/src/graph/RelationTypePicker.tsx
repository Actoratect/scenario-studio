import { createEffect, createSignal, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { RelationType } from '@scenario-studio/core';
import { StableTextarea } from '../global/StableTextControl';

// Modal: 関係 type を選ぶ (作成 / 変更兼用) + ラベル編集 + 削除。
// PR-E。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §2

export interface RelationPickerProps {
  open: boolean;
  /** 表示中の現値 (新規作成なら undefined)。 */
  initial?: { type: RelationType; label?: string } | undefined;
  /** タイトル/サブテキスト用 (例: "A → B" のラベル)。 */
  caption?: string | undefined;
  /** 削除ボタンの表示可否。新規作成時は false。 */
  canDelete: boolean;
  onClose: () => void;
  onSubmit: (input: { type: RelationType; label: string; reverseType?: RelationType | undefined }) => void;
  onDelete?: () => void;
}

export const RelationTypePicker: Component<RelationPickerProps> = (props) => {
  const [text, setText] = createSignal<string>(props.initial?.label || props.initial?.type || '');
  const [reverseText, setReverseText] = createSignal<string>('');

  createEffect(() => {
    if (props.open) {
      setText(props.initial?.label || props.initial?.type || '');
      setReverseText('');
    }
  });

  const endpoints = () => {
    const parts = props.caption?.split(' → ');
    return {
      source: parts?.[0] ?? 'A',
      target: parts?.[1] ?? 'B',
    };
  };

  return (
    <Show when={props.open}>
      <div
        class="ss-modal-backdrop"
        onClick={() => props.onClose()}
        role="dialog"
        aria-modal="true"
      >
        <div class="ss-modal" onClick={(e) => e.stopPropagation()}>
          <h3>関係を{props.canDelete ? '編集' : '追加'}</h3>
          <Show when={props.caption}>{(c) => <p class="ss-modal-caption">{c()}</p>}</Show>

          <div class="ss-modal-section">
            <label>
              <strong>{props.canDelete ? '関係性' : `${endpoints().source} → ${endpoints().target}`}</strong>
              <StableTextarea
                class="ss-relation-free-text"
                value={text()}
                onInput={setText}
                placeholder="例: 幼馴染。互いに遠慮なく言い合えるが、過去の約束が二人の距離を複雑にしている。"
                rows={5}
                autofocus
              />
            </label>
          </div>
          <Show when={!props.canDelete}>
            <div class="ss-modal-section">
              <label>
                <strong>{endpoints().target} → {endpoints().source}</strong>
                <StableTextarea
                  class="ss-relation-free-text"
                  value={reverseText()}
                  onInput={setReverseText}
                  placeholder="逆方向の関係性も必要なら入力。空欄なら片方向だけ追加します。"
                  rows={5}
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
                const trimmed = text().trim();
                const reverse = reverseText().trim();
                props.onSubmit({
                  type: trimmed as RelationType,
                  label: '',
                  ...(reverse !== '' ? { reverseType: reverse as RelationType } : {}),
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

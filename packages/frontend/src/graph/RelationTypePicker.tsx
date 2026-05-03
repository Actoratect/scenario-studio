import { createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { RELATION_TYPES, type RelationType } from '@scenario-studio/core';

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
  onSubmit: (input: { type: RelationType; label: string }) => void;
  onDelete?: () => void;
}

export const RelationTypePicker: Component<RelationPickerProps> = (props) => {
  const [type, setType] = createSignal<RelationType>(props.initial?.type ?? 'friend');
  const [label, setLabel] = createSignal<string>(props.initial?.label ?? '');

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
            <strong>関係の種類</strong>
            <div class="ss-relation-type-grid">
              <For each={RELATION_TYPES}>
                {(rt) => (
                  <button
                    type="button"
                    class="ss-relation-type-button"
                    classList={{ 'ss-relation-type-button--active': type() === rt.id }}
                    data-variant={type() === rt.id ? 'primary' : undefined}
                    onClick={() => setType(rt.id)}
                  >
                    <span class="ss-relation-type-label">{rt.label}</span>
                    <span class="ss-relation-type-meta">
                      {rt.symmetric ? '対称' : `inv: ${rt.inverse}`}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="ss-modal-section">
            <label>
              <strong>カスタムラベル (任意)</strong>
              <input
                type="text"
                value={label()}
                onInput={(e) => setLabel(e.currentTarget.value)}
                placeholder="例: 幼馴染、宿敵、養父…"
              />
            </label>
          </div>

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
              onClick={() => {
                props.onSubmit({ type: type(), label: label().trim() });
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

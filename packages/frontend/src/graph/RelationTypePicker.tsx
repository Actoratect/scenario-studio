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
            <label class="ss-relation-type-custom">
              <strong>関係の種類 (自由入力)</strong>
              <input
                type="text"
                value={type()}
                onInput={(e) => setType(e.currentTarget.value)}
                placeholder="例: 友人、師弟、ライバル、同僚、宿敵、契約関係…"
                autofocus
              />
            </label>
            <details class="ss-relation-type-presets">
              <summary>よく使う候補を見る (クリックで挿入)</summary>
              <div class="ss-relation-type-grid">
                <For each={RELATION_TYPES}>
                  {(rt) => (
                    <button
                      type="button"
                      class="ss-relation-type-button"
                      classList={{ 'ss-relation-type-button--active': type() === rt.id }}
                      onClick={() => setType(rt.id)}
                      title={rt.symmetric ? '対称関係 (双方向)' : `逆関係: ${rt.inverse}`}
                    >
                      {rt.label}
                    </button>
                  )}
                </For>
              </div>
            </details>
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

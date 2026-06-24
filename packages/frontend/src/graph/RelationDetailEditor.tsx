import { createEffect, createSignal, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { StableTextInput, StableTextarea } from '../global/StableTextControl';

// Modal: 明示関係 (Relation) の種類 + 双方向ラベル + 説明を編集する。
// 旧 RelationTypePicker は単一フィールド (type のみ) で、label_from/label_to/description
// を持つデータを編集できなかった。ss-modal スタイルに揃える。

export interface RelationDetails {
  type: string;
  labelFrom: string;
  labelTo: string;
  description: string;
}

export interface RelationDetailEditorProps {
  open: boolean;
  sourceName: string;
  targetName: string;
  initial?:
    | {
        type?: string | undefined;
        labelFrom?: string | undefined;
        labelTo?: string | undefined;
        description?: string | undefined;
      }
    | undefined;
  onClose: () => void;
  onSubmit: (details: RelationDetails) => void;
  onDelete: () => void;
}

export const RelationDetailEditor: Component<RelationDetailEditorProps> = (props) => {
  const [type, setType] = createSignal('');
  const [labelFrom, setLabelFrom] = createSignal('');
  const [labelTo, setLabelTo] = createSignal('');
  const [description, setDescription] = createSignal('');

  createEffect(() => {
    if (!props.open) return;
    setType(props.initial?.type ?? '');
    setLabelFrom(props.initial?.labelFrom ?? '');
    setLabelTo(props.initial?.labelTo ?? '');
    setDescription(props.initial?.description ?? '');
  });

  function submit(): void {
    props.onSubmit({
      type: type().trim(),
      labelFrom: labelFrom().trim(),
      labelTo: labelTo().trim(),
      description: description().trim(),
    });
    props.onClose();
  }

  return (
    <Show when={props.open}>
      <div class="ss-modal-backdrop" onClick={() => props.onClose()} role="dialog" aria-modal="true">
        <div class="ss-modal" onClick={(e) => e.stopPropagation()}>
          <h3>関係を編集</h3>
          <p class="ss-modal-caption">
            {props.sourceName} → {props.targetName}
          </p>

          <div class="ss-modal-section">
            <label>
              <strong>種類</strong>
              <StableTextInput
                value={type()}
                onInput={setType}
                placeholder="例: friendship / 親友 / 対立"
              />
            </label>
          </div>
          <div class="ss-modal-section ss-relation-label-row">
            <label>
              <strong>{props.sourceName} 側のラベル</strong>
              <StableTextInput
                value={labelFrom()}
                onInput={setLabelFrom}
                placeholder="例: 兄"
              />
            </label>
            <label>
              <strong>{props.targetName} 側のラベル</strong>
              <StableTextInput value={labelTo()} onInput={setLabelTo} placeholder="例: 妹" />
            </label>
          </div>
          <div class="ss-modal-section">
            <label>
              <strong>説明</strong>
              <StableTextarea
                class="ss-relation-free-text"
                value={description()}
                onInput={setDescription}
                placeholder="関係の背景・プロット上の意味など"
                rows={4}
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
              関係を削除
            </button>
            <span class="ss-modal-spacer" />
            <button type="button" onClick={() => props.onClose()}>
              キャンセル
            </button>
            <button
              type="button"
              data-variant="primary"
              disabled={type().trim() === ''}
              onClick={() => submit()}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

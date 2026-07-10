import { createEffect, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import {
  CHARACTER_TEMPLATE,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  LOCATION_TEMPLATE,
  type TemplateDefinition,
} from '@scenario-studio/core';
import { StableTextInput } from '../global/StableTextControl';
import { clampPopoverPosition } from './RelationTypePicker';

// P1 dogfood: グラフ上で直接ノードを増やすためのクイック作成ポップオーバー。
// Shift+drag を「何もない場所」で離すと、ドロップ地点にこのポップアップが出る。
//   - 関係図: テンプレ (キャラ / 場所 / アイテム / 勢力) + 名前 + 任意の関係ラベル
//   - プロットフロー: シーンタイトルのみ (起点シーンの直後に挿入される)
// アウトラインへ往復せずグラフだけで作業を進められるようにする。

const QUICK_TEMPLATES: ReadonlyArray<{ template: TemplateDefinition; label: string }> = [
  { template: CHARACTER_TEMPLATE, label: '👤 キャラ' },
  { template: LOCATION_TEMPLATE, label: '📍 場所' },
  { template: ITEM_TEMPLATE, label: '🗝 アイテム' },
  { template: FACTION_TEMPLATE, label: '⚑ 勢力' },
];

export interface QuickNodeCreatorProps {
  open: boolean;
  /** 起点ノードの表示名 ("〜 から Shift+drag" のキャプション用)。 */
  sourceLabel?: string | undefined;
  /** 表示位置 (client 座標)。 */
  at?: { x: number; y: number } | undefined;
  onClose: () => void;
  /** relationText が空文字なら関係線は作らない。 */
  onSubmit: (input: { template: TemplateDefinition; name: string; relationText: string }) => void;
}

export const QuickNodeCreator: Component<QuickNodeCreatorProps> = (props) => {
  const [template, setTemplate] = createSignal<TemplateDefinition>(CHARACTER_TEMPLATE);
  const [name, setName] = createSignal('');
  const [relationText, setRelationText] = createSignal('');
  let dialogRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.open) {
      setTemplate(CHARACTER_TEMPLATE);
      setName('');
      setRelationText('');
      // 開いた瞬間に名前入力できるようにする (autofocus 属性は動的挿入では効かない)
      queueMicrotask(() => dialogRef?.querySelector('input')?.focus());
    }
  });

  function submit(): void {
    const trimmed = name().trim();
    if (trimmed === '') return;
    props.onSubmit({ template: template(), name: trimmed, relationText: relationText().trim() });
    props.onClose();
  }

  return (
    <Show when={props.open}>
      <div
        class="ss-modal-backdrop ss-modal-backdrop--popover"
        onClick={() => props.onClose()}
        role="dialog"
        aria-modal="true"
      >
        <div
          ref={dialogRef}
          class="ss-modal ss-modal--popover"
          style={props.at ? clampPopoverPosition(props.at, { w: 420, h: 320 }) : undefined}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !e.isComposing) props.onClose();
          }}
        >
          <h3>ノードを作成</h3>
          <Show when={props.sourceLabel}>
            {(s) => <p class="ss-modal-caption">{s()} からの Shift+ドラッグ</p>}
          </Show>

          <div class="ss-modal-section ss-quick-create-templates">
            <For each={QUICK_TEMPLATES}>
              {(t) => (
                <button
                  type="button"
                  classList={{ active: template().id === t.template.id }}
                  onClick={() => setTemplate(t.template)}
                >
                  {t.label}
                </button>
              )}
            </For>
          </div>

          <div class="ss-modal-section">
            <label>
              <strong>名前</strong>
              <StableTextInput
                value={name()}
                onInput={setName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
                placeholder="表示名 (例: アイネ)"
              />
            </label>
          </div>

          <div class="ss-modal-section">
            <label>
              <strong>関係ラベル (任意)</strong>
              <StableTextInput
                value={relationText()}
                onInput={setRelationText}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
                placeholder="空欄なら線は作らずノードだけ作成"
              />
            </label>
          </div>

          <div class="ss-modal-actions">
            <span class="ss-modal-spacer" />
            <button type="button" onClick={() => props.onClose()}>
              キャンセル
            </button>
            <button
              type="button"
              data-variant="primary"
              disabled={name().trim() === ''}
              onClick={submit}
            >
              作成
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export interface QuickSceneCreatorProps {
  open: boolean;
  /** 起点シーンの表示名。新シーンはこの直後に挿入される。 */
  sourceLabel?: string | undefined;
  at?: { x: number; y: number } | undefined;
  onClose: () => void;
  onSubmit: (title: string) => void;
}

export const QuickSceneCreator: Component<QuickSceneCreatorProps> = (props) => {
  const [title, setTitle] = createSignal('');
  let dialogRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.open) {
      setTitle('');
      queueMicrotask(() => dialogRef?.querySelector('input')?.focus());
    }
  });

  function submit(): void {
    const trimmed = title().trim();
    if (trimmed === '') return;
    props.onSubmit(trimmed);
    props.onClose();
  }

  return (
    <Show when={props.open}>
      <div
        class="ss-modal-backdrop ss-modal-backdrop--popover"
        onClick={() => props.onClose()}
        role="dialog"
        aria-modal="true"
      >
        <div
          ref={dialogRef}
          class="ss-modal ss-modal--popover"
          style={props.at ? clampPopoverPosition(props.at, { w: 420, h: 200 }) : undefined}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !e.isComposing) props.onClose();
          }}
        >
          <h3>シーンを作成</h3>
          <Show when={props.sourceLabel}>
            {(s) => <p class="ss-modal-caption">「{s()}」の直後に挿入されます</p>}
          </Show>

          <div class="ss-modal-section">
            <label>
              <strong>シーンタイトル</strong>
              <StableTextInput
                value={title()}
                onInput={setTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
                placeholder="例: 管理人との回想"
              />
            </label>
          </div>

          <div class="ss-modal-actions">
            <span class="ss-modal-spacer" />
            <button type="button" onClick={() => props.onClose()}>
              キャンセル
            </button>
            <button
              type="button"
              data-variant="primary"
              disabled={title().trim() === ''}
              onClick={submit}
            >
              作成
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

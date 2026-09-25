import { createMemo, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { FieldValue, TextMapFieldSchema } from '@scenario-studio/core';
import { MultilineInput, type NodeRefOption } from '@scenario-studio/ui-kit';
import { textMapEntries, updateTextMap } from './inspector-fields';

export const TextMapEditor: Component<{
  field: TextMapFieldSchema;
  inputId: string;
  value: FieldValue | undefined;
  options: readonly NodeRefOption[];
  onInput: (value: FieldValue) => void;
  onBlur: () => void;
}> = (props) => {
  const entries = createMemo(() => textMapEntries(props.value));
  const keys = createMemo(() => entries().map(([key]) => key));
  const [customKey, setCustomKey] = createSignal('');
  const [error, setError] = createSignal('');
  const available = createMemo(() => {
    const choices =
      props.field.keyKind === 'node_ref'
        ? props.options
        : (props.field.suggestions ?? []).map((label) => ({ id: label, label }));
    return choices.filter((option) => !keys().includes(option.id));
  });
  const labelFor = (key: string): string =>
    props.field.keyKind === 'node_ref'
      ? (props.options.find((option) => option.id === key)?.label ?? `参照先不明 (${key})`)
      : key;

  function add(raw: string): void {
    const key = raw.trim();
    if (!key) return;
    if (keys().includes(key)) {
      setError('同じ項目はすでに追加されています。');
      return;
    }
    props.onInput(updateTextMap(props.value, key, ''));
    props.onBlur();
    setCustomKey('');
    setError('');
  }

  return (
    <div class="inspector-text-map">
      <div class="inspector-map-title">{props.field.label}</div>
      <p class="inspector-map-hint">{props.field.description}</p>
      <For each={keys()}>
        {(key) => (
          <div class="inspector-map-entry">
            <div class="inspector-map-entry-title">
              <span>{labelFor(key)}</span>
              <span class="inspector-map-line-count">
                {
                  (entries().find(([k]) => k === key)?.[1] ?? '')
                    .split('\n')
                    .filter((line) => line.trim()).length
                }{' '}
                行
              </span>
              <button
                type="button"
                title={`${labelFor(key)}を削除`}
                aria-label={`${labelFor(key)}を削除`}
                onClick={() => {
                  const text = entries().find(([k]) => k === key)?.[1] ?? '';
                  if (text && !window.confirm(`「${labelFor(key)}」の台詞を削除しますか？`)) return;
                  props.onInput(updateTextMap(props.value, key, null));
                  props.onBlur();
                }}
              >
                ×
              </button>
            </div>
            <MultilineInput
              fieldId={`${props.inputId}-${encodeURIComponent(key)}`}
              label={`${labelFor(key)}の台詞`}
              value={entries().find(([k]) => k === key)?.[1] ?? ''}
              onInput={(text) => props.onInput(updateTextMap(props.value, key, text))}
              onBlur={props.onBlur}
              placeholder="1行に1つの台詞"
              rows={2}
            />
          </div>
        )}
      </For>
      <div class="inspector-map-add">
        <select
          class="ssf-select"
          aria-label={`${props.field.label}の${props.field.keyLabel}を追加`}
          value=""
          disabled={available().length === 0}
          onChange={(event) => {
            add(event.currentTarget.value);
            event.currentTarget.value = '';
          }}
        >
          <option value="">＋ {props.field.keyLabel}を追加</option>
          <For each={available()}>
            {(option) => <option value={option.id}>{option.label}</option>}
          </For>
        </select>
        <Show when={props.field.keyKind !== 'node_ref'}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              add(customKey());
            }}
          >
            <input
              class="ssf-input"
              value={customKey()}
              aria-label="自由な場面名"
              placeholder="自由な場面名"
              onInput={(event) => setCustomKey(event.currentTarget.value)}
            />
            <button type="submit" disabled={!customKey().trim()}>
              追加
            </button>
          </form>
        </Show>
      </div>
      <Show when={props.field.keyKind === 'node_ref' && props.options.length === 0}>
        <p class="inspector-map-hint">他のキャラクターを作成すると、相手を選べます。</p>
      </Show>
      <Show when={error()}>
        <p class="ssf-error" role="alert">
          {error()}
        </p>
      </Show>
    </div>
  );
};

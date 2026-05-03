import { For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { FormField } from './FormField';
import type { FormFieldProps } from './FormField';

export interface NodeRefOption {
  /** ノード ID (NodeId branded を string として保持)。 */
  id: string;
  /** UI 表示用の slug or display_name。 */
  label: string;
  /** 二行目の補助 (テンプレ名など)。 */
  hint?: string | undefined;
}

export interface NodeRefPickerProps extends FormFieldProps {
  value: string | undefined;
  options: readonly NodeRefOption[];
  onInput?: ((id: string | undefined) => void) | undefined;
  onBlur?: (() => void) | undefined;
  disabled?: boolean | undefined;
}

/**
 * MVP は <select> ベースの簡易 picker。Phase 1 後半で検索可能なポップオーバーに差し替え予定。
 */
export const NodeRefPicker: Component<NodeRefPickerProps> = (props) => {
  return (
    <FormField {...props} inputId={props.fieldId}>
      <select
        id={props.fieldId}
        class="ssf-select"
        value={props.value ?? ''}
        disabled={props.disabled}
        onChange={(e) => {
          const v = e.currentTarget.value;
          props.onInput?.(v === '' ? undefined : v);
        }}
        onBlur={() => props.onBlur?.()}
      >
        <option value="">— (none)</option>
        <For each={props.options}>
          {(o) => (
            <option value={o.id} selected={props.value === o.id}>
              {o.label}
              <Show when={o.hint}>{(h) => ` (${h()})`}</Show>
            </option>
          )}
        </For>
      </select>
    </FormField>
  );
};

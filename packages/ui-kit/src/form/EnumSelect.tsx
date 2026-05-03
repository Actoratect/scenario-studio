import { For } from 'solid-js';
import type { Component } from 'solid-js';
import { FormField } from './FormField';
import type { FormFieldProps } from './FormField';

export interface EnumSelectProps extends FormFieldProps {
  value: string | undefined;
  values: readonly string[];
  onInput?: ((v: string) => void) | undefined;
  onBlur?: (() => void) | undefined;
  disabled?: boolean | undefined;
}

export const EnumSelect: Component<EnumSelectProps> = (props) => {
  return (
    <FormField {...props} inputId={props.fieldId}>
      <select
        id={props.fieldId}
        class="ssf-select"
        value={props.value ?? ''}
        disabled={props.disabled}
        onChange={(e) => props.onInput?.(e.currentTarget.value)}
        onBlur={() => props.onBlur?.()}
      >
        <option value="" disabled>
          —
        </option>
        <For each={props.values}>
          {(v) => (
            <option value={v} selected={props.value === v}>
              {v}
            </option>
          )}
        </For>
      </select>
    </FormField>
  );
};

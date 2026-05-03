import type { Component } from 'solid-js';
import { FormField } from './FormField';
import type { FormFieldProps } from './FormField';

export interface TextInputProps extends FormFieldProps {
  value: string | undefined;
  onInput?: ((v: string) => void) | undefined;
  onBlur?: (() => void) | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  /** 任意の最大文字数。超え警告は親 (Inspector) 側の error 表示に委ねる。 */
  maxLength?: number | undefined;
}

export const TextInput: Component<TextInputProps> = (props) => {
  return (
    <FormField {...props} inputId={props.fieldId}>
      <input
        type="text"
        id={props.fieldId}
        class="ssf-input"
        value={props.value ?? ''}
        disabled={props.disabled}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        onInput={(e) => props.onInput?.(e.currentTarget.value)}
        onBlur={() => props.onBlur?.()}
      />
    </FormField>
  );
};

export const MultilineInput: Component<TextInputProps & { rows?: number | undefined }> = (
  props,
) => {
  return (
    <FormField {...props} inputId={props.fieldId}>
      <textarea
        id={props.fieldId}
        class="ssf-textarea"
        value={props.value ?? ''}
        disabled={props.disabled}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        rows={props.rows ?? 4}
        onInput={(e) => props.onInput?.(e.currentTarget.value)}
        onBlur={() => props.onBlur?.()}
      />
    </FormField>
  );
};

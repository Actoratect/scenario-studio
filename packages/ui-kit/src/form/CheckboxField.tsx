import type { Component } from 'solid-js';
import { FormField } from './FormField';
import type { FormFieldProps } from './FormField';

export interface CheckboxFieldProps extends FormFieldProps {
  value: boolean | undefined;
  onInput?: ((v: boolean) => void) | undefined;
  onBlur?: (() => void) | undefined;
  disabled?: boolean | undefined;
}

export const CheckboxField: Component<CheckboxFieldProps> = (props) => {
  return (
    <FormField {...props} inputId={props.fieldId}>
      <input
        type="checkbox"
        id={props.fieldId}
        class="ssf-checkbox"
        checked={props.value ?? false}
        disabled={props.disabled}
        onInput={(e) => props.onInput?.(e.currentTarget.checked)}
        onBlur={() => props.onBlur?.()}
      />
    </FormField>
  );
};

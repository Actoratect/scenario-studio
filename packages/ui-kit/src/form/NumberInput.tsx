import type { Component } from 'solid-js';
import { FormField } from './FormField';
import type { FormFieldProps } from './FormField';

export interface NumberInputProps extends FormFieldProps {
  value: number | undefined;
  onInput?: ((v: number | undefined) => void) | undefined;
  onBlur?: (() => void) | undefined;
  disabled?: boolean | undefined;
  /** integer 限定 (template の type=int) なら true。 */
  integer?: boolean | undefined;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  /** 単位ラベル (例: "cm") を suffix に出す。 */
  unit?: string | undefined;
}

export const NumberInput: Component<NumberInputProps> = (props) => {
  return (
    <FormField {...props} inputId={props.fieldId}>
      <span class="ssf-numeric">
        <input
          type="number"
          id={props.fieldId}
          class="ssf-input ssf-input--number"
          value={props.value ?? ''}
          disabled={props.disabled}
          min={props.min}
          max={props.max}
          step={props.step ?? (props.integer ? 1 : 'any')}
          onInput={(e) => {
            const raw = e.currentTarget.value;
            if (raw === '') {
              props.onInput?.(undefined);
              return;
            }
            const n = props.integer ? parseInt(raw, 10) : parseFloat(raw);
            if (Number.isNaN(n)) return;
            props.onInput?.(n);
          }}
          onBlur={() => props.onBlur?.()}
        />
        {props.unit && <span class="ssf-unit">{props.unit}</span>}
      </span>
    </FormField>
  );
};

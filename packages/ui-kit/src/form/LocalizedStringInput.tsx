import { For } from 'solid-js';
import type { Component } from 'solid-js';
import type { LocalizedString } from '@scenario-studio/core';
import { FormField } from './FormField';
import type { FormFieldProps } from './FormField';

export interface LocalizedStringInputProps extends FormFieldProps {
  value: LocalizedString | undefined;
  /** プロジェクトの locales (例: ['ja', 'en'])。順番に inputs を並べる。 */
  locales: readonly string[];
  onInput?: ((v: LocalizedString) => void) | undefined;
  onBlur?: (() => void) | undefined;
  disabled?: boolean | undefined;
}

export const LocalizedStringInput: Component<LocalizedStringInputProps> = (props) => {
  function update(locale: string, text: string): void {
    const next: LocalizedString = { ...(props.value ?? {}), [locale]: text };
    props.onInput?.(next);
  }

  return (
    <FormField {...props} inputId={`${props.fieldId}-${props.locales[0] ?? 'first'}`}>
      <div class="ssf-localized">
        <For each={props.locales}>
          {(locale) => (
            <label class="ssf-localized-row">
              <span class="ssf-localized-locale">{locale}</span>
              <input
                type="text"
                id={`${props.fieldId}-${locale}`}
                class="ssf-input"
                value={props.value?.[locale] ?? ''}
                disabled={props.disabled}
                onInput={(e) => update(locale, e.currentTarget.value)}
                onBlur={() => props.onBlur?.()}
              />
            </label>
          )}
        </For>
      </div>
    </FormField>
  );
};

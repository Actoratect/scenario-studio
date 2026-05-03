import { Show } from 'solid-js';
import type { JSX, ParentComponent } from 'solid-js';

// 全 form input の共通 wrapper。label / description / error の表示を束ねる。
// PR-B: label を LocalizedString から plain string に簡略化。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M3

export interface FormFieldProps {
  fieldId: string;
  label?: string | undefined;
  description?: string | undefined;
  error?: string | undefined;
  /** 子の input のために htmlFor で参照される id。 */
  inputId?: string | undefined;
}

export const FormField: ParentComponent<FormFieldProps> = (props) => {
  return (
    <div class="ssf-field" classList={{ 'ssf-field--error': !!props.error }}>
      <Show when={props.label}>
        {(l) => (
          <label class="ssf-label" for={props.inputId ?? props.fieldId}>
            {l()}
          </label>
        )}
      </Show>
      <div class="ssf-control">{props.children as JSX.Element}</div>
      <Show when={props.description}>{(d) => <p class="ssf-hint">{d()}</p>}</Show>
      <Show when={props.error}>{(e) => <p class="ssf-error">{e()}</p>}</Show>
    </div>
  );
};

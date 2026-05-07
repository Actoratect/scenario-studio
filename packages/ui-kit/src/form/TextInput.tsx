import { createEffect } from 'solid-js';
import type { Component } from 'solid-js';
import { FormField } from './FormField';
import type { FormFieldProps } from './FormField';

export interface TextInputProps extends FormFieldProps {
  value: string | undefined;
  onInput?: ((v: string) => void) | undefined;
  onBlur?: (() => void) | undefined;
  /** PR-AR: 右クリック時のハンドラ (AI 提案メニュー等)。 */
  onContextMenu?: ((e: MouseEvent) => void) | undefined;
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
        onContextMenu={(e) => props.onContextMenu?.(e)}
      />
    </FormField>
  );
};

/**
 * 自動リサイズ textarea。改行数に応じて高さが伸びる。
 * - CSS `field-sizing: content` (Chrome/Edge 123+) で第 1 候補
 * - JS で scrollHeight 同期する fallback (全ブラウザ)
 * - props.rows は **最小行数** として扱う (= 空でも ___rows___ 行の高さは確保)
 */
export const MultilineInput: Component<TextInputProps & { rows?: number | undefined }> = (
  props,
) => {
  let ref: HTMLTextAreaElement | undefined;

  function autoResize(): void {
    const el = ref;
    if (!el) return;
    // height: auto に戻してから scrollHeight を採用。padding/border 込みで取りたいので
    // box-sizing: border-box 前提 (CSS で既に設定済)。
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // props.value が外部から変化したとき (= 別ノード切替 / 初期 hydrate) も
  // 内容に合わせて高さを更新する。tracked: props.value だけ。
  createEffect(() => {
    // 依存登録のため props.value を読む
    void props.value;
    // DOM 反映後に scrollHeight を測りたいので microtask で 1 tick 遅らせる
    queueMicrotask(autoResize);
  });

  return (
    <FormField {...props} inputId={props.fieldId}>
      <textarea
        ref={(el) => {
          ref = el;
          queueMicrotask(autoResize);
        }}
        id={props.fieldId}
        class="ssf-textarea ssf-textarea--autosize"
        value={props.value ?? ''}
        disabled={props.disabled}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        rows={props.rows ?? 2}
        onInput={(e) => {
          autoResize();
          props.onInput?.(e.currentTarget.value);
        }}
        onBlur={() => props.onBlur?.()}
        onContextMenu={(e) => props.onContextMenu?.(e)}
      />
    </FormField>
  );
};

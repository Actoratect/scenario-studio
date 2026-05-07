import { createEffect, on } from 'solid-js';
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
 *
 * 実装方針: **JS の scrollHeight 同期のみ** (CSS `field-sizing: content` は
 * inline style の `el.style.height` と競合してかえって動かないことがあるため不採用)。
 *
 * リサイズ tigger:
 *   - 初回マウント (ref callback)
 *   - props.value 外部変化 (createEffect + on で確実に tracking)
 *   - ユーザー入力 (input イベント)
 *   - すべて `requestAnimationFrame` 経由で layout 後に scrollHeight を測る。
 */
export const MultilineInput: Component<TextInputProps & { rows?: number | undefined }> = (
  props,
) => {
  let ref: HTMLTextAreaElement | undefined;

  function autoResize(): void {
    const el = ref;
    if (!el) return;
    // height を 0 に潰してから scrollHeight を読むことで「content より小さい現在 height」
    // による誤検知を防ぐ。box-sizing: border-box 前提 (CSS 側で設定済)。
    el.style.height = '0px';
    // 強制 reflow → scrollHeight 安定
    void el.offsetHeight;
    el.style.height = `${el.scrollHeight + 2}px`; // +2 px for border buffer
  }

  // props.value が外部から変化したとき (= 別ノード切替 / 初期 hydrate / プログラマ
  // 変更) も内容に合わせて高さを更新する。on() で tracking 対象を明示。
  createEffect(
    on(
      () => props.value,
      () => {
        // DOM 更新後の layout を待ってから測る
        requestAnimationFrame(autoResize);
      },
    ),
  );

  return (
    <FormField {...props} inputId={props.fieldId}>
      <textarea
        ref={(el) => {
          ref = el;
          requestAnimationFrame(autoResize);
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

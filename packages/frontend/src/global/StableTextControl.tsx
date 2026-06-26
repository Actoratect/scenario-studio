import { createEffect } from 'solid-js';
import type { Component } from 'solid-js';

interface StableTextInputProps {
  id?: string | undefined;
  class?: string | undefined;
  type?: 'text' | 'search' | 'email' | 'url' | 'tel' | undefined;
  value?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  autofocus?: boolean | undefined;
  maxLength?: number | undefined;
  onInput?: ((value: string) => void) | undefined;
  onBlur?: (() => void) | undefined;
  onContextMenu?: ((e: MouseEvent) => void) | undefined;
  onKeyDown?: ((e: KeyboardEvent) => void) | undefined;
  onMouseDown?: ((e: MouseEvent) => void) | undefined;
}

interface StableTextareaProps {
  id?: string | undefined;
  class?: string | undefined;
  rows?: number | string | undefined;
  value?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  autofocus?: boolean | undefined;
  maxLength?: number | undefined;
  onInput?: ((value: string) => void) | undefined;
  onBlur?: (() => void) | undefined;
  onContextMenu?: ((e: MouseEvent) => void) | undefined;
  onKeyDown?: ((e: KeyboardEvent) => void) | undefined;
  onMouseDown?: ((e: MouseEvent) => void) | undefined;
}

export const StableTextInput: Component<StableTextInputProps> = (props) => {
  let ref: HTMLInputElement | undefined;
  let composing = false;

  createEffect(() => {
    const next = props.value ?? '';
    if (!ref || composing || ref.value === next) return;
    ref.value = next;
  });

  return (
    <input
      ref={(el) => {
        ref = el;
        el.value = props.value ?? '';
      }}
      id={props.id}
      type={props.type ?? 'text'}
      class={props.class}
      disabled={props.disabled}
      autofocus={props.autofocus}
      placeholder={props.placeholder}
      maxLength={props.maxLength}
      onCompositionStart={() => {
        composing = true;
      }}
      onCompositionEnd={(e) => {
        composing = false;
        props.onInput?.(e.currentTarget.value);
      }}
      onInput={(e) => {
        if (composing) return;
        props.onInput?.(e.currentTarget.value);
      }}
      onBlur={() => props.onBlur?.()}
      onContextMenu={(e) => props.onContextMenu?.(e)}
      onKeyDown={(e) => props.onKeyDown?.(e)}
      onMouseDown={(e) => props.onMouseDown?.(e)}
    />
  );
};

export const StableTextarea: Component<StableTextareaProps> = (props) => {
  let ref: HTMLTextAreaElement | undefined;
  let composing = false;

  createEffect(() => {
    const next = props.value ?? '';
    if (!ref || composing || ref.value === next) return;
    ref.value = next;
  });

  return (
    <textarea
      ref={(el) => {
        ref = el;
        el.value = props.value ?? '';
      }}
      id={props.id}
      class={props.class}
      rows={props.rows}
      disabled={props.disabled}
      autofocus={props.autofocus}
      placeholder={props.placeholder}
      maxLength={props.maxLength}
      onCompositionStart={() => {
        composing = true;
      }}
      onCompositionEnd={(e) => {
        composing = false;
        props.onInput?.(e.currentTarget.value);
      }}
      onInput={(e) => {
        if (composing) return;
        props.onInput?.(e.currentTarget.value);
      }}
      onBlur={() => props.onBlur?.()}
      onContextMenu={(e) => props.onContextMenu?.(e)}
      onKeyDown={(e) => props.onKeyDown?.(e)}
      onMouseDown={(e) => props.onMouseDown?.(e)}
    />
  );
};

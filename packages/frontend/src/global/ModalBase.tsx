import { onCleanup, onMount } from 'solid-js';
import type { JSX, ParentComponent } from 'solid-js';

// P1: モーダル/オーバーレイの共通基盤。
// 従来の各 overlay は backdrop div を素で組んでおり、
//   - Esc で閉じられない (3/14 のみ対応)
//   - role="dialog" / aria-modal が無くスクリーンリーダーに開閉が伝わらない
//   - フォーカストラップが無く Tab で背後のパネルに抜ける
//   - 閉じた後にフォーカスが戻らない
// という問題があった。既存の .ss-modal-backdrop / .ss-modal 構造をそのまま包める
// 形にして、各 overlay を数行の差し替えで移行できるようにする。

export interface ModalBaseProps {
  /** 閉じる要求 (Esc / backdrop クリック時に呼ばれる)。 */
  onClose: () => void;
  /** ダイアログ本体のクラス。既定は 'ss-modal'。 */
  dialogClass?: string;
  /** aria-labelledby に渡す見出し要素の id (無ければ aria-label を使う)。 */
  labelledBy?: string;
  /** labelledBy が無い場合の aria-label。 */
  ariaLabel?: string;
  /** backdrop クリックで閉じるか。既定 true。 */
  closeOnBackdrop?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const ModalBase: ParentComponent<ModalBaseProps> = (props) => {
  let dialogRef: HTMLDivElement | undefined;
  // 閉じた時にフォーカスを戻す先 (開いた瞬間のフォーカス要素)
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  function focusables(): HTMLElement[] {
    return dialogRef ? [...dialogRef.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
  }

  function onKeyDown(e: KeyboardEvent): void {
    // IME 変換取消の Esc でモーダルごと閉じない (isComposing = keyCode 229)
    if (e.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
      return;
    }
    if (e.key === 'Tab') {
      // フォーカストラップ: 端で折り返す
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  onMount(() => {
    // 最初のフォーカス可能要素へ (input があればそれが先頭に来る構造が多い)
    const items = focusables();
    (items[0] ?? dialogRef)?.focus();
  });

  onCleanup(() => {
    opener?.focus();
  });

  const dialog = (): JSX.Element => (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={props.labelledBy}
      aria-label={props.labelledBy ? undefined : props.ariaLabel}
      class={props.dialogClass ?? 'ss-modal'}
      tabindex="-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      {props.children}
    </div>
  );

  return (
    <div
      class="ss-modal-backdrop"
      onClick={() => {
        if (props.closeOnBackdrop !== false) props.onClose();
      }}
    >
      {dialog()}
    </div>
  );
};

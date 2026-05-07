import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Component, JSX } from 'solid-js';

// PR-AR: 右クリックメニュー (= ContextMenu) の汎用部品。
// シングルトン的に 1 つだけ画面に出すモデル。
//   - `ContextMenu.show(event, items)` で表示
//   - `ContextMenu.hide()` で閉じる
//   - 外側 click / Esc / item 選択で自動 close
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §G7

export interface ContextMenuItem {
  /** 項目 ID (key として使用)。 */
  id: string;
  /** 表示ラベル。 */
  label: string;
  /** ラベル左に表示する icon / emoji (任意)。 */
  icon?: string | undefined;
  /** ラベル右に表示する補助テキスト (ショートカット等、任意)。 */
  hint?: string | undefined;
  /** クリックされた時の動作。close は自動。 */
  onSelect: () => void;
  /** false なら disabled (薄く表示してクリック不可)。 */
  enabled?: boolean | undefined;
  /** "danger" でラベルを赤系に。 */
  variant?: 'default' | 'danger' | undefined;
}

export interface ContextMenuSeparator {
  kind: 'separator';
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface MenuState {
  x: number;
  y: number;
  entries: readonly ContextMenuEntry[];
  /** ARIA / heading 用の任意ラベル。 */
  ariaLabel?: string | undefined;
}

const [state, setState] = createSignal<MenuState | undefined>(undefined);

function isItem(e: ContextMenuEntry): e is ContextMenuItem {
  return (e as { kind?: string }).kind !== 'separator';
}

export const ContextMenu = {
  open: () => state(),
  show(event: MouseEvent, entries: readonly ContextMenuEntry[], ariaLabel?: string): void {
    event.preventDefault();
    setState({
      x: event.clientX,
      y: event.clientY,
      entries,
      ...(ariaLabel !== undefined ? { ariaLabel } : {}),
    });
  },
  hide(): void {
    setState(undefined);
  },
};

const ContextMenuUi: Component<{ s: MenuState }> = (props) => {
  let menuRef: HTMLDivElement | undefined;
  const [hover, setHover] = createSignal<number | undefined>(undefined);

  // 画面外にはみ出さないよう調整 (mount 後に rect 計測してから flip)
  const [pos, setPos] = createSignal<{ left: number; top: number }>({ left: 0, top: 0 });

  onMount(() => {
    let left = props.s.x;
    let top = props.s.y;
    const rect = menuRef?.getBoundingClientRect();
    if (rect) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (left + rect.width > w - 8) left = Math.max(8, w - rect.width - 8);
      if (top + rect.height > h - 8) top = Math.max(8, h - rect.height - 8);
    }
    setPos({ left, top });
  });

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      ContextMenu.hide();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = props.s.entries
        .map((entry, idx) => ({ entry, idx }))
        .filter((p) => isItem(p.entry) && p.entry.enabled !== false);
      if (items.length === 0) return;
      const cur = hover();
      const curIdx = items.findIndex((p) => p.idx === cur);
      const next =
        e.key === 'ArrowDown'
          ? items[(curIdx + 1 + items.length) % items.length]
          : items[(curIdx - 1 + items.length) % items.length];
      setHover(next?.idx);
      return;
    }
    if (e.key === 'Enter') {
      const idx = hover();
      if (idx === undefined) return;
      const entry = props.s.entries[idx];
      if (entry && isItem(entry) && entry.enabled !== false) {
        e.preventDefault();
        entry.onSelect();
        ContextMenu.hide();
      }
    }
  }

  onMount(() => {
    document.addEventListener('keydown', onKeyDown);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div
      class="ss-context-menu-backdrop"
      onMouseDown={() => ContextMenu.hide()}
      onContextMenu={(e) => {
        e.preventDefault();
        ContextMenu.hide();
      }}
    >
      <div
        ref={menuRef}
        class="ss-context-menu"
        style={{ left: `${pos().left}px`, top: `${pos().top}px` }}
        role="menu"
        aria-label={props.s.ariaLabel ?? '右クリックメニュー'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <For each={props.s.entries}>
          {(entry, i) => {
            if (!isItem(entry)) {
              return <div class="ss-context-menu-separator" role="separator" />;
            }
            const item = entry;
            return (
              <button
                type="button"
                class="ss-context-menu-item"
                classList={{
                  'ss-context-menu-item--danger': item.variant === 'danger',
                  'ss-context-menu-item--hover': hover() === i(),
                  'ss-context-menu-item--disabled': item.enabled === false,
                }}
                role="menuitem"
                disabled={item.enabled === false}
                onMouseEnter={() => setHover(i())}
                onClick={() => {
                  item.onSelect();
                  ContextMenu.hide();
                }}
              >
                <Show when={item.icon}>
                  <span class="ss-context-menu-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                </Show>
                <span class="ss-context-menu-label">{item.label}</span>
                <Show when={item.hint}>
                  <span class="ss-context-menu-hint">{item.hint}</span>
                </Show>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export const ContextMenuRoot: Component = (): JSX.Element => {
  return (<Show when={state()}>{(s) => <ContextMenuUi s={s()} />}</Show>) as JSX.Element;
};

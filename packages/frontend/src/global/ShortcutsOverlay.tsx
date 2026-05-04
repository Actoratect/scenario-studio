import { createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';

// キーボードショートカット一覧 overlay (PR-N)。Cmd+/ または ? で開く。
// 詳細: ../../../../Documentation/ScenarioEditor/07_window-system.md §4

const [open, setOpen] = createSignal(false);

export const ShortcutsOverlay = {
  open,
  show(): void {
    setOpen(true);
  },
  hide(): void {
    setOpen(false);
  },
  toggle(): void {
    setOpen(!open());
  },
};

interface Shortcut {
  keys: readonly string[];
  description: string;
  category: string;
}

const SHORTCUTS: readonly Shortcut[] = [
  // ナビゲーション
  { keys: ['⌘', 'K'], description: 'コマンド / 検索 palette を開く', category: 'ナビゲーション' },
  {
    keys: ['⌘', 'F'],
    description: '全文検索 (ノード fields + 脚本 text)',
    category: 'ナビゲーション',
  },
  {
    keys: ['⌘', 'I'],
    description: 'ID 一覧 (全ノードの ID をコピー / jump)',
    category: 'ナビゲーション',
  },
  { keys: ['⌘', '/'], description: 'このショートカット一覧を表示', category: 'ナビゲーション' },
  // 編集
  { keys: ['⌘', 'Z'], description: '元に戻す (Undo)', category: '編集' },
  { keys: ['⌘', 'Y'], description: 'やり直し (Redo)', category: '編集' },
  { keys: ['⌘', 'Shift', 'Z'], description: 'やり直し (Redo, 別キー)', category: '編集' },
  { keys: ['⌘', 'S'], description: '即時保存 (debounce 待たず)', category: '編集' },
  // 出力
  { keys: ['⌘', 'E'], description: 'Export ダイアログを開く', category: '出力' },
  // Script (CodeMirror 内)
  { keys: ['Tab'], description: 'AI 続き提案を確定 (ghost text 表示中)', category: 'Script' },
  {
    keys: ['Esc'],
    description: 'AI 続き提案を破棄 / 検索パネルを閉じる',
    category: 'Script',
  },
  { keys: ['⌘', 'H'], description: 'Find & Replace パネルを開く', category: 'Script' },
  { keys: ['F3'], description: '次の検索結果へ', category: 'Script' },
  { keys: ['Shift', 'F3'], description: '前の検索結果へ', category: 'Script' },
  // Graph
  { keys: ['Shift', 'Drag'], description: 'ノード間関係を作成', category: 'Graph' },
  { keys: ['Drag'], description: 'ノード位置を移動', category: 'Graph' },
  { keys: ['DblClick'], description: 'Inspector に jump', category: 'Graph' },
  { keys: ['Wheel'], description: 'Zoom in / out', category: 'Graph' },
];

const ShortcutsOverlayUi: Component = () => {
  const groups = (): ReadonlyMap<string, readonly Shortcut[]> => {
    const m = new Map<string, Shortcut[]>();
    for (const s of SHORTCUTS) {
      const arr = m.get(s.category) ?? [];
      arr.push(s);
      m.set(s.category, arr);
    }
    return m;
  };

  return (
    <div class="ss-modal-backdrop" onClick={() => ShortcutsOverlay.hide()}>
      <div class="ss-modal ss-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>キーボードショートカット</h3>
        <p class="ss-modal-caption">⌘ は Mac、Win/Linux では Ctrl です。</p>
        <For each={[...groups()]}>
          {([category, items]) => (
            <div class="ss-modal-section">
              <strong>{category}</strong>
              <ul class="ss-shortcuts-list">
                <For each={items}>
                  {(s) => (
                    <li class="ss-shortcuts-item">
                      <span class="ss-shortcuts-keys">
                        <For each={s.keys}>
                          {(k, i) => (
                            <>
                              <kbd>{k}</kbd>
                              <Show when={i() < s.keys.length - 1}>
                                <span class="ss-shortcuts-plus">+</span>
                              </Show>
                            </>
                          )}
                        </For>
                      </span>
                      <span class="ss-shortcuts-desc">{s.description}</span>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
        <div class="ss-modal-actions">
          <span class="ss-modal-spacer" />
          <button type="button" data-variant="primary" onClick={() => ShortcutsOverlay.hide()}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export const ShortcutsOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <ShortcutsOverlayUi />
    </Show>
  );
};

import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';
import { Toast } from '../services/Toast';

// グローバル コマンド/検索 palette (PR-H)。Cmd+K / Ctrl+K で開く。
// 候補: ノード / 章 / シーン / 用語 を文字列検索 → 選択で jump or 表示。
// 詳細: ../../../../Documentation/ScenarioEditor/07_window-system.md §4

type Hit =
  | { kind: 'node'; nodeId: string; label: string; sub: string }
  | { kind: 'chapter'; chapterSlug: string; label: string; sub: string }
  | { kind: 'scene'; chapterSlug: string; sceneSlug: string; label: string; sub: string }
  | { kind: 'glossary'; term: string; label: string; sub: string };

const [open, setOpen] = createSignal(false);

export const CommandPalette = {
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

const CommandPaletteUi: Component = () => {
  const [query, setQuery] = createSignal('');
  const [activeIdx, setActiveIdx] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  const hits = createMemo<readonly Hit[]>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return [];
    const q = query().trim().toLowerCase();
    const all: Hit[] = [];

    for (const n of ctx.project.nodes.values()) {
      const display = typeof n.fields['display_name'] === 'string' ? n.fields['display_name'] : '';
      const reading = typeof n.fields['reading'] === 'string' ? n.fields['reading'] : '';
      const dev = typeof n.fields['dev_name'] === 'string' ? n.fields['dev_name'] : '';
      const haystack = `${n.slug} ${display} ${reading} ${dev}`.toLowerCase();
      if (q === '' || haystack.includes(q)) {
        all.push({
          kind: 'node',
          nodeId: n.id,
          label: display || n.slug,
          sub: `node · ${n.templateId.replace(/^template\./, '')} · ${n.slug}`,
        });
      }
    }
    for (const ch of ctx.project.scenario.chapters) {
      if (q === '' || `${ch.title} ${ch.slug}`.toLowerCase().includes(q)) {
        all.push({
          kind: 'chapter',
          chapterSlug: ch.slug,
          label: ch.title,
          sub: `chapter · ${ch.slug}`,
        });
      }
      for (const sc of ch.scenes) {
        if (q === '' || `${sc.title} ${sc.slug} ${ch.title}`.toLowerCase().includes(q)) {
          all.push({
            kind: 'scene',
            chapterSlug: ch.slug,
            sceneSlug: sc.slug,
            label: sc.title,
            sub: `scene · ${ch.slug}/${sc.slug}`,
          });
        }
      }
    }
    for (const t of ctx.project.glossary) {
      if (q === '' || `${t.term} ${t.aliases.join(' ')}`.toLowerCase().includes(q)) {
        all.push({
          kind: 'glossary',
          term: t.term,
          label: t.term,
          sub: `glossary${t.aliases.length > 0 ? ' · alt: ' + t.aliases.join(', ') : ''}`,
        });
      }
    }
    return all.slice(0, 50);
  });

  function activate(hit: Hit): void {
    switch (hit.kind) {
      case 'node':
        SelectionContext.selectNode(hit.nodeId as never);
        break;
      case 'chapter':
        Toast.info(`章: ${hit.label} (Outline で表示)`);
        break;
      case 'scene':
        Toast.info(
          `シーン: ${hit.chapterSlug}/${hit.sceneSlug} (Script パネルでドロップダウン選択)`,
        );
        break;
      case 'glossary':
        Toast.info(`用語: ${hit.term} (Glossary パネルで参照)`);
        break;
    }
    CommandPalette.hide();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      CommandPalette.hide();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      const max = hits().length - 1;
      setActiveIdx(Math.min(activeIdx() + 1, max));
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowUp') {
      setActiveIdx(Math.max(activeIdx() - 1, 0));
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      const h = hits()[activeIdx()];
      if (h) activate(h);
      e.preventDefault();
    }
  }

  onMount(() => {
    inputRef?.focus();
    inputRef?.addEventListener('keydown', onKey);
  });
  onCleanup(() => {
    inputRef?.removeEventListener('keydown', onKey);
  });

  return (
    <div class="ss-modal-backdrop" onClick={() => CommandPalette.hide()}>
      <div class="ss-cmd-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          class="ss-cmd-palette-input"
          placeholder="ノード / 章 / シーン / 用語を検索…"
          value={query()}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setActiveIdx(0);
          }}
        />
        <Show when={hits().length === 0}>
          <p class="ss-cmd-palette-empty">該当なし</p>
        </Show>
        <ul class="ss-cmd-palette-list">
          <For each={hits()}>
            {(hit, i) => (
              <li
                classList={{
                  'ss-cmd-palette-item': true,
                  'ss-cmd-palette-item--active': i() === activeIdx(),
                }}
                onClick={() => activate(hit)}
                onMouseMove={() => setActiveIdx(i())}
              >
                <span class="ss-cmd-palette-label">{hit.label}</span>
                <span class="ss-cmd-palette-sub">{hit.sub}</span>
              </li>
            )}
          </For>
        </ul>
        <div class="ss-cmd-palette-footer">
          <kbd>↑↓</kbd> 移動 · <kbd>Enter</kbd> 選択 · <kbd>Esc</kbd> 閉じる
        </div>
      </div>
    </div>
  );
};

export const CommandPaletteRoot: Component = () => {
  return (
    <Show when={open()}>
      <CommandPaletteUi />
    </Show>
  );
};

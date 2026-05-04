import {
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import type { Component } from 'solid-js';
import type { ScenarioNode } from '@scenario-studio/core';
import { PanelFocus } from '../services/PanelFocus';
import { ProjectService } from '../services/ProjectService';
import { SceneSelection } from '../services/SceneSelection';
import { SelectionContext } from '../services/SelectionContext';

// 全文検索 overlay (PR-T)。Cmd+F / Ctrl+F で起動。
// CommandPalette がメタ検索 (slug / display_name 等) なのに対し、こちらは
// ノードの全フィールド + 全シーンの script text を文字列マッチ。
// 詳細: ../../../../Documentation/ScenarioEditor/07_window-system.md §4

const [open, setOpen] = createSignal(false);

export const SearchOverlay = {
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

type Hit =
  | {
      kind: 'node-field';
      nodeId: string;
      nodeLabel: string;
      fieldId: string;
      snippet: string;
    }
  | {
      kind: 'scene-line';
      chapterSlug: string;
      sceneSlug: string;
      sceneTitle: string;
      lineIdx: number;
      snippet: string;
    };

const SearchOverlayUi: Component = () => {
  const [query, setQuery] = createSignal('');
  const [activeIdx, setActiveIdx] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  // ノードのフィールドを文字列で総ナメ
  const nodeHits = createMemo<readonly Hit[]>(() => {
    const ctx = ProjectService.currentProject();
    const q = query().trim();
    if (!ctx || q === '') return [];
    const lower = q.toLowerCase();
    const out: Hit[] = [];
    for (const node of ctx.project.nodes.values()) {
      for (const [fieldId, value] of Object.entries(node.fields)) {
        if (typeof value !== 'string') continue;
        if (!value.toLowerCase().includes(lower)) continue;
        out.push({
          kind: 'node-field',
          nodeId: node.id,
          nodeLabel: nodeLabel(node),
          fieldId,
          snippet: makeSnippet(value, lower),
        });
        if (out.length >= 100) return out;
      }
    }
    return out;
  });

  // シーンの script.text を非同期で総ナメ
  const [sceneHits] = createResource(query, async (q): Promise<readonly Hit[]> => {
    const ctx = ProjectService.currentProject();
    const trimmed = q.trim();
    if (!ctx || trimmed === '') return [];
    const lower = trimmed.toLowerCase();
    const out: Hit[] = [];
    for (const ch of ctx.project.scenario.chapters) {
      for (const sc of ch.scenes) {
        const path = `Scenarios/${ch.slug}/${sc.relativePath}`;
        if (!(await ctx.adapter.exists(ctx.handle, path))) continue;
        try {
          const text = await ctx.adapter.read(ctx.handle, path);
          // 雑な行 splitting で十分 (YAML 構文に依存せず "text:" 行の値を拾う)
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] ?? '';
            // text: "..." を優先抽出。それ以外でも match 行は表示
            if (line.toLowerCase().includes(lower)) {
              out.push({
                kind: 'scene-line',
                chapterSlug: ch.slug,
                sceneSlug: sc.slug,
                sceneTitle: sc.title,
                lineIdx: i,
                snippet: makeSnippet(line.trim(), lower),
              });
              if (out.length >= 100) return out;
            }
          }
        } catch {
          // skip
        }
      }
    }
    return out;
  });

  const allHits = createMemo<readonly Hit[]>(() => {
    return [...nodeHits(), ...(sceneHits() ?? [])];
  });

  function activate(hit: Hit): void {
    if (hit.kind === 'node-field') {
      SelectionContext.selectNode(hit.nodeId as never);
      PanelFocus.focus('inspector-1');
    } else {
      SceneSelection.select({
        chapterSlug: hit.chapterSlug,
        sceneSlug: hit.sceneSlug,
        label: hit.sceneTitle,
      });
      PanelFocus.focus('script-1');
    }
    SearchOverlay.hide();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      SearchOverlay.hide();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      const max = allHits().length - 1;
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
      const h = allHits()[activeIdx()];
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
    <div class="ss-modal-backdrop" onClick={() => SearchOverlay.hide()}>
      <div class="ss-cmd-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          class="ss-cmd-palette-input"
          placeholder="全文検索 — ノード fields + 脚本 text…"
          value={query()}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setActiveIdx(0);
          }}
        />
        <Show when={query().trim() === ''}>
          <p class="ss-cmd-palette-empty">検索ワードを入力</p>
        </Show>
        <Show when={query().trim() !== '' && allHits().length === 0 && !sceneHits.loading}>
          <p class="ss-cmd-palette-empty">該当なし</p>
        </Show>
        <ul class="ss-cmd-palette-list">
          <For each={allHits()}>
            {(hit, i) => (
              <li
                classList={{
                  'ss-cmd-palette-item': true,
                  'ss-cmd-palette-item--active': i() === activeIdx(),
                }}
                onClick={() => activate(hit)}
                onMouseMove={() => setActiveIdx(i())}
              >
                <Switch>
                  <Match when={hit.kind === 'node-field'}>
                    <span class="ss-cmd-palette-label">
                      <span class="ss-search-kind ss-search-kind--node">node</span>{' '}
                      {(hit as { nodeLabel: string }).nodeLabel} ·{' '}
                      <code>{(hit as { fieldId: string }).fieldId}</code>
                    </span>
                  </Match>
                  <Match when={hit.kind === 'scene-line'}>
                    <span class="ss-cmd-palette-label">
                      <span class="ss-search-kind ss-search-kind--scene">scene</span>{' '}
                      {(hit as { sceneTitle: string }).sceneTitle} ·{' '}
                      <code>L{(hit as { lineIdx: number }).lineIdx + 1}</code>
                    </span>
                  </Match>
                </Switch>
                {/* eslint-disable-next-line solid/no-innerhtml */}
                <span class="ss-cmd-palette-sub" innerHTML={hit.snippet} />
              </li>
            )}
          </For>
        </ul>
        <div class="ss-cmd-palette-footer">
          <kbd>↑↓</kbd> 移動 · <kbd>Enter</kbd> jump · <kbd>Esc</kbd> 閉じる ·
          <Show when={sceneHits.loading}>
            {' '}
            <em>scenes 検索中…</em>
          </Show>
        </div>
      </div>
    </div>
  );
};

function nodeLabel(n: ScenarioNode): string {
  const d = n.fields['display_name'];
  if (typeof d === 'string' && d !== '') return d;
  return n.slug;
}

function makeSnippet(text: string, lowerQuery: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(lowerQuery);
  if (idx < 0) return escapeHtml(text.slice(0, 80));
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + lowerQuery.length + 40);
  const before = text.slice(start, idx);
  const match = text.slice(idx, idx + lowerQuery.length);
  const after = text.slice(idx + lowerQuery.length, end);
  return (
    (start > 0 ? '…' : '') +
    escapeHtml(before) +
    '<mark>' +
    escapeHtml(match) +
    '</mark>' +
    escapeHtml(after) +
    (end < text.length ? '…' : '')
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const SearchOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <SearchOverlayUi />
    </Show>
  );
};

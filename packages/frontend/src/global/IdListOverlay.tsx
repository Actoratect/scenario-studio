import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { ScenarioNode } from '@scenario-studio/core';
import { PanelFocus } from '../services/PanelFocus';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';
import { Toast } from '../services/Toast';

// ノード ID 一覧 overlay (PR-Y)。Cmd+I で起動。
// 全ノードの「内部 ID (ULID) / slug / display_name / dev_name (脚本参照名)」を
// 表で並べ、ID をクリック / コピー / Inspector jump できる。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md

const [open, setOpen] = createSignal(false);

export const IdListOverlay = {
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

interface Row {
  node: ScenarioNode;
  display: string;
  devName: string;
  templateLabel: string;
}

const IdListOverlayUi: Component = () => {
  const [filter, setFilter] = createSignal('');
  let inputRef: HTMLInputElement | undefined;

  const rows = createMemo<readonly Row[]>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return [];
    const q = filter().trim().toLowerCase();
    const out: Row[] = [];
    for (const node of ctx.project.nodes.values()) {
      const display =
        typeof node.fields['display_name'] === 'string'
          ? (node.fields['display_name'] as string)
          : node.slug;
      const devName =
        typeof node.fields['dev_name'] === 'string' && node.fields['dev_name'] !== ''
          ? (node.fields['dev_name'] as string)
          : node.slug;
      const templateLabel =
        ctx.templates.tryGet(node.templateId as never)?.displayName ?? node.templateId;
      const haystack =
        `${node.id} ${node.slug} ${display} ${devName} ${templateLabel}`.toLowerCase();
      if (q !== '' && !haystack.includes(q)) continue;
      out.push({ node, display, devName, templateLabel });
    }
    return out.sort(
      (a, b) =>
        a.templateLabel.localeCompare(b.templateLabel) || a.devName.localeCompare(b.devName),
    );
  });

  function jumpToNode(node: ScenarioNode): void {
    SelectionContext.selectNode(node.id as never);
    PanelFocus.focus('inspector-1');
    IdListOverlay.hide();
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      Toast.success(`コピー: ${text}`, 1500);
    } catch (e) {
      Toast.error(`コピー失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      IdListOverlay.hide();
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
    <div class="ss-modal-backdrop" onClick={() => IdListOverlay.hide()}>
      <div class="ss-modal ss-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>ID 一覧 — 全ノード</h3>
        <p class="ss-modal-caption">
          脚本の <code>who:</code> で参照する <strong>ID</strong> 列、内部識別子の{' '}
          <strong>NodeId</strong> 列、表示名 列。クリックで Inspector に jump。
        </p>
        <input
          ref={inputRef}
          type="text"
          class="ss-cmd-palette-input"
          placeholder="フィルタ — slug / 名前 / ID で絞り込み"
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
        <Show when={rows().length === 0}>
          <p class="ss-cmd-palette-empty">該当なし</p>
        </Show>
        <Show when={rows().length > 0}>
          <table class="ss-id-table">
            <thead>
              <tr>
                <th>テンプレ</th>
                <th>名前</th>
                <th>ID (脚本)</th>
                <th>NodeId (内部)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(r) => (
                  <tr>
                    <td>
                      <span class="ss-id-table-template">{r.templateLabel}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="ss-id-table-jump"
                        onClick={() => jumpToNode(r.node)}
                      >
                        {r.display}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="ss-id-table-copy"
                        onClick={() => void copy(r.devName)}
                        title={`「${r.devName}」をコピー`}
                      >
                        <code>{r.devName}</code>
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="ss-id-table-copy ss-id-table-copy--mono"
                        onClick={() => void copy(r.node.id)}
                        title="NodeId (ULID) をコピー"
                      >
                        <code>{r.node.id}</code>
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="ss-id-table-inspector"
                        onClick={() => jumpToNode(r.node)}
                      >
                        →
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
        <div class="ss-modal-actions">
          <span class="ss-modal-spacer" />
          <button type="button" data-variant="primary" onClick={() => IdListOverlay.hide()}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export const IdListOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <IdListOverlayUi />
    </Show>
  );
};

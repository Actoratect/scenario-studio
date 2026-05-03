import { createMemo, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  CHARACTER_TEMPLATE,
  createNode,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  LOCATION_TEMPLATE,
  type ScenarioNode,
  type TemplateDefinition,
} from '@scenario-studio/core';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';

// M3 暫定の Outliner: テンプレート別にグループ分けしたノード一覧。
// クリックで SelectionContext.selectNode → Inspector が反応。
// 真の章 / シーン階層 Outliner は M4 で本実装。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §4.3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M3, M4

const NEW_NODE_TEMPLATES: ReadonlyArray<{ template: TemplateDefinition; label: string }> = [
  { template: CHARACTER_TEMPLATE, label: 'Character' },
  { template: LOCATION_TEMPLATE, label: 'Location' },
  { template: ITEM_TEMPLATE, label: 'Item' },
  { template: FACTION_TEMPLATE, label: 'Faction' },
];

export const OutlinePanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [busy, setBusy] = createSignal(false);
  const grouped = createMemo(() => {
    const ctx = ProjectService.currentProject();
    const groups = new Map<string, ScenarioNode[]>();
    if (!ctx) return groups;
    for (const t of ctx.templates.list()) groups.set(t.id, []);
    for (const node of ctx.project.nodes.values()) {
      const arr = groups.get(node.templateId) ?? [];
      arr.push(node);
      groups.set(node.templateId, arr);
    }
    for (const arr of groups.values()) arr.sort((a, b) => a.slug.localeCompare(b.slug));
    return groups;
  });

  async function addNode(template: TemplateDefinition): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setBusy(true);
    try {
      const slug = `new_${template.directory.replace(/s$/, '')}_${Date.now().toString(36)}`;
      const node = createNode(ctx.templates, { templateId: template.id, slug });
      await ctx.nodeRepository.save(node);
      // ProjectModel.nodes は ReadonlyMap として公開しているが、M3 では in-place 拡張を許容
      const next = new Map(ctx.project.nodes);
      next.set(node.id, node);
      Object.assign(ctx.project, { nodes: next });
      ctx.history.register(node);
      SelectionContext.selectNode(node.id);
    } catch (e) {
      console.error('addNode failed', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="panel-content panel-outline">
      <header class="panel-outline-header">
        <span>
          Nodes (M3 暫定一覧) · <code>{params.api.id}</code>
        </span>
        <div class="panel-outline-actions">
          <For each={NEW_NODE_TEMPLATES}>
            {(t) => (
              <button disabled={busy()} onClick={() => void addNode(t.template)}>
                + {t.label}
              </button>
            )}
          </For>
        </div>
      </header>
      <div class="panel-outline-list">
        <For each={ProjectService.currentProject()?.templates.list() ?? []}>
          {(template) => {
            const items = () => grouped().get(template.id) ?? [];
            return (
              <Show when={items().length > 0}>
                <h3 class="panel-outline-group">{template.displayName['ja'] ?? template.id}</h3>
                <ul>
                  <For each={items()}>
                    {(node) => (
                      <li>
                        <button
                          class="panel-outline-node"
                          classList={{
                            'panel-outline-node--selected':
                              SelectionContext.selectedNodeId() === node.id,
                          }}
                          onClick={() => SelectionContext.selectNode(node.id)}
                        >
                          {node.slug}
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            );
          }}
        </For>
        <Show when={(ProjectService.currentProject()?.project.nodes.size ?? 0) === 0}>
          <p class="panel-outline-empty">
            まだノードがありません。上のボタンから追加してください。
          </p>
        </Show>
      </div>
    </div>
  );
};

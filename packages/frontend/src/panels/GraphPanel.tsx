import { createMemo, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  computeRelationshipLens,
  deterministicCircularLayout,
  type NodeId,
} from '@scenario-studio/core';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';
import { LensCanvas } from '../graph/LensCanvas';

// Relationship Lens の本実装 (M5)。
// 全 ScenarioNode + node_ref フィールド由来 edges を solid-flow に渡す。
// クリック → SelectionContext.selectNode → Inspector に反映。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M5

export const GraphPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const lens = createMemo(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    return computeRelationshipLens(ctx.project.nodes, ctx.templates);
  });

  const positions = createMemo(() => {
    const l = lens();
    if (!l) return new Map();
    return deterministicCircularLayout(l, {
      centerX: 600,
      centerY: 400,
      radius: 200,
      templateOffset: 110,
    });
  });

  return (
    <div class="panel-content panel-graph">
      <header class="panel-graph-header">
        <span>
          Relationship Lens · <code>{params.api.id}</code>
        </span>
        <Show when={lens()}>
          {(l) => (
            <span class="panel-graph-stats">
              {l().nodes.length} nodes · {l().edges.length} edges
            </span>
          )}
        </Show>
      </header>
      <div class="panel-graph-canvas">
        <Show
          when={lens() && lens()!.nodes.length > 0}
          fallback={
            <div class="panel-graph-empty">
              <p>ノードがありません。Outline で追加してください。</p>
            </div>
          }
        >
          <LensCanvas
            payload={lens()!}
            positions={positions() as ReadonlyMap<NodeId, { x: number; y: number }>}
            onSelect={(id) => SelectionContext.selectNode(id)}
            selected={SelectionContext.selectedNodeId()}
          />
        </Show>
      </div>
    </div>
  );
};

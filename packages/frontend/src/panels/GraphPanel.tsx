import { createMemo, createSignal, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  computeRelationshipLens,
  deterministicCircularLayout,
  resolveNode,
  type NodeId,
} from '@scenario-studio/core';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';
import { EraContext } from '../services/EraContext';
import { LensCanvas } from '../graph/LensCanvas';
import { GraphPositions } from '../graph/graph-positions';

// Relationship Lens 本実装 (M5) + PR-C 編集機能拡張。
// - drag でノード位置を更新 → GraphPositions に永続化 (localStorage)
// - dblclick で Inspector ジャンプ
// - Era フィルタトグル (有効時、現 Era で isAlive=false のノードを薄く)
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M5

export const GraphPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [eraFilterOn, setEraFilterOn] = createSignal(false);

  const lens = createMemo(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    return computeRelationshipLens(ctx.project.nodes, ctx.templates);
  });

  // 自動レイアウト位置 (初期値) — drag で個別に上書き、stored 位置 > stored で無いならこれ。
  const fallbackPositions = createMemo(() => {
    const l = lens();
    if (!l) return new Map<NodeId, { x: number; y: number }>();
    return deterministicCircularLayout(l, {
      centerX: 600,
      centerY: 400,
      radius: 200,
      templateOffset: 110,
    });
  });

  /** stored 位置を優先、無ければ自動レイアウトにフォールバック。 */
  const positions = createMemo<ReadonlyMap<NodeId, { x: number; y: number }>>(() => {
    const stored = GraphPositions.positions();
    const fallback = fallbackPositions();
    const merged = new Map<NodeId, { x: number; y: number }>();
    for (const [id, p] of fallback) merged.set(id, p);
    for (const [id, p] of stored) merged.set(id, p);
    return merged;
  });

  /** Era フィルタが ON のとき、現 Era で isAlive=false のノードを dimmed 集合へ。 */
  const dimmed = createMemo<ReadonlySet<NodeId>>(() => {
    if (!eraFilterOn() || EraContext.isBase()) return new Set();
    const ctx = ProjectService.currentProject();
    if (!ctx) return new Set();
    const out = new Set<NodeId>();
    for (const node of ctx.project.nodes.values()) {
      const r = resolveNode(node, EraContext.currentEraId(), ctx.project.eras);
      if (r.isAlive === false) out.add(node.id);
    }
    return out;
  });

  function activate(id: NodeId): void {
    SelectionContext.selectNode(id);
    // dblclick = 「Inspector に注目」— select は単 click でも反映するが、
    // ここでは将来 Inspector パネルにフォーカスを当てるためのフックを残す
    // (Phase 1 後半: dockview の panel.api.setActive() を呼ぶ)
  }

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
        <label class="panel-graph-era-toggle" title="現 Era で生存していないノードを薄く表示">
          <input
            type="checkbox"
            checked={eraFilterOn()}
            disabled={EraContext.isBase()}
            onChange={(e) => setEraFilterOn(e.currentTarget.checked)}
          />
          Era フィルタ
          <Show when={EraContext.isBase()}>
            <span class="panel-graph-hint"> (Era を選択すると有効)</span>
          </Show>
        </label>
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
            positions={positions()}
            onSelect={(id) => SelectionContext.selectNode(id)}
            onActivate={activate}
            onPositionChange={(id, p) => GraphPositions.setPosition(id, p)}
            selected={SelectionContext.selectedNodeId()}
            dimmed={dimmed()}
          />
        </Show>
      </div>
    </div>
  );
};

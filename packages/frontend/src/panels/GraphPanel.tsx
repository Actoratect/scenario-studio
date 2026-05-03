import { createMemo, createSignal, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  computeRelationshipLens,
  deterministicCircularLayout,
  resolveNode,
  type LensEdge,
  type NodeId,
  type RelationId,
  type RelationType,
} from '@scenario-studio/core';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';
import { EraContext } from '../services/EraContext';
import { RelationsService } from '../services/RelationsService';
import { LensCanvas } from '../graph/LensCanvas';
import { RelationTypePicker } from '../graph/RelationTypePicker';
import { GraphPositions } from '../graph/graph-positions';

// Relationship Lens 本実装 (M5) + PR-C/E 編集機能。
// - ノード drag で位置 (PR-C)
// - dblclick で Inspector 注目 (PR-C)
// - Era フィルタ (PR-C)
// - Shift+drag でノード間関係を新規作成 → RelationTypePicker (PR-E)
// - explicit edge ラベルクリックで type 変更 / 削除 picker (PR-E)
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md

interface PendingPicker {
  source: NodeId;
  target: NodeId;
  caption: string;
}

interface EditingPicker {
  relationId: RelationId;
  current: { type: RelationType; label?: string };
  caption: string;
}

export const GraphPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [eraFilterOn, setEraFilterOn] = createSignal(false);
  const [pending, setPending] = createSignal<PendingPicker | undefined>(undefined);
  const [editing, setEditing] = createSignal<EditingPicker | undefined>(undefined);

  const lens = createMemo(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    return computeRelationshipLens(ctx.project.nodes, ctx.templates, ctx.project.relations);
  });

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

  const positions = createMemo<ReadonlyMap<NodeId, { x: number; y: number }>>(() => {
    const stored = GraphPositions.positions();
    const fallback = fallbackPositions();
    const merged = new Map<NodeId, { x: number; y: number }>();
    for (const [id, p] of fallback) merged.set(id, p);
    for (const [id, p] of stored) merged.set(id, p);
    return merged;
  });

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

  function nodeLabel(id: NodeId): string {
    return lens()?.nodes.find((n) => n.id === id)?.label ?? id;
  }

  function activate(id: NodeId): void {
    SelectionContext.selectNode(id);
  }

  function startCreate(source: NodeId, target: NodeId): void {
    setPending({
      source,
      target,
      caption: `${nodeLabel(source)} → ${nodeLabel(target)}`,
    });
  }

  function startEdit(edge: LensEdge): void {
    if (edge.kind !== 'explicit' || !edge.relationId || !edge.relationType) return;
    setEditing({
      relationId: edge.relationId,
      current: { type: edge.relationType, label: edge.label },
      caption: `${nodeLabel(edge.source)} → ${nodeLabel(edge.target)}`,
    });
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
        <span class="panel-graph-hint" title="ノードを Shift+ドラッグで関係を作成">
          ⓘ Shift+drag で関係作成
        </span>
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
            onCreateRelation={startCreate}
            onEdgeClick={startEdit}
            selected={SelectionContext.selectedNodeId()}
            dimmed={dimmed()}
          />
        </Show>
      </div>

      <RelationTypePicker
        open={!!pending()}
        canDelete={false}
        caption={pending()?.caption}
        onClose={() => setPending(undefined)}
        onSubmit={(input) => {
          const p = pending();
          if (!p) return;
          void RelationsService.add({
            source: p.source,
            target: p.target,
            type: input.type,
          }).then((rel) => {
            if (rel && input.label) void RelationsService.setLabel(rel.id, input.label);
          });
        }}
      />
      <RelationTypePicker
        open={!!editing()}
        canDelete={true}
        caption={editing()?.caption}
        initial={editing()?.current}
        onClose={() => setEditing(undefined)}
        onSubmit={(input) => {
          const e = editing();
          if (!e) return;
          void RelationsService.setType(e.relationId, input.type);
          void RelationsService.setLabel(e.relationId, input.label);
        }}
        onDelete={() => {
          const e = editing();
          if (!e) return;
          void RelationsService.remove(e.relationId);
        }}
      />
    </div>
  );
};

import { createMemo, createSignal, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  computePlotFlowLens,
  computeRelationshipLens,
  deterministicCircularLayout,
  resolveNode,
  type LensEdge,
  type LensPayload,
  type NodeId,
  type PlotFlowAnalysis,
  type RelationId,
  type RelationType,
} from '@scenario-studio/core';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';
import { EraContext } from '../services/EraContext';
import { LintService } from '../services/LintService';
import { PanelFocus } from '../services/PanelFocus';
import { RelationsService } from '../services/RelationsService';
import { SceneSelection } from '../services/SceneSelection';
import { ThumbnailService } from '../services/ThumbnailService';
import { LensCanvas } from '../graph/LensCanvas';
import { RelationTypePicker } from '../graph/RelationTypePicker';
import { GraphPositions } from '../graph/graph-positions';
import { createResource } from 'solid-js';

// Relationship Lens 本実装 (M5) + PR-C/E 編集機能。
// - ノード drag で位置 (PR-C)
// - dblclick で Inspector 注目 (PR-C)
// - Era フィルタ (PR-C)
// - Shift+drag でノード間関係を新規作成 → RelationTypePicker (PR-E)
// - explicit edge ラベルクリックで type 変更 / 削除 picker (PR-E)
// - PR-AV: Lens 切替 (Relationship | Plot Flow)。Plot Flow は scene transition graph
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md,
//       ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §C

type LensMode = 'relationship' | 'plot-flow';
const LENS_MODE_KEY = 'scenario-studio:graph-lens-mode';

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

function loadLensMode(): LensMode {
  if (typeof localStorage === 'undefined') return 'relationship';
  const v = localStorage.getItem(LENS_MODE_KEY);
  return v === 'plot-flow' ? 'plot-flow' : 'relationship';
}

function saveLensMode(m: LensMode): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LENS_MODE_KEY, m);
  } catch {
    /* quota / private mode */
  }
}

export const GraphPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [eraFilterOn, setEraFilterOn] = createSignal(false);
  const [pending, setPending] = createSignal<PendingPicker | undefined>(undefined);
  const [editing, setEditing] = createSignal<EditingPicker | undefined>(undefined);
  const [lensMode, setLensMode] = createSignal<LensMode>(loadLensMode());

  function setLensModeAndPersist(m: LensMode): void {
    setLensMode(m);
    saveLensMode(m);
  }

  /** Plot Flow 用の解析 (unreachable / unresolved transitions も含む) */
  const plotFlowAnalysis = createMemo<PlotFlowAnalysis | undefined>(() => {
    if (lensMode() !== 'plot-flow') return undefined;
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    const scenes = LintService.scenes();
    if (!scenes) return undefined;
    return computePlotFlowLens({
      chapters: ctx.project.scenario.chapters,
      scenes,
    });
  });

  const lens = createMemo<LensPayload | undefined>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    if (lensMode() === 'plot-flow') {
      return plotFlowAnalysis()?.payload;
    }
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

  // 各ノードのサムネイル URL を解決 (PR-Q)。lens 変化時に再計算。
  const [thumbnailUrls] = createResource(
    () => lens(),
    async (l) => {
      if (!l) return new Map<NodeId, string>();
      const out = new Map<NodeId, string>();
      for (const n of l.nodes) {
        if (!n.thumbnail) continue;
        const url = await ThumbnailService.resolveUrl(n.thumbnail);
        if (url) out.set(n.id, url);
      }
      return out;
    },
  );

  const dimmed = createMemo<ReadonlySet<NodeId>>(() => {
    // PR-AV: Plot Flow モードでは「到達不能シーン」を dimmed
    if (lensMode() === 'plot-flow') {
      const a = plotFlowAnalysis();
      return new Set(a?.unreachable ?? []);
    }
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
    if (lensMode() === 'plot-flow') {
      // Plot Flow ノードは "plot.<chapter>.<scene>" 形式 → ScriptPanel に jump
      const m = /^plot\.([^.]+)\.(.+)$/.exec(id);
      if (m && m[1] && m[2]) {
        const ctx = ProjectService.currentProject();
        const chapterSlug = m[1];
        const sceneSlug = m[2];
        if (ctx) {
          const ch = ctx.project.scenario.chapters.find((c) => c.slug === chapterSlug);
          const sc = ch?.scenes.find((s) => s.slug === sceneSlug);
          if (ch && sc) {
            SceneSelection.select({ chapterSlug, sceneSlug, label: sc.title });
            PanelFocus.focus('script-1');
            return;
          }
        }
      }
      return;
    }
    SelectionContext.selectNode(id);
  }

  function startCreate(source: NodeId, target: NodeId): void {
    // PR-AV: Plot Flow モードでは関係作成を無効化 (scene transition は YAML 直接編集で)
    if (lensMode() === 'plot-flow') return;
    setPending({
      source,
      target,
      caption: `${nodeLabel(source)} → ${nodeLabel(target)}`,
    });
  }

  function startEdit(edge: LensEdge): void {
    if (lensMode() === 'plot-flow') return;
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
        <span class="panel-graph-lens-toggle">
          <button
            type="button"
            classList={{ active: lensMode() === 'relationship' }}
            onClick={() => setLensModeAndPersist('relationship')}
            title="ノード間の関係性を表示 (キャラ / 場所 / 派閥)"
          >
            🕸 Relationship
          </button>
          <button
            type="button"
            classList={{ active: lensMode() === 'plot-flow' }}
            onClick={() => setLensModeAndPersist('plot-flow')}
            title="シーン間の遷移を表示 (next / choice goto / 到達不能 警告)"
          >
            🗺 Plot Flow
          </button>
        </span>
        <Show when={lens()}>
          {(l) => (
            <span class="panel-graph-stats">
              {l().nodes.length} nodes · {l().edges.length} edges
            </span>
          )}
        </Show>
        <Show when={lensMode() === 'plot-flow' && plotFlowAnalysis()}>
          {(a) => (
            <Show when={a().unreachable.length > 0 || a().unresolvedTransitions.length > 0}>
              <span
                class="panel-graph-hint panel-graph-warn"
                title={`到達不能 ${a().unreachable.length} / 解決失敗 ${a().unresolvedTransitions.length}`}
              >
                ⚠ {a().unreachable.length + a().unresolvedTransitions.length}
              </span>
            </Show>
          )}
        </Show>
        <Show when={lensMode() === 'relationship'}>
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
        </Show>
        <Show when={lensMode() === 'plot-flow'}>
          <span class="panel-graph-hint">
            ノードクリックで Script に jump · 「次へ」=暗黙 next / 線=choice goto
          </span>
        </Show>
        <code class="panel-graph-id">{params.api.id}</code>
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
            thumbnailUrls={thumbnailUrls() ?? new Map()}
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

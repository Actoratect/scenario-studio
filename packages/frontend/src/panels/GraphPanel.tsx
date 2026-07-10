import { createMemo, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  CHARACTER_TEMPLATE,
  computePlotFlowLens,
  computeRelationshipLens,
  createNode,
  deterministicCircularLayout,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  LOCATION_TEMPLATE,
  plotFlowRowLayout,
  resolveNode,
  type LensEdge,
  type LensPayload,
  type NodeId,
  type PlotBoardEdgeId,
  type PlotBoardNodeId,
  type PlotFlowAnalysis,
  type RelationId,
  type TemplateDefinition,
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
import { PlotBoardCanvas } from '../graph/PlotBoardCanvas';
import { RelationTypePicker } from '../graph/RelationTypePicker';
import { PlotEdgeEditor } from '../graph/PlotEdgeEditor';
import { GraphComments } from '../graph/graph-comments';
import { GraphPositions } from '../graph/graph-positions';
import { PlotFlowEdges } from '../graph/plot-flow-edges';
import { QuickNodeCreator, QuickSceneCreator } from '../graph/QuickCreatePopover';
import { Toast } from '../services/Toast';
import { PlotBoardService } from '../services/PlotBoardService';
import { createResource } from 'solid-js';

// Relationship Lens 本実装 (M5) + PR-C/E 編集機能。
// - ノード drag で位置 (PR-C)
// - dblclick で Inspector 注目 (PR-C)
// - Era フィルタ (PR-C)
// - Shift+drag でノード間関係を新規作成 → RelationTypePicker (PR-E)
// - explicit edge ラベルクリックで type 変更 / 削除 picker (PR-E)
// - PR-AN: テンプレ別 visibility filter + ノード検索 (label / slug match)
// - PR-AV: Lens 切替 (Relationship | Plot Flow)。Plot Flow は scene transition graph
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md,
//       ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §C

type LensMode = 'relationship' | 'plot-flow' | 'plot-board';
const LENS_MODE_KEY = 'scenario-studio:graph-lens-mode';
const NODE_SIZE_KEY = 'scenario-studio:graph-node-size';

const TEMPLATE_TOGGLES: ReadonlyArray<{ id: string; label: string; emoji: string }> = [
  { id: CHARACTER_TEMPLATE.id, label: 'キャラ', emoji: '👤' },
  { id: LOCATION_TEMPLATE.id, label: '場所', emoji: '📍' },
  { id: ITEM_TEMPLATE.id, label: 'アイテム', emoji: '🗝' },
  { id: FACTION_TEMPLATE.id, label: '勢力', emoji: '⚑' },
];

/** マウス位置 (client 座標)。picker をクリック地点にポップアップさせる。 */
interface PickerAt {
  x: number;
  y: number;
}

interface PendingPicker {
  source: NodeId;
  target: NodeId;
  caption: string;
  at?: PickerAt | undefined;
}

interface EditingPicker {
  relationId: RelationId;
  text: string;
  caption: string;
  at?: PickerAt | undefined;
}

interface EdgeEditState {
  edgeId: PlotBoardEdgeId;
  type: string;
  label?: string | undefined;
  caption: string;
  at?: PickerAt | undefined;
}

/** Plot Flow: ユーザ定義接続の新規作成 (Shift+drag)。 */
interface PlotFlowPending {
  source: NodeId;
  target: NodeId;
  caption: string;
  at?: PickerAt | undefined;
}

/** Plot Flow: 既存エッジのラベル編集。custom はユーザ定義線 (削除可)。 */
interface PlotFlowEdgeEdit {
  kind: 'custom' | 'structural';
  edgeId: string;
  label: string;
  caption: string;
  at?: PickerAt | undefined;
}

function loadLensMode(): LensMode {
  if (typeof localStorage === 'undefined') return 'relationship';
  const v = localStorage.getItem(LENS_MODE_KEY);
  if (v === 'plot-flow' || v === 'plot-board') return v;
  return 'relationship';
}

function saveLensMode(m: LensMode): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LENS_MODE_KEY, m);
  } catch {
    /* quota / private mode */
  }
}

/** 表示名から slug を生成 (OutlinePanel.slugFromName と同ロジック。util 切り出しは追って)。 */
function quickNodeSlug(name: string, template: TemplateDefinition): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const base = ascii || `new_${template.directory.replace(/s$/, '')}`;
  return `${base}_${Date.now().toString(36)}`;
}

function loadNodeSize(): number {
  if (typeof localStorage === 'undefined') return 22;
  const v = Number(localStorage.getItem(NODE_SIZE_KEY));
  return Number.isFinite(v) ? Math.max(14, Math.min(44, v)) : 22;
}

function saveNodeSize(size: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(NODE_SIZE_KEY, String(size));
  } catch {
    /* quota */
  }
}

export const GraphPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [eraFilterOn, setEraFilterOn] = createSignal(false);
  const [pending, setPending] = createSignal<PendingPicker | undefined>(undefined);
  const [editing, setEditing] = createSignal<EditingPicker | undefined>(undefined);
  const [edgeEdit, setEdgeEdit] = createSignal<EdgeEditState | undefined>(undefined);
  const [pfPending, setPfPending] = createSignal<PlotFlowPending | undefined>(undefined);
  const [pfEdgeEdit, setPfEdgeEdit] = createSignal<PlotFlowEdgeEdit | undefined>(undefined);
  // P1 dogfood: 空所への Shift+drag で新規ノード / シーンをその場に作る
  const [quickNode, setQuickNode] = createSignal<
    { source: NodeId; world: { x: number; y: number }; at: PickerAt; caption: string } | undefined
  >(undefined);
  const [quickScene, setQuickScene] = createSignal<
    | {
        chapterSlug: string;
        sceneSlug: string;
        world: { x: number; y: number };
        at: PickerAt;
        caption: string;
      }
    | undefined
  >(undefined);
  const [lensMode, setLensMode] = createSignal<LensMode>(loadLensMode());
  const [nodeSize, setNodeSize] = createSignal(loadNodeSize());

  function setLensModeAndPersist(m: LensMode): void {
    setLensMode(m);
    saveLensMode(m);
  }

  // PR-AN: テンプレ別 visibility (default = 全て表示) + ノード検索
  const [hiddenTemplates, setHiddenTemplates] = createSignal<ReadonlySet<string>>(
    new Set<string>(),
  );
  const [searchQuery, setSearchQuery] = createSignal('');
  // PR (ux-overhaul-3): 関係 (edge) 表示 toggle
  const [edgesVisible, setEdgesVisible] = createSignal(true);

  function toggleTemplate(templateId: string): void {
    const cur = hiddenTemplates();
    const next = new Set(cur);
    if (next.has(templateId)) next.delete(templateId);
    else next.add(templateId);
    setHiddenTemplates(next);
  }

  function setNodeSizeAndPersist(size: number): void {
    const clamped = Math.max(14, Math.min(44, size));
    setNodeSize(clamped);
    saveNodeSize(clamped);
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

  // PR-AV: Lens 切替 (関係図 | プロットフロー) で raw payload を生成。
  // プロットフローは構造由来エッジに PlotFlowEdges のラベル上書きを適用し、
  // ユーザ定義接続 (章またぎ可) をマージする (P1 dogfood)。
  const rawLens = createMemo<LensPayload | undefined>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    if (lensMode() === 'plot-flow') {
      const payload = plotFlowAnalysis()?.payload;
      if (!payload) return undefined;
      const overrides = PlotFlowEdges.labelOverrides();
      const nodeIds = new Set(payload.nodes.map((n) => n.id));
      const structural = payload.edges.map((e) => {
        const label = overrides.get(e.id);
        return label !== undefined ? { ...e, label } : e;
      });
      // 端点のシーンが削除/リネームされた custom エッジは描画から除外 (データは残す)
      const custom: LensEdge[] = PlotFlowEdges.customEdges()
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          kind: 'explicit',
        }));
      return { nodes: payload.nodes, edges: [...structural, ...custom] };
    }
    if (lensMode() === 'plot-board') return undefined;
    return computeRelationshipLens(ctx.project.nodes, ctx.templates, ctx.project.relations);
  });

  const plotBoard = createMemo(() => {
    if (lensMode() !== 'plot-board') return undefined;
    return PlotBoardService.currentBoard();
  });

  const plotBoardReferenceNodes = createMemo(() => {
    const ctx = ProjectService.currentProject();
    return ctx ? [...ctx.project.nodes.values()] : [];
  });

  // PR-AN: hidden テンプレに属するノードを除外し、両端を含む edge も除外。
  // Plot Flow モードのノードは templateId='plot.scene' なので、
  // キャラ/場所/アイテム/勢力 を hide しても残る (= 期待動作)。
  const lens = createMemo<LensPayload | undefined>(() => {
    const raw = rawLens();
    if (!raw) return undefined;
    const hidden = hiddenTemplates();
    const showEdges = edgesVisible();
    if (hidden.size === 0 && showEdges) return raw;
    const visibleNodes = raw.nodes.filter((n) => !hidden.has(n.templateId));
    const visibleIds = new Set<NodeId>(visibleNodes.map((n) => n.id));
    let visibleEdges = raw.edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    );
    if (!showEdges) visibleEdges = [];
    return { nodes: visibleNodes, edges: visibleEdges };
  });

  const fallbackPositions = createMemo(() => {
    const l = rawLens();
    if (!l) return new Map<NodeId, { x: number; y: number }>();
    // プロットフローの既定は「章ごとに 1 行、シーンを左→右」(P1 dogfood)。
    // 同心円だと章構造が読めない。ドラッグ済みの位置 (GraphPositions) はこれを上書きする。
    if (lensMode() === 'plot-flow') {
      const ctx = ProjectService.currentProject();
      if (ctx) return plotFlowRowLayout(ctx.project.scenario.chapters);
    }
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

  // 各ノードの「正方形 crop 済」サムネ URL を解決 (PR-Q)。
  // lens / project.nodes 変化時に再計算。グラフは circle clip するので canvas で
  // pre-render した square をそのまま貼るとアスペクト比が破綻しない。
  // createResource の source は常に object を返し、fetcher 内で空分岐する
  // (falsy 時 fetcher 不発火を回避)。
  const [thumbnailUrls] = createResource(
    () => ({ nodes: lens()?.nodes ?? [] }),
    async (src) => {
      const out = new Map<NodeId, string>();
      const ctx = ProjectService.currentProject();
      if (!ctx) return out;
      for (const n of src.nodes) {
        if (!n.thumbnail) continue;
        // graph の LensNode には thumbnailRect が無いので ProjectModel から元 node を引く
        const fullNode = ctx.project.nodes.get(n.id);
        if (!fullNode) continue;
        const url = await ThumbnailService.resolveCroppedUrl(fullNode);
        if (url) out.set(n.id, url);
      }
      return out;
    },
    { initialValue: new Map<NodeId, string>() },
  );

  const dimmed = createMemo<ReadonlySet<NodeId>>(() => {
    // PR-AV: Plot Flow モードでは「到達不能シーン」を dimmed (Era / search は無関係)
    if (lensMode() === 'plot-flow') {
      const a = plotFlowAnalysis();
      return new Set(a?.unreachable ?? []);
    }
    const ctx = ProjectService.currentProject();
    const l = lens();
    if (!ctx || !l) return new Set();
    const out = new Set<NodeId>();
    // PR-C: Era フィルタ — 現 Era で isAlive=false なノードを薄く
    if (eraFilterOn() && !EraContext.isBase()) {
      for (const node of ctx.project.nodes.values()) {
        const r = resolveNode(node, EraContext.currentEraId(), ctx.project.eras);
        if (r.isAlive === false) out.add(node.id);
      }
    }
    // PR-AN: 検索クエリと一致しないノードを薄く (空クエリは no-op)
    const q = searchQuery().trim().toLowerCase();
    if (q !== '') {
      for (const n of l.nodes) {
        if (!n.label.toLowerCase().includes(q) && !String(n.id).toLowerCase().includes(q)) {
          out.add(n.id);
        }
      }
    }
    return out;
  });

  const plotBoardDimmed = createMemo<ReadonlySet<PlotBoardNodeId>>(() => {
    const board = plotBoard();
    if (!board) return new Set();
    const q = searchQuery().trim().toLowerCase();
    if (q === '') return new Set();
    const out = new Set<PlotBoardNodeId>();
    const refs = new Map(plotBoardReferenceNodes().map((n) => [n.id, n]));
    for (const node of board.nodes) {
      const refText = (node.anchors?.nodes ?? [])
        .map((id) => {
          const ref = refs.get(id);
          if (!ref) return id;
          const displayName = ref.fields['display_name'];
          return `${id}\n${ref.slug}\n${
            typeof displayName === 'string' ? displayName : ''
          }\n${ref.templateId}`;
        })
        .join('\n');
      const haystack =
        `${node.id}\n${node.kind}\n${node.title}\n${node.body}\n${refText}`.toLowerCase();
      if (!haystack.includes(q)) out.add(node.id);
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

  function startCreate(source: NodeId, target: NodeId, event: MouseEvent): void {
    const at = { x: event.clientX, y: event.clientY };
    // P1 dogfood: プロットフローでも Shift+drag で自由な接続を張れる (章またぎ可)。
    // ファイル構造 (シーン順) は変えず、Graph/plot-flow.yaml に保存される注釈レイヤ。
    if (lensMode() === 'plot-flow') {
      setPfPending({
        source,
        target,
        caption: `${nodeLabel(source)} → ${nodeLabel(target)}`,
        at,
      });
      return;
    }
    setPending({
      source,
      target,
      caption: `${nodeLabel(source)} → ${nodeLabel(target)}`,
      at,
    });
  }

  /** Alt+クリック: 線を削除 (グラフエディタ共通の削除ジェスチャ)。 */
  function deleteEdge(edge: LensEdge): void {
    if (lensMode() === 'plot-flow') {
      if (edge.id.startsWith('pfc:')) {
        PlotFlowEdges.remove(edge.id);
        Toast.success('接続を削除しました', 1500);
      } else {
        Toast.info(
          'この線はシーン順 / choice 由来のため削除できません (クリックでラベル編集)',
          3000,
        );
      }
      return;
    }
    if (edge.kind === 'explicit' && edge.relationId) {
      void RelationsService.remove(edge.relationId);
      Toast.success('関係を削除しました', 1500);
    }
  }

  /** 空所への Shift+drag: ドロップ地点に新規ノード (関係図) / シーン (プロットフロー) を作る。 */
  function startCreateAtEmpty(
    source: NodeId,
    world: { x: number; y: number },
    event: MouseEvent,
  ): void {
    const at = { x: event.clientX, y: event.clientY };
    if (lensMode() === 'plot-flow') {
      const m = /^plot\.([^.]+)\.(.+)$/.exec(source);
      if (!m || !m[1] || !m[2]) return;
      setQuickScene({
        chapterSlug: m[1],
        sceneSlug: m[2],
        world,
        at,
        caption: nodeLabel(source),
      });
      return;
    }
    setQuickNode({ source, world, at, caption: nodeLabel(source) });
  }

  /** 関係図: クイック作成の確定。ノードを作ってドロップ地点に置き、任意で関係線も張る。 */
  async function createNodeAtDrop(input: {
    template: TemplateDefinition;
    name: string;
    relationText: string;
  }): Promise<void> {
    const q = quickNode();
    const ctx = ProjectService.currentProject();
    if (!q || !ctx) return;
    try {
      const node = createNode(ctx.templates, {
        templateId: input.template.id,
        slug: quickNodeSlug(input.name, input.template),
        fields: { display_name: input.name },
      });
      await ctx.nodeRepository.save(node);
      const next = new Map(ctx.project.nodes);
      next.set(node.id, node);
      Object.assign(ctx.project, { nodes: next });
      ctx.history.register(node);
      GraphPositions.commitPosition(node.id, q.world);
      if (input.relationText !== '') {
        await RelationsService.add({ source: q.source, target: node.id, text: input.relationText });
      }
      SelectionContext.selectNode(node.id);
      ProjectService.touch();
      Toast.success(`ノードを作成: ${input.name}`, 1800);
    } catch (e) {
      Toast.error(`ノードの作成に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** プロットフロー: クイック作成の確定。起点シーンの直後に新シーンを挿入する。 */
  async function createSceneAfterDrop(title: string): Promise<void> {
    const q = quickScene();
    const ctx = ProjectService.currentProject();
    if (!q || !ctx) return;
    const chapter = ctx.project.scenario.chapters.find((c) => c.slug === q.chapterSlug);
    if (!chapter) return;
    try {
      const existing = new Set(chapter.scenes.map((s) => s.slug));
      const base = `sc_${String(chapter.scenes.length + 1).padStart(2, '0')}`;
      let slug = base;
      for (let i = 2; existing.has(slug); i += 1) slug = `${base}_${i}`;
      const scene = await ctx.scenarioRepository.addScene({
        chapterSlug: q.chapterSlug,
        sceneSlug: slug,
        title,
      });
      // addScene は末尾に付くので、起点シーンの直後へ並べ替える
      const idx = chapter.scenes.findIndex((s) => s.slug === q.sceneSlug);
      const scenes = [...chapter.scenes];
      scenes.splice(idx >= 0 ? idx + 1 : scenes.length, 0, scene);
      await ctx.scenarioRepository.reorderScenes(
        q.chapterSlug,
        scenes.map((s) => s.slug),
      );
      const nextChapters = ctx.project.scenario.chapters.map((c) =>
        c.slug === q.chapterSlug ? { ...c, scenes } : c,
      );
      Object.assign(ctx.project, {
        scenario: { ...ctx.project.scenario, chapters: nextChapters },
      });
      GraphPositions.commitPosition(`plot.${q.chapterSlug}.${slug}` as NodeId, q.world);
      ProjectService.touch();
      Toast.success(`シーンを作成: ${title}`, 1800);
    } catch (e) {
      Toast.error(`シーンの作成に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function startEdit(edge: LensEdge, event: MouseEvent): void {
    // Alt+クリック = 削除。編集ダイアログは開かない。
    if (event.altKey) {
      deleteEdge(edge);
      return;
    }
    const at = { x: event.clientX, y: event.clientY };
    if (lensMode() === 'plot-flow') {
      const isCustom = edge.id.startsWith('pfc:');
      setPfEdgeEdit({
        kind: isCustom ? 'custom' : 'structural',
        edgeId: edge.id,
        label: edge.label,
        caption: `${nodeLabel(edge.source)} → ${nodeLabel(edge.target)}`,
        at,
      });
      return;
    }
    if (edge.kind !== 'explicit' || !edge.relationId) return;
    setEditing({
      relationId: edge.relationId,
      text: edge.label,
      caption: `${nodeLabel(edge.source)} → ${nodeLabel(edge.target)}`,
      at,
    });
  }

  function editPlotBoardEdge(edgeId: PlotBoardEdgeId): void {
    const board = plotBoard();
    const edge = board?.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const titleOf = (id: PlotBoardNodeId): string =>
      board?.nodes.find((n) => n.id === id)?.title?.split(/\r?\n/, 1)[0] || '無題';
    setEdgeEdit({
      edgeId,
      type: edge.type,
      label: edge.label,
      caption: `${titleOf(edge.source)} → ${titleOf(edge.target)}`,
    });
  }

  return (
    <div class="panel-content panel-graph">
      <header class="panel-graph-header">
        <div class="panel-graph-header-row">
          <span class="panel-graph-lens-toggle">
            <button
              type="button"
              classList={{ active: lensMode() === 'relationship' }}
              onClick={() => setLensModeAndPersist('relationship')}
              title="ノード間の関係性を表示 (キャラ / 場所 / 派閥)"
            >
              🕸 関係図
            </button>
            <button
              type="button"
              classList={{ active: lensMode() === 'plot-flow' }}
              onClick={() => setLensModeAndPersist('plot-flow')}
              title="シーン間の遷移を表示 (next / choice goto / 到達不能 警告)"
            >
              🗺 プロットフロー
            </button>
            <button
              type="button"
              classList={{ active: lensMode() === 'plot-board' }}
              onClick={() => setLensModeAndPersist('plot-board')}
              title="並行プロットと脚本メモをカードで編集"
            >
              🧩 プロットボード
            </button>
          </span>
          <Show when={lensMode() !== 'plot-board' && lens()}>
            {(l) => (
              <span class="panel-graph-stats">
                {l().nodes.length} nodes · {l().edges.length} edges
              </span>
            )}
          </Show>
          <Show when={lensMode() === 'plot-board' && plotBoard()}>
            {(board) => (
              <span class="panel-graph-stats">
                {board().nodes.length} cards · {board().edges.length} links
              </span>
            )}
          </Show>
          <Show when={lensMode() !== 'plot-board'}>
            <label class="panel-graph-size-control" title="グラフノードの表示サイズ">
              サイズ
              <input
                type="range"
                min="14"
                max="44"
                step="1"
                value={nodeSize()}
                onInput={(e) => setNodeSizeAndPersist(Number(e.currentTarget.value))}
              />
              <span>{nodeSize()}</span>
            </label>
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
            <span
              class="panel-graph-hint"
              title="ノードから Shift+ドラッグ: 別ノードへ = 関係作成 / 空所へ = 新規ノード作成。線は Alt+クリックで削除"
            >
              ⓘ Shift+drag で関係作成 (空所へ = 新規ノード) · Alt+クリックで線を削除
            </span>
            <label class="panel-graph-era-toggle" title="関係 (edge) 線の表示 / 非表示">
              <input
                type="checkbox"
                checked={edgesVisible()}
                onChange={(e) => setEdgesVisible(e.currentTarget.checked)}
              />
              関係を表示
            </label>
            <label
              class="panel-graph-era-toggle"
              title="現在の時間軸で生存していないノードを薄く表示"
            >
              <input
                type="checkbox"
                checked={eraFilterOn()}
                disabled={EraContext.isBase()}
                onChange={(e) => setEraFilterOn(e.currentTarget.checked)}
              />
              時間軸フィルタ
              <Show when={EraContext.isBase()}>
                <span class="panel-graph-hint"> (時間軸を選択すると有効)</span>
              </Show>
            </label>
          </Show>
          <Show when={lensMode() === 'plot-flow'}>
            <span
              class="panel-graph-hint"
              title="ノードから Shift+ドラッグ: 別シーンへ = 接続追加 / 空所へ = 直後に新シーン作成。線はクリックでラベル編集、Alt+クリックで削除"
            >
              クリックで脚本へ · Shift+drag で接続 (空所へ = 新シーン) · Alt+クリックで線を削除
            </span>
          </Show>
          <Show when={lensMode() === 'plot-board'}>
            <span class="panel-graph-hint">
              プロットや伏線をカード化し、複数の筋を同じ面で整理します
            </span>
          </Show>
          <Show when={lensMode() !== 'plot-board'}>
            <button
              type="button"
              class="panel-graph-add-comment"
              title="グラフに自由メモ (グループ説明など) を追加"
              onClick={() => {
                // 画面中央付近に新しいメモを置く (world 座標は単純に 0,0 + ランダム offset)
                GraphComments.add({
                  x: 40 + Math.random() * 80,
                  y: 40 + Math.random() * 80,
                });
              }}
            >
              ＋ メモ
            </button>
          </Show>
          <code class="panel-graph-id">{params.api.id}</code>
        </div>
        {/* PR-AN: 2 段目 — テンプレ別 visibility + ノード検索。
            Plot Flow モードでは relevance が低いので relationship 時のみ表示。 */}
        <Show when={lensMode() === 'relationship'}>
          <div class="panel-graph-header-row">
            <span class="panel-graph-filter-label">表示:</span>
            <For each={TEMPLATE_TOGGLES}>
              {(t) => (
                <button
                  type="button"
                  class="panel-graph-filter-toggle"
                  classList={{
                    'panel-graph-filter-toggle--off': hiddenTemplates().has(t.id),
                  }}
                  onClick={() => toggleTemplate(t.id)}
                  title={`${t.label} を表示 / 非表示`}
                >
                  {t.emoji} {t.label}
                </button>
              )}
            </For>
            <input
              type="search"
              class="panel-graph-search"
              placeholder="🔍 ノード検索 (label / ID 部分一致 → 非マッチを薄く)"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <Show when={searchQuery() !== ''}>
              <button
                type="button"
                class="panel-graph-search-clear"
                onClick={() => setSearchQuery('')}
                title="検索クリア"
              >
                ×
              </button>
            </Show>
          </div>
        </Show>
        <Show when={lensMode() === 'plot-board'}>
          <div class="panel-graph-header-row">
            <input
              type="search"
              class="panel-graph-search panel-graph-search--wide"
              placeholder="🔍 プロットカード検索 (タイトル / 本文 / ID)"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <Show when={searchQuery() !== ''}>
              <button
                type="button"
                class="panel-graph-search-clear"
                onClick={() => setSearchQuery('')}
                title="検索クリア"
              >
                ×
              </button>
            </Show>
          </div>
        </Show>
      </header>
      <div class="panel-graph-canvas">
        <Show
          when={lensMode() === 'plot-board'}
          fallback={
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
                onPositionChange={(id, p) => GraphPositions.setPosition(id, p, { persist: false })}
                onPositionCommit={(id, p) => GraphPositions.commitPosition(id, p)}
                onCreateRelation={startCreate}
                onConnectToEmpty={startCreateAtEmpty}
                onEdgeClick={startEdit}
                implicitEdgesClickable={lensMode() === 'plot-flow'}
                selected={SelectionContext.selectedNodeId()}
                dimmed={dimmed()}
                nodeRadius={nodeSize()}
                viewKey={`${ProjectService.currentProject()?.handle.id ?? 'project'}:${lensMode()}`}
              />
            </Show>
          }
        >
          <Show when={plotBoard()}>
            {(board) => (
              <PlotBoardCanvas
                board={board()}
                dimmed={plotBoardDimmed()}
                referenceNodes={plotBoardReferenceNodes()}
                viewKey={`${ProjectService.currentProject()?.handle.id ?? 'project'}:${board().id}`}
                onAddNode={(kind, position) => PlotBoardService.addNode(kind, position)}
                onNodeChange={(id, patch) => PlotBoardService.updateNode(id, patch)}
                onNodeCommit={(id) => PlotBoardService.commitNode(id)}
                onNodeMove={(id, position) => PlotBoardService.moveNode(id, position)}
                onNodeMoveCommit={(id, position, from) =>
                  PlotBoardService.commitNodeMove(id, position, from)
                }
                onNodeDelete={(id) => PlotBoardService.removeNode(id)}
                onCreateEdge={(source, target) => PlotBoardService.addEdge(source, target)}
                onEdgeEdit={editPlotBoardEdge}
                onEdgeDelete={(id) => PlotBoardService.removeEdge(id)}
              />
            )}
          </Show>
        </Show>
      </div>

      <RelationTypePicker
        open={!!pending()}
        canDelete={false}
        caption={pending()?.caption}
        at={pending()?.at}
        onClose={() => setPending(undefined)}
        onSubmit={(input) => {
          const p = pending();
          if (!p) return;
          void (async () => {
            await RelationsService.add({ source: p.source, target: p.target, text: input.text });
            if (input.reverseText) {
              await RelationsService.add({
                source: p.target,
                target: p.source,
                text: input.reverseText,
              });
            }
          })();
        }}
      />
      <RelationTypePicker
        open={!!editing()}
        canDelete={true}
        caption={editing()?.caption}
        initial={editing() ? { text: editing()!.text } : undefined}
        at={editing()?.at}
        onClose={() => setEditing(undefined)}
        onSubmit={(input) => {
          const e = editing();
          if (!e) return;
          void RelationsService.update(e.relationId, { text: input.text });
        }}
        onDelete={() => {
          const e = editing();
          if (!e) return;
          void RelationsService.remove(e.relationId);
        }}
      />
      <PlotEdgeEditor
        open={!!edgeEdit()}
        initial={edgeEdit() ? { type: edgeEdit()!.type, label: edgeEdit()!.label } : undefined}
        caption={edgeEdit()?.caption}
        at={edgeEdit()?.at}
        onClose={() => setEdgeEdit(undefined)}
        onSubmit={(label) => {
          const e = edgeEdit();
          if (e) PlotBoardService.updateEdge(e.edgeId, { label });
        }}
        onDelete={() => {
          const e = edgeEdit();
          if (e) PlotBoardService.removeEdge(e.edgeId);
        }}
      />
      {/* プロットフロー: Shift+drag での接続追加 (章またぎ可) */}
      <PlotEdgeEditor
        open={!!pfPending()}
        title="接続を追加"
        caption={pfPending()?.caption}
        placeholder="ラベル (任意。例: 伏線回収 / 時系列は逆)"
        canDelete={false}
        at={pfPending()?.at}
        onClose={() => setPfPending(undefined)}
        onSubmit={(label) => {
          const p = pfPending();
          if (p) PlotFlowEdges.add(p.source, p.target, label);
        }}
        onDelete={() => undefined}
      />
      {/* プロットフロー: エッジのラベル編集。structural (暗黙 next / choice) は
          Graph/plot-flow.yaml の上書きで、空欄にすると既定 (ラベル無し) に戻る */}
      <PlotEdgeEditor
        open={!!pfEdgeEdit()}
        title={pfEdgeEdit()?.kind === 'custom' ? '接続を編集' : '接続ラベルを編集'}
        initial={pfEdgeEdit() ? { type: '', label: pfEdgeEdit()!.label } : undefined}
        caption={pfEdgeEdit()?.caption}
        placeholder="ラベル (空欄でラベル無しに戻す)"
        canDelete={pfEdgeEdit()?.kind === 'custom'}
        at={pfEdgeEdit()?.at}
        onClose={() => setPfEdgeEdit(undefined)}
        onSubmit={(label) => {
          const e = pfEdgeEdit();
          if (!e) return;
          if (e.kind === 'custom') PlotFlowEdges.updateLabel(e.edgeId, label);
          else PlotFlowEdges.setOverride(e.edgeId, label);
        }}
        onDelete={() => {
          const e = pfEdgeEdit();
          if (e && e.kind === 'custom') PlotFlowEdges.remove(e.edgeId);
        }}
      />
      {/* 関係図: 空所への Shift+drag でノードをその場に作成 */}
      <QuickNodeCreator
        open={!!quickNode()}
        sourceLabel={quickNode()?.caption}
        at={quickNode()?.at}
        onClose={() => setQuickNode(undefined)}
        onSubmit={(input) => void createNodeAtDrop(input)}
      />
      {/* プロットフロー: 空所への Shift+drag で直後にシーンを作成 */}
      <QuickSceneCreator
        open={!!quickScene()}
        sourceLabel={quickScene()?.caption}
        at={quickScene()?.at}
        onClose={() => setQuickScene(undefined)}
        onSubmit={(title) => void createSceneAfterDrop(title)}
      />
    </div>
  );
};

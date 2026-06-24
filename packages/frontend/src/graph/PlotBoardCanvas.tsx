import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import type { Component } from 'solid-js';
import type {
  NodeId,
  PlotBoard,
  PlotBoardAnchors,
  PlotBoardEdge,
  PlotBoardEdgeId,
  PlotBoardNode,
  PlotBoardNodeId,
  PlotBoardNodeKind,
  PlotBoardPosition,
  ScenarioNode,
} from '@scenario-studio/core';
import { NodeThumbnail } from '../global/NodeThumbnail';
import { StableTextarea } from '../global/StableTextControl';

export interface PlotBoardCanvasProps {
  board: PlotBoard;
  dimmed?: ReadonlySet<PlotBoardNodeId> | undefined;
  referenceNodes?: readonly ScenarioNode[] | undefined;
  viewKey?: string | undefined;
  onAddNode: (kind: PlotBoardNodeKind, position: PlotBoardPosition) => void;
  onNodeChange: (id: PlotBoardNodeId, patch: Partial<Omit<PlotBoardNode, 'id'>>) => void;
  onNodeCommit: (id: PlotBoardNodeId) => void;
  onNodeMove: (id: PlotBoardNodeId, position: PlotBoardPosition) => void;
  onNodeMoveCommit: (
    id: PlotBoardNodeId,
    position: PlotBoardPosition,
    from: PlotBoardPosition,
  ) => void;
  onNodeDelete: (id: PlotBoardNodeId) => void;
  onCreateEdge: (source: PlotBoardNodeId, target: PlotBoardNodeId) => void;
  onEdgeEdit: (id: PlotBoardEdgeId) => void;
  onEdgeDelete: (id: PlotBoardEdgeId) => void;
}

interface ViewState {
  x: number;
  y: number;
  scale: number;
}

type DragMode =
  | { kind: 'pan'; startX: number; startY: number; vx: number; vy: number }
  | {
      kind: 'node';
      id: PlotBoardNodeId;
      startX: number;
      startY: number;
      px: number;
      py: number;
    }
  | { kind: 'connect'; source: PlotBoardNodeId; toX: number; toY: number };

const VIEW_PREFIX = 'scenario-studio:plot-board-view:';
const CARD_WIDTH = 220;
const CARD_HEIGHT = 132;
const CARD_FULL_HEIGHT = 236;

export const PlotBoardCanvas: Component<PlotBoardCanvasProps> = (props) => {
  let svg: SVGSVGElement | undefined;
  const [view, setViewSignal] = createSignal<ViewState>({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = createSignal<DragMode | null>(null);
  const [hoverNode, setHoverNode] = createSignal<PlotBoardNodeId | undefined>(undefined);

  const nodeById = createMemo(() => {
    const map = new Map<PlotBoardNodeId, PlotBoardNode>();
    for (const node of props.board.nodes) map.set(node.id, node);
    return map;
  });

  const referenceNodeById = createMemo(() => {
    const map = new Map<NodeId, ScenarioNode>();
    for (const node of props.referenceNodes ?? []) map.set(node.id, node);
    return map;
  });

  const sortedReferenceNodes = createMemo(() =>
    [...(props.referenceNodes ?? [])].sort((a, b) =>
      scenarioNodeLabel(a).localeCompare(scenarioNodeLabel(b), 'ja'),
    ),
  );

  function setView(next: ViewState): void {
    setViewSignal(next);
    saveView(props.viewKey, next);
  }

  onMount(() => {
    setViewSignal(loadView(props.viewKey));
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  onCleanup(() => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  });

  function cardSize(node: PlotBoardNode): { width: number; height: number } {
    return cardSizeOf(node);
  }

  function nodeCenter(node: PlotBoardNode): PlotBoardPosition {
    const size = cardSize(node);
    return {
      x: node.position.x + size.width / 2,
      y: node.position.y + size.height / 2,
    };
  }

  function clientToWorld(clientX: number, clientY: number): PlotBoardPosition {
    const rect = svg?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    const v = view();
    return {
      x: (clientX - rect.left - v.x) / v.scale,
      y: (clientY - rect.top - v.y) / v.scale,
    };
  }

  function worldViewportCenter(): PlotBoardPosition {
    const rect = svg?.getBoundingClientRect();
    const v = view();
    if (!rect) return { x: 80, y: 80 };
    return {
      x: (rect.width / 2 - v.x) / v.scale - CARD_WIDTH / 2,
      y: (rect.height / 2 - v.y) / v.scale - CARD_HEIGHT / 2,
    };
  }

  function onBackgroundMouseDown(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 1) return;
    setDrag({ kind: 'pan', startX: e.clientX, startY: e.clientY, vx: view().x, vy: view().y });
    e.preventDefault();
  }

  function onHeaderMouseDown(e: MouseEvent, node: PlotBoardNode): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (e.shiftKey) {
      const center = nodeCenter(node);
      setDrag({ kind: 'connect', source: node.id, toX: center.x, toY: center.y });
      return;
    }
    setDrag({
      kind: 'node',
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      px: node.position.x,
      py: node.position.y,
    });
  }

  function onMouseMove(e: MouseEvent): void {
    const d = drag();
    if (!d) return;
    if (d.kind === 'pan') {
      setView({ ...view(), x: d.vx + e.clientX - d.startX, y: d.vy + e.clientY - d.startY });
      return;
    }
    if (d.kind === 'node') {
      const v = view();
      props.onNodeMove(d.id, {
        x: d.px + (e.clientX - d.startX) / v.scale,
        y: d.py + (e.clientY - d.startY) / v.scale,
      });
      return;
    }
    const next = clientToWorld(e.clientX, e.clientY);
    setDrag({ ...d, toX: next.x, toY: next.y });
  }

  function onMouseUp(e: MouseEvent): void {
    const d = drag();
    setDrag(null);
    if (!d) return;
    if (d.kind === 'node') {
      const current = nodeById().get(d.id)?.position ?? { x: d.px, y: d.py };
      const moved = Math.hypot(current.x - d.px, current.y - d.py);
      if (moved < 6) {
        props.onNodeMove(d.id, { x: d.px, y: d.py });
      } else {
        props.onNodeMoveCommit(d.id, current, { x: d.px, y: d.py });
      }
      return;
    }
    if (d.kind !== 'connect') return;
    const target = nearestNode(clientToWorld(e.clientX, e.clientY), d.source);
    if (target) props.onCreateEdge(d.source, target);
  }

  function nearestNode(
    point: PlotBoardPosition,
    except: PlotBoardNodeId,
  ): PlotBoardNodeId | undefined {
    let best: PlotBoardNodeId | undefined;
    let bestDistance = Infinity;
    for (const node of props.board.nodes) {
      if (node.id === except) continue;
      const center = nodeCenter(node);
      const distance = Math.hypot(center.x - point.x, center.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node.id;
      }
    }
    return bestDistance <= 150 ? best : undefined;
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextScale = clampScale(view().scale * factor);
    if (nextScale === view().scale) return;
    const rect = svg?.getBoundingClientRect();
    if (!rect) {
      setView({ ...view(), scale: nextScale });
      return;
    }
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const ratio = nextScale / view().scale;
    setView({
      scale: nextScale,
      x: cx - (cx - view().x) * ratio,
      y: cy - (cy - view().y) * ratio,
    });
  }

  function addAtCenter(kind: PlotBoardNodeKind): void {
    const center = worldViewportCenter();
    const offset = props.board.nodes.length * 18;
    props.onAddNode(kind, { x: center.x + offset, y: center.y + offset });
  }

  function isDimmed(id: PlotBoardNodeId): boolean {
    return props.dimmed?.has(id) ?? false;
  }

  return (
    <div class="plot-board-shell">
      <div class="plot-board-toolbar">
        <button type="button" onClick={() => addAtCenter('memo')}>
          ＋ メモ
        </button>
        <span class="plot-board-toolbar-hint">
          1行目が表題 / 上部をドラッグ / Shift+ドラッグで接続
        </span>
      </div>
      <svg
        ref={svg}
        class="plot-board-canvas"
        classList={{ 'plot-board-canvas--dragging': !!drag() }}
        onMouseDown={onBackgroundMouseDown}
        onWheel={onWheel}
        onDblClick={(e) => {
          if (e.target !== svg) return;
          props.onAddNode('memo', clientToWorld(e.clientX, e.clientY));
        }}
      >
        <defs>
          <marker
            id="plot-board-arrow"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4b5563" />
          </marker>
        </defs>
        <g transform={`translate(${view().x}, ${view().y}) scale(${view().scale})`}>
          <For each={props.board.edges}>
            {(edge) => {
              const geometry = createMemo(() => edgeGeometry(edge, nodeById()));
              return (
                <Show when={geometry()}>
                  {(g) => (
                    <g class="plot-board-edge">
                      <line
                        x1={g().sx}
                        y1={g().sy}
                        x2={g().tx}
                        y2={g().ty}
                        marker-end="url(#plot-board-arrow)"
                      />
                      <foreignObject
                        x={g().mx - 58 / view().scale}
                        y={g().my - 11 / view().scale}
                        width={116 / view().scale}
                        height={22 / view().scale}
                      >
                        <button
                          type="button"
                          class="plot-board-edge-label"
                          style={{ 'font-size': `${11 / view().scale}px` }}
                          title="クリックで線を編集"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            props.onEdgeEdit(edge.id);
                          }}
                        >
                          {edge.label || edge.type}
                        </button>
                      </foreignObject>
                    </g>
                  )}
                </Show>
              );
            }}
          </For>

          <Show when={drag()?.kind === 'connect'}>
            {(_) => {
              const d = createMemo(
                () => drag() as { kind: 'connect'; source: PlotBoardNodeId; toX: number; toY: number },
              );
              const source = createMemo(() => nodeById().get(d().source));
              return (
                <Show when={source()}>
                  {(node) => {
                    const center = createMemo(() => nodeCenter(node()));
                    return (
                      <line
                        class="plot-board-rubber"
                        x1={center().x}
                        y1={center().y}
                        x2={d().toX}
                        y2={d().toY}
                      />
                    );
                  }}
                </Show>
              );
            }}
          </Show>

          <For each={props.board.nodes}>
            {(node) => {
              const size = createMemo(() => cardSize(node));
              return (
                <foreignObject
                  x={node.position.x}
                  y={node.position.y}
                  width={size().width}
                  height={size().height}
                  classList={{ 'plot-board-card-fo--dimmed': isDimmed(node.id) }}
                  onMouseEnter={() => setHoverNode(node.id)}
                  onMouseLeave={() => setHoverNode(undefined)}
                >
                  <PlotBoardMemoCard
                    node={node}
                    target={drag()?.kind === 'connect' && hoverNode() === node.id}
                    referenceNodeById={referenceNodeById()}
                    referenceNodes={sortedReferenceNodes()}
                    onHeaderMouseDown={(e) => onHeaderMouseDown(e, node)}
                    onNodeChange={(patch) => props.onNodeChange(node.id, patch)}
                    onNodeCommit={() => props.onNodeCommit(node.id)}
                    onNodeDelete={() => props.onNodeDelete(node.id)}
                  />
                </foreignObject>
              );
            }}
          </For>
        </g>
      </svg>
      <Show when={props.board.nodes.length === 0}>
        <div class="plot-board-empty" aria-hidden="true">
          <p class="plot-board-empty-title">まだカードがありません</p>
          <p>背景をダブルクリック、または「＋ メモ」でカードを追加できます。</p>
          <p class="plot-board-empty-hint">カードの上部をドラッグで移動 / Shift+ドラッグで接続</p>
        </div>
      </Show>
    </div>
  );
};

interface PlotBoardMemoCardProps {
  node: PlotBoardNode;
  target: boolean;
  referenceNodeById: ReadonlyMap<NodeId, ScenarioNode>;
  referenceNodes: readonly ScenarioNode[];
  onHeaderMouseDown: (e: MouseEvent) => void;
  onNodeChange: (patch: Partial<Omit<PlotBoardNode, 'id'>>) => void;
  onNodeCommit: () => void;
  onNodeDelete: () => void;
}

const PlotBoardMemoCard: Component<PlotBoardMemoCardProps> = (props) => {
  const [draftText, setDraftText] = createSignal(memoText(props.node));
  const [editing, setEditing] = createSignal(false);

  createEffect(() => {
    if (editing()) return;
    setDraftText(memoText(props.node));
  });

  const mode = createMemo(() => props.node.viewMode ?? 'summary');
  const title = createMemo(() => firstLineTitle(draftText()));
  const summaryBody = createMemo(() => bodyWithoutTitle(draftText()));
  const selectedRefs = createMemo(() => selectedReferenceNodes(props.node, props.referenceNodeById));
  const availableRefs = createMemo(() => availableReferenceNodes(props.node, props.referenceNodes));
  const availableRefGroups = createMemo(() => groupReferenceNodesByTemplate(availableRefs()));
  const visibleText = createMemo(() => (mode() === 'full' ? draftText() : summaryBody()));

  function commitDraft(immediate = false): void {
    const next = memoTextPatch(draftText());
    if (
      next.title !== props.node.title ||
      next.body !== props.node.body ||
      props.node.kind !== 'memo'
    ) {
      props.onNodeChange(next);
    }
    if (immediate) props.onNodeCommit();
  }

  function updateVisibleText(value: string): void {
    setEditing(true);
    if (mode() === 'full') {
      setDraftText(value);
      return;
    }
    const head = firstLineTitle(draftText());
    setDraftText(value === '' ? head : `${head}\n${value}`);
  }

  function onBlur(): void {
    commitDraft(true);
    setEditing(false);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      commitDraft(true);
    }
  }

  return (
    <div
      class="plot-board-card"
      classList={{ 'plot-board-card--target': props.target }}
      data-kind="memo"
      data-mode={mode()}
    >
      <div
        class="plot-board-card-header"
        title="ドラッグで移動 / Shift+ドラッグで接続"
        onMouseDown={props.onHeaderMouseDown}
      >
        <span class="plot-board-card-kind" title={mode() === 'summary' ? title() : 'メモ'}>
          {mode() === 'summary' ? title() : 'メモ'}
        </span>
        <button
          type="button"
          class="plot-board-mode-toggle"
          title={mode() === 'full' ? '簡易表示に切り替え' : '全文表示に切り替え'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            commitDraft(false);
            props.onNodeChange({
              viewMode: mode() === 'full' ? 'summary' : 'full',
            });
          }}
        >
          {mode() === 'full' ? '全文' : '簡易'}
        </button>
        <button
          type="button"
          title="削除"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            props.onNodeDelete();
          }}
        >
          ×
        </button>
      </div>
      <Show when={selectedRefs().length > 0 || availableRefs().length > 0}>
        <div class="plot-board-card-refs" onMouseDown={(e) => e.stopPropagation()}>
          <For each={selectedRefs()}>
            {(refNode) => (
              <button
                type="button"
                class="plot-board-ref-chip"
                title={`${scenarioNodeLabel(refNode)} の参照を外す`}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onNodeChange(removeReferencePatch(props.node, refNode.id));
                }}
              >
                <Suspense
                  fallback={
                    <span class="plot-board-ref-thumb-fallback">
                      {scenarioNodeLabel(refNode).slice(0, 2)}
                    </span>
                  }
                >
                  <NodeThumbnail node={refNode} size={22} />
                </Suspense>
                <span>{scenarioNodeLabel(refNode)}</span>
              </button>
            )}
          </For>
          <select
            value=""
            title="キャラ・場所などを参照"
            onChange={(e) => {
              const id = e.currentTarget.value as NodeId;
              e.currentTarget.value = '';
              if (id) props.onNodeChange(addReferencePatch(props.node, id));
            }}
          >
            <option value="">参照を追加</option>
            <For each={availableRefGroups()}>
              {(group) => (
                <optgroup label={group.label}>
                  <For each={group.nodes}>
                    {(refNode) => <option value={refNode.id}>{scenarioNodeLabel(refNode)}</option>}
                  </For>
                </optgroup>
              )}
            </For>
          </select>
        </div>
      </Show>
      <StableTextarea
        class={`plot-board-card-body plot-board-card-body--${mode()}`}
        value={visibleText()}
        placeholder={
          mode() === 'full'
            ? '1行目が表題になります。以降にメモ / 台詞案 / 伏線 / 目的を書けます。'
            : '本文の要点'
        }
        onInput={updateVisibleText}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
};

function memoText(node: PlotBoardNode): string {
  if (node.body.trim() !== '') return node.body;
  return node.title;
}

function memoTextPatch(text: string): Partial<Omit<PlotBoardNode, 'id'>> {
  return {
    kind: 'memo',
    title: firstLineTitle(text),
    body: text,
  };
}

function firstLineTitle(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.trim() || '無題メモ';
}

function bodyWithoutTitle(text: string): string {
  const lines = text.split(/\r?\n/);
  lines.shift();
  return lines.join('\n');
}

function selectedReferenceNodes(
  node: PlotBoardNode,
  byId: ReadonlyMap<NodeId, ScenarioNode>,
): readonly ScenarioNode[] {
  return (node.anchors?.nodes ?? []).map((id) => byId.get(id)).filter(isScenarioNode);
}

function availableReferenceNodes(
  node: PlotBoardNode,
  allNodes: readonly ScenarioNode[],
): readonly ScenarioNode[] {
  const selected = new Set(node.anchors?.nodes ?? []);
  return allNodes.filter((n) => !selected.has(n.id));
}

function addReferencePatch(node: PlotBoardNode, id: NodeId): Partial<Omit<PlotBoardNode, 'id'>> {
  const existing = node.anchors?.nodes ?? [];
  if (existing.includes(id)) return {};
  return anchorsPatch(node, [...existing, id]);
}

function removeReferencePatch(node: PlotBoardNode, id: NodeId): Partial<Omit<PlotBoardNode, 'id'>> {
  return anchorsPatch(
    node,
    (node.anchors?.nodes ?? []).filter((cur) => cur !== id),
  );
}

function anchorsPatch(
  node: PlotBoardNode,
  nodes: readonly NodeId[],
): Partial<Omit<PlotBoardNode, 'id'>> {
  const anchors: PlotBoardAnchors = { ...(node.anchors ?? {}) };
  if (nodes.length > 0) anchors.nodes = nodes;
  else delete anchors.nodes;
  return Object.keys(anchors).length > 0 ? { anchors } : { anchors: undefined };
}

function isScenarioNode(node: ScenarioNode | undefined): node is ScenarioNode {
  return node !== undefined;
}

function scenarioNodeLabel(node: ScenarioNode): string {
  const displayName = node.fields['display_name'];
  return typeof displayName === 'string' && displayName.trim() !== ''
    ? displayName.trim()
    : node.slug;
}

function groupReferenceNodesByTemplate(
  nodes: readonly ScenarioNode[],
): { label: string; nodes: readonly ScenarioNode[] }[] {
  const groups = new Map<string, ScenarioNode[]>();
  for (const node of nodes) {
    const label = templateLabel(node.templateId);
    const bucket = groups.get(label);
    if (bucket) bucket.push(node);
    else groups.set(label, [node]);
  }
  return [...groups.entries()].map(([label, groupNodes]) => ({ label, nodes: groupNodes }));
}

function templateLabel(templateId: string): string {
  switch (templateId) {
    case 'template.character':
      return 'キャラ';
    case 'template.location':
      return '場所';
    case 'template.item':
      return 'アイテム';
    case 'template.faction':
      return '勢力';
    default:
      return '要素';
  }
}

function edgeGeometry(
  edge: PlotBoardEdge,
  nodes: ReadonlyMap<PlotBoardNodeId, PlotBoardNode>,
):
  | {
      sx: number;
      sy: number;
      tx: number;
      ty: number;
      mx: number;
      my: number;
    }
  | undefined {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) return undefined;
  const s = centerOf(source);
  const t = centerOf(target);
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    sx: s.x + ux * 92,
    sy: s.y + uy * 46,
    tx: t.x - ux * 92,
    ty: t.y - uy * 46,
    mx: s.x + dx * 0.55,
    my: s.y + dy * 0.55,
  };
}

// width/height は壊れた YAML 由来で NaN/Infinity になり得る (parseNode は finite を
// 強制するが、防御を二重化して SVG 座標が NaN で全描画が崩れるのを防ぐ)。
function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// カードの実描画サイズ。viewMode='full' で背の高いカードになる点も含め、
// エッジ幾何 (centerOf) とカード描画 (cardSize/nodeCenter) で同一の値を使う。
function cardSizeOf(node: PlotBoardNode): { width: number; height: number } {
  return {
    width: finiteOr(node.width, CARD_WIDTH),
    height: finiteOr(node.height, node.viewMode === 'full' ? CARD_FULL_HEIGHT : CARD_HEIGHT),
  };
}

function centerOf(node: PlotBoardNode): PlotBoardPosition {
  const size = cardSizeOf(node);
  return {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  };
}

function clampScale(scale: number): number {
  return Math.max(0.25, Math.min(2.5, scale));
}

function loadView(key: string | undefined): ViewState {
  if (!key || typeof localStorage === 'undefined') return { x: 0, y: 0, scale: 1 };
  try {
    const raw = localStorage.getItem(`${VIEW_PREFIX}${key}`);
    if (!raw) return { x: 0, y: 0, scale: 1 };
    const parsed = JSON.parse(raw) as Partial<ViewState>;
    return {
      x: typeof parsed.x === 'number' ? parsed.x : 0,
      y: typeof parsed.y === 'number' ? parsed.y : 0,
      scale: typeof parsed.scale === 'number' ? clampScale(parsed.scale) : 1,
    };
  } catch {
    return { x: 0, y: 0, scale: 1 };
  }
}

function saveView(key: string | undefined, view: ViewState): void {
  if (!key || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${VIEW_PREFIX}${key}`, JSON.stringify(view));
  } catch {
    /* quota */
  }
}

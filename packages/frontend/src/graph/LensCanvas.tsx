import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { LensEdge, LensPayload, NodeId } from '@scenario-studio/core';
import { GraphComments, type GraphComment } from './graph-comments';

// SVG ベースの軽量グラフ canvas (PR-C/E)。
// 機能:
//  - pan / zoom (ホイール / 背景ドラッグ)
//  - ノード drag で位置更新 (onPositionChange)
//  - edge label を中間 Box で描画 (PR-C)
//  - ダブルクリックで onActivate (Inspector ジャンプ)
//  - Era フィルタで dimmed
//  - Shift+drag で関係作成 (PR-E、rubber-band → onCreateRelation)
//  - explicit edge label のクリックで onEdgeClick (relation type 変更 picker 表示)
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §1, §3

export interface LensCanvasProps {
  payload: LensPayload;
  positions: ReadonlyMap<NodeId, { x: number; y: number }>;
  /** ノード id → サムネイル object URL (PR-Q)。無ければ円塗り。 */
  thumbnailUrls?: ReadonlyMap<NodeId, string>;
  onSelect?: (id: NodeId) => void;
  onActivate?: (id: NodeId) => void;
  onPositionChange?: (id: NodeId, p: { x: number; y: number }) => void;
  /** Shift+drag で関係作成 (source → target)。 */
  onCreateRelation?: (source: NodeId, target: NodeId) => void;
  /** edge ラベルクリック (relation type 変更 / 削除 picker)。 */
  onEdgeClick?: (edge: LensEdge) => void;
  selected?: NodeId | undefined;
  dimmed?: ReadonlySet<NodeId>;
}

const NODE_RADIUS = 22;

interface ViewState {
  x: number;
  y: number;
  scale: number;
}

type DragMode =
  | { kind: 'pan'; startX: number; startY: number; vx: number; vy: number }
  | { kind: 'node'; id: NodeId; startX: number; startY: number; px: number; py: number }
  | { kind: 'connect'; source: NodeId; toX: number; toY: number }
  | {
      kind: 'comment-move';
      id: string;
      startX: number;
      startY: number;
      cx: number;
      cy: number;
    }
  | {
      kind: 'comment-resize';
      id: string;
      startX: number;
      startY: number;
      cw: number;
      ch: number;
    };

export const LensCanvas: Component<LensCanvasProps> = (props) => {
  let svg: SVGSVGElement | undefined;
  const [view, setView] = createSignal<ViewState>({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = createSignal<DragMode | null>(null);
  const [hoverNode, setHoverNode] = createSignal<NodeId | undefined>(undefined);

  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = svg?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    const v = view();
    return {
      x: (clientX - rect.left - v.x) / v.scale,
      y: (clientY - rect.top - v.y) / v.scale,
    };
  }

  function onBackgroundMouseDown(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 1) return;
    const v = view();
    setDrag({ kind: 'pan', startX: e.clientX, startY: e.clientY, vx: v.x, vy: v.y });
    e.preventDefault();
  }

  function onNodeMouseDown(e: MouseEvent, id: NodeId): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const p = pos(id);
    if (e.shiftKey) {
      setDrag({ kind: 'connect', source: id, toX: p.x, toY: p.y });
    } else {
      setDrag({ kind: 'node', id, startX: e.clientX, startY: e.clientY, px: p.x, py: p.y });
    }
  }

  function onMouseMove(e: MouseEvent): void {
    const d = drag();
    if (!d) return;
    if (d.kind === 'pan') {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const v = view();
      setView({ ...v, x: d.vx + dx, y: d.vy + dy });
      return;
    }
    if (d.kind === 'node') {
      const v = view();
      const dx = (e.clientX - d.startX) / v.scale;
      const dy = (e.clientY - d.startY) / v.scale;
      props.onPositionChange?.(d.id, { x: d.px + dx, y: d.py + dy });
      return;
    }
    if (d.kind === 'comment-move') {
      const v = view();
      const dx = (e.clientX - d.startX) / v.scale;
      const dy = (e.clientY - d.startY) / v.scale;
      GraphComments.update(d.id, { x: d.cx + dx, y: d.cy + dy });
      return;
    }
    if (d.kind === 'comment-resize') {
      const v = view();
      const dx = (e.clientX - d.startX) / v.scale;
      const dy = (e.clientY - d.startY) / v.scale;
      GraphComments.update(d.id, {
        width: Math.max(80, d.cw + dx),
        height: Math.max(40, d.ch + dy),
      });
      return;
    }
    // connect: マウス位置を world に変換して rubber-band の終端に
    if (d.kind === 'connect') {
      const w = clientToWorld(e.clientX, e.clientY);
      setDrag({ ...d, toX: w.x, toY: w.y });
    }
  }

  function onMouseUp(e: MouseEvent): void {
    const d = drag();
    setDrag(null);
    if (!d || d.kind !== 'connect') return;
    // ターゲット node の解決: マウス up 位置に最も近いノード (距離 NODE_RADIUS 以内)
    const w = clientToWorld(e.clientX, e.clientY);
    const target = nearestNodeWithin(w, NODE_RADIUS * 1.5);
    if (target && target !== d.source) {
      props.onCreateRelation?.(d.source, target);
    }
  }

  function nearestNodeWithin(p: { x: number; y: number }, maxDist: number): NodeId | undefined {
    let best: NodeId | undefined;
    let bestDist = Infinity;
    for (const node of props.payload.nodes) {
      const np = pos(node.id);
      const d = Math.hypot(np.x - p.x, np.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = node.id;
      }
    }
    return bestDist <= maxDist ? best : undefined;
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const v = view();
    const next = clampScale(v.scale * factor);
    if (next === v.scale) return;
    const rect = svg?.getBoundingClientRect();
    if (rect) {
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const ratio = next / v.scale;
      setView({
        scale: next,
        x: cx - (cx - v.x) * ratio,
        y: cy - (cy - v.y) * ratio,
      });
    } else {
      setView({ ...v, scale: next });
    }
  }

  onMount(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
  onCleanup(() => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  });

  function pos(id: NodeId): { x: number; y: number } {
    return props.positions.get(id) ?? { x: 0, y: 0 };
  }

  function isDimmed(id: NodeId): boolean {
    return props.dimmed?.has(id) ?? false;
  }

  function edgeBox(label: string): { w: number; h: number } {
    const ch = label.length;
    // ラベルは scale で割って常に画面 px 一定にするため、box も同じ補正をかける。
    const s = view().scale;
    return { w: Math.max(28, ch * 8 + 14) / s, h: 18 / s };
  }

  return (
    <svg
      ref={svg}
      class="lens-canvas"
      onMouseDown={onBackgroundMouseDown}
      onWheel={onWheel}
      classList={{ 'lens-canvas--dragging': !!drag() }}
    >
      <defs>
        <marker
          id="arrow-marker"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5a6068" />
        </marker>
        <marker
          id="arrow-marker-explicit"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0072b2" />
        </marker>
      </defs>
      <g transform={`translate(${view().x}, ${view().y}) scale(${view().scale})`}>
        {/* edges */}
        <For each={props.payload.edges}>
          {(edge) => {
            // PR (ux-overhaul-3): pos を memo にしてノード drag に追随する
            const s = createMemo(() => pos(edge.source));
            const t = createMemo(() => pos(edge.target));
            const geom = createMemo(() => {
              const sp = s();
              const tp = t();
              const dx = tp.x - sp.x;
              const dy = tp.y - sp.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const sx = sp.x + ux * NODE_RADIUS;
              const sy = sp.y + uy * NODE_RADIUS;
              const tx = tp.x - ux * NODE_RADIUS;
              const ty = tp.y - uy * NODE_RADIUS;
              return { sx, sy, tx, ty, mid: { x: (sx + tx) / 2, y: (sy + ty) / 2 } };
            });
            const dim = () => isDimmed(edge.source) || isDimmed(edge.target);
            const box = createMemo(() => edgeBox(edge.label));
            const explicit = edge.kind === 'explicit';
            return (
              <g class="lens-edge" classList={{ 'lens-edge--dimmed': dim() }}>
                <line
                  x1={geom().sx}
                  y1={geom().sy}
                  x2={geom().tx}
                  y2={geom().ty}
                  stroke={explicit ? '#0072b2' : '#5a6068'}
                  stroke-width={explicit ? 2 : 1.5}
                  stroke-dasharray={explicit ? undefined : '4 3'}
                  marker-end={`url(#${explicit ? 'arrow-marker-explicit' : 'arrow-marker'})`}
                />
                <g
                  transform={`translate(${geom().mid.x}, ${geom().mid.y})`}
                  class="lens-edge-label-group"
                  classList={{
                    'lens-edge-label-group--clickable': explicit && !!props.onEdgeClick,
                  }}
                  onClick={(e) => {
                    if (!explicit) return;
                    e.stopPropagation();
                    props.onEdgeClick?.(edge);
                  }}
                >
                  <rect
                    x={-box().w / 2}
                    y={-box().h / 2}
                    width={box().w}
                    height={box().h}
                    rx="4"
                    ry="4"
                    fill="#ffffff"
                    stroke={explicit ? '#0072b2' : '#5a6068'}
                    stroke-width="1"
                  />
                  <text
                    class="lens-edge-label"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill={explicit ? '#0072b2' : undefined}
                    style={{ 'font-size': `${10 / view().scale}px` }}
                  >
                    {edge.label}
                  </text>
                </g>
              </g>
            );
          }}
        </For>

        {/* connect モード中の rubber-band */}
        <Show when={drag()?.kind === 'connect'}>
          {(_) => {
            // PR (ux-overhaul-3): drag() を memo にして mousemove に追随させる
            const dm = createMemo(
              () => drag() as { kind: 'connect'; source: NodeId; toX: number; toY: number },
            );
            return (
              <line
                x1={pos(dm().source).x}
                y1={pos(dm().source).y}
                x2={dm().toX}
                y2={dm().toY}
                stroke="#0072b2"
                stroke-width="2"
                stroke-dasharray="6 4"
                opacity="0.7"
                pointer-events="none"
              />
            );
          }}
        </Show>

        {/* comments (nodes より下に描画して、ノードを背景色で囲うイメージ) */}
        <For each={GraphComments.comments()}>
          {(c) => (
            <CommentRect
              comment={c}
              onMoveStart={(e) => {
                e.stopPropagation();
                setDrag({
                  kind: 'comment-move',
                  id: c.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  cx: c.x,
                  cy: c.y,
                });
              }}
              onResizeStart={(e) => {
                e.stopPropagation();
                setDrag({
                  kind: 'comment-resize',
                  id: c.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  cw: c.width,
                  ch: c.height,
                });
              }}
            />
          )}
        </For>

        {/* nodes */}
        <For each={props.payload.nodes}>
          {(node) => {
            // PR (ux-overhaul-3): pos を memo にして props.positions の変化を tracked。
            // For 子は 1 回しか走らないので、pos を let const で読むと初期値で固まる。
            const p = createMemo(() => pos(node.id));
            const isSelected = () => props.selected === node.id;
            const dim = () => isDimmed(node.id);
            const isHover = () => hoverNode() === node.id;
            const connecting = () => drag()?.kind === 'connect';
            return (
              <g
                class="lens-node"
                classList={{
                  'lens-node--selected': isSelected(),
                  'lens-node--dimmed': dim(),
                  'lens-node--target-hover': connecting() && isHover(),
                }}
                transform={`translate(${p().x}, ${p().y})`}
                onMouseDown={(e) => onNodeMouseDown(e, node.id)}
                onMouseEnter={() => setHoverNode(node.id)}
                onMouseLeave={() => setHoverNode(undefined)}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onSelect?.(node.id);
                }}
                onDblClick={(e) => {
                  e.stopPropagation();
                  props.onActivate?.(node.id);
                }}
              >
                <Show
                  when={props.thumbnailUrls?.get(node.id)}
                  fallback={
                    <circle
                      r={NODE_RADIUS}
                      fill={colorForTemplate(node.templateId)}
                      stroke={
                        isSelected() ? '#0072b2' : connecting() && isHover() ? '#009e73' : '#1a1d24'
                      }
                      stroke-width={isSelected() || (connecting() && isHover()) ? 3 : 1.5}
                    />
                  }
                >
                  {(url) => (
                    <>
                      <defs>
                        <clipPath id={`clip-${node.id}`}>
                          <circle r={NODE_RADIUS} />
                        </clipPath>
                      </defs>
                      <image
                        href={url()}
                        x={-NODE_RADIUS}
                        y={-NODE_RADIUS}
                        width={NODE_RADIUS * 2}
                        height={NODE_RADIUS * 2}
                        clip-path={`url(#clip-${node.id})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                      <circle
                        r={NODE_RADIUS}
                        fill="none"
                        stroke={
                          isSelected()
                            ? '#0072b2'
                            : connecting() && isHover()
                              ? '#009e73'
                              : '#1a1d24'
                        }
                        stroke-width={isSelected() || (connecting() && isHover()) ? 3 : 1.5}
                      />
                    </>
                  )}
                </Show>
                <Show when={!props.thumbnailUrls?.get(node.id)}>
                  <Show when={shapeForTemplate(node.templateId) === 'square'}>
                    <rect x={-6} y={-6} width={12} height={12} fill="#1a1d24" opacity="0.55" />
                  </Show>
                  <Show when={shapeForTemplate(node.templateId) === 'triangle'}>
                    <polygon points="0,-7 6,5 -6,5" fill="#1a1d24" opacity="0.55" />
                  </Show>
                  <Show when={shapeForTemplate(node.templateId) === 'diamond'}>
                    <polygon points="0,-7 7,0 0,7 -7,0" fill="#1a1d24" opacity="0.55" />
                  </Show>
                </Show>
                <text
                  class="lens-node-label"
                  y={NODE_RADIUS + 14 / view().scale}
                  style={{ 'font-size': `${11 / view().scale}px` }}
                >
                  {node.label}
                </text>
              </g>
            );
          }}
        </For>
      </g>
    </svg>
  );
};

/** SVG 内に foreignObject で配置するメモ box。背景色 + 編集可能 textarea + 角の resize handle。 */
const CommentRect: Component<{
  comment: GraphComment;
  onMoveStart: (e: MouseEvent) => void;
  onResizeStart: (e: MouseEvent) => void;
}> = (props) => {
  return (
    <g class="lens-comment" transform={`translate(${props.comment.x}, ${props.comment.y})`}>
      <rect
        width={props.comment.width}
        height={props.comment.height}
        rx="6"
        ry="6"
        fill={props.comment.color ?? 'rgba(255, 240, 180, 0.85)'}
        stroke="rgba(180, 140, 60, 0.6)"
        stroke-width="1"
        onMouseDown={props.onMoveStart}
      />
      <foreignObject
        x="0"
        y="0"
        width={props.comment.width}
        height={props.comment.height}
        pointer-events="none"
      >
        <div
          class="lens-comment-body"
          style={{ width: `${props.comment.width}px`, height: `${props.comment.height}px` }}
        >
          <textarea
            class="lens-comment-text"
            value={props.comment.text}
            onInput={(e) =>
              GraphComments.update(props.comment.id, { text: e.currentTarget.value })
            }
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="メモ / グループ説明"
          />
          <button
            type="button"
            class="lens-comment-delete"
            title="メモを削除"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('このメモを削除しますか?')) {
                GraphComments.remove(props.comment.id);
              }
            }}
          >
            ×
          </button>
        </div>
      </foreignObject>
      {/* 右下リサイズハンドル (SVG 上に直接置く — foreignObject の pointer-events は none) */}
      <rect
        class="lens-comment-resize"
        x={props.comment.width - 14}
        y={props.comment.height - 14}
        width="14"
        height="14"
        fill="rgba(180, 140, 60, 0.6)"
        rx="2"
        ry="2"
        onMouseDown={props.onResizeStart}
        style={{ cursor: 'nwse-resize' }}
      />
    </g>
  );
};

function clampScale(s: number): number {
  return Math.max(0.1, Math.min(4, s));
}

function colorForTemplate(templateId: string): string {
  switch (templateId) {
    case 'template.character':
      return '#56b4e9';
    case 'template.location':
      return '#009e73';
    case 'template.item':
      return '#e69f00';
    case 'template.faction':
      return '#cc79a7';
    default:
      return '#cccccc';
  }
}

function shapeForTemplate(templateId: string): 'circle' | 'square' | 'triangle' | 'diamond' {
  switch (templateId) {
    case 'template.character':
      return 'circle';
    case 'template.location':
      return 'square';
    case 'template.item':
      return 'triangle';
    case 'template.faction':
      return 'diamond';
    default:
      return 'circle';
  }
}

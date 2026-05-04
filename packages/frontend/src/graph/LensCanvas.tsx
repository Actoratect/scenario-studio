import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { LensEdge, LensPayload, NodeId } from '@scenario-studio/core';

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
  | { kind: 'connect'; source: NodeId; toX: number; toY: number };

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
    if (e.shiftKey) {
      const p = pos(id);
      setDrag({ kind: 'connect', source: id, toX: p.x, toY: p.y });
    } else {
      const p = pos(id);
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
    // connect: マウス位置を world に変換して rubber-band の終端に
    const w = clientToWorld(e.clientX, e.clientY);
    setDrag({ ...d, toX: w.x, toY: w.y });
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
    return { w: Math.max(28, ch * 8 + 14), h: 18 };
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
            const s = pos(edge.source);
            const t = pos(edge.target);
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const sx = s.x + ux * NODE_RADIUS;
            const sy = s.y + uy * NODE_RADIUS;
            const tx = t.x - ux * NODE_RADIUS;
            const ty = t.y - uy * NODE_RADIUS;
            const mid = { x: (sx + tx) / 2, y: (sy + ty) / 2 };
            const dim = isDimmed(edge.source) || isDimmed(edge.target);
            const box = edgeBox(edge.label);
            const explicit = edge.kind === 'explicit';
            return (
              <g class="lens-edge" classList={{ 'lens-edge--dimmed': dim }}>
                <line
                  x1={sx}
                  y1={sy}
                  x2={tx}
                  y2={ty}
                  stroke={explicit ? '#0072b2' : '#5a6068'}
                  stroke-width={explicit ? 2 : 1.5}
                  stroke-dasharray={explicit ? undefined : '4 3'}
                  marker-end={`url(#${explicit ? 'arrow-marker-explicit' : 'arrow-marker'})`}
                />
                <g
                  transform={`translate(${mid.x}, ${mid.y})`}
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
                    x={-box.w / 2}
                    y={-box.h / 2}
                    width={box.w}
                    height={box.h}
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
            const d = drag() as { kind: 'connect'; source: NodeId; toX: number; toY: number };
            const s = pos(d.source);
            return (
              <line
                x1={s.x}
                y1={s.y}
                x2={d.toX}
                y2={d.toY}
                stroke="#0072b2"
                stroke-width="2"
                stroke-dasharray="6 4"
                opacity="0.7"
                pointer-events="none"
              />
            );
          }}
        </Show>

        {/* nodes */}
        <For each={props.payload.nodes}>
          {(node) => {
            const p = pos(node.id);
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
                transform={`translate(${p.x}, ${p.y})`}
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
                <text class="lens-node-label" y={NODE_RADIUS + 14}>
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

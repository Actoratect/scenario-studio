import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { LensPayload, NodeId } from '@scenario-studio/core';

// SVG ベースの軽量グラフ canvas (PR-C 拡張版)。
// 機能:
//  - pan / zoom (ホイール / ドラッグで背景)
//  - 個別ノードの drag & drop で位置を更新 (onPositionChange に通知)
//  - edge label を中間に矩形 Box で描画 (relation 名)
//  - ノードのダブルクリックで onActivate (Inspector ジャンプ)
//  - Era フィルタが適用されると dimmed[] のノードを薄く表示
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §1, §3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M5

export interface LensCanvasProps {
  payload: LensPayload;
  positions: ReadonlyMap<NodeId, { x: number; y: number }>;
  onSelect?: (id: NodeId) => void;
  onActivate?: (id: NodeId) => void;
  onPositionChange?: (id: NodeId, p: { x: number; y: number }) => void;
  selected?: NodeId | undefined;
  /** dimmed (Era フィルタで対象外) のノード id 集合。半透明描画。 */
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
  | { kind: 'node'; id: NodeId; startX: number; startY: number; px: number; py: number };

export const LensCanvas: Component<LensCanvasProps> = (props) => {
  let svg: SVGSVGElement | undefined;
  const [view, setView] = createSignal<ViewState>({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = createSignal<DragMode | null>(null);

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
    // ノードクリックの onMouseDown は stopPropagation するため、ここはほぼ「背景」のみ
    const v = view();
    setDrag({ kind: 'pan', startX: e.clientX, startY: e.clientY, vx: v.x, vy: v.y });
    e.preventDefault();
  }

  function onNodeMouseDown(e: MouseEvent, id: NodeId): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = pos(id);
    setDrag({ kind: 'node', id, startX: e.clientX, startY: e.clientY, px: p.x, py: p.y });
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
    // ノードドラッグ: world 座標で delta を反映
    const v = view();
    const dx = (e.clientX - d.startX) / v.scale;
    const dy = (e.clientY - d.startY) / v.scale;
    props.onPositionChange?.(d.id, { x: d.px + dx, y: d.py + dy });
  }

  function onMouseUp(): void {
    setDrag(null);
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

  // edge label のサイズを文字数から見積もる (SVG の getBBox 同期は重いので近似)
  function edgeBox(label: string): { w: number; h: number } {
    const ch = label.length;
    return { w: Math.max(28, ch * 7 + 12), h: 18 };
  }

  // 矢印マーカーの ID。SVG defs に 1 度だけ宣言。
  const ARROW = createMemo(() => 'arrow-marker');

  // 全 connect 不要だが clientToWorld を eslint で参照済み判定にするための no-op
  void clientToWorld;

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
          id={ARROW()}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5a6068" />
        </marker>
      </defs>
      <g transform={`translate(${view().x}, ${view().y}) scale(${view().scale})`}>
        {/* edges 描画 */}
        <For each={props.payload.edges}>
          {(edge) => {
            const s = pos(edge.source);
            const t = pos(edge.target);
            // 端点をノード半径ぶん内側に詰めて矢印が円の外に来るように
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
            const box = edgeBox(edge.fieldId);
            return (
              <g class="lens-edge" classList={{ 'lens-edge--dimmed': dim }}>
                <line
                  x1={sx}
                  y1={sy}
                  x2={tx}
                  y2={ty}
                  stroke="#5a6068"
                  stroke-width="1.5"
                  marker-end={`url(#${ARROW()})`}
                />
                <g transform={`translate(${mid.x}, ${mid.y})`}>
                  <rect
                    x={-box.w / 2}
                    y={-box.h / 2}
                    width={box.w}
                    height={box.h}
                    rx="4"
                    ry="4"
                    fill="#ffffff"
                    stroke="#5a6068"
                    stroke-width="1"
                  />
                  <text class="lens-edge-label" text-anchor="middle" dominant-baseline="middle">
                    {edge.fieldId}
                  </text>
                </g>
              </g>
            );
          }}
        </For>
        {/* nodes 描画 */}
        <For each={props.payload.nodes}>
          {(node) => {
            const p = pos(node.id);
            const isSelected = () => props.selected === node.id;
            const dim = () => isDimmed(node.id);
            return (
              <g
                class="lens-node"
                classList={{
                  'lens-node--selected': isSelected(),
                  'lens-node--dimmed': dim(),
                }}
                transform={`translate(${p.x}, ${p.y})`}
                onMouseDown={(e) => onNodeMouseDown(e, node.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onSelect?.(node.id);
                }}
                onDblClick={(e) => {
                  e.stopPropagation();
                  props.onActivate?.(node.id);
                }}
              >
                <circle
                  r={NODE_RADIUS}
                  fill={colorForTemplate(node.templateId)}
                  stroke={isSelected() ? '#0072b2' : '#1a1d24'}
                  stroke-width={isSelected() ? 3 : 1.5}
                />
                {/* ノード形状を template ごとに区別する小マーカー (色覚冗長化 — CUDO 配慮) */}
                <Show when={shapeForTemplate(node.templateId) === 'square'}>
                  <rect x={-6} y={-6} width={12} height={12} fill="#1a1d24" opacity="0.55" />
                </Show>
                <Show when={shapeForTemplate(node.templateId) === 'triangle'}>
                  <polygon points="0,-7 6,5 -6,5" fill="#1a1d24" opacity="0.55" />
                </Show>
                <Show when={shapeForTemplate(node.templateId) === 'diamond'}>
                  <polygon points="0,-7 7,0 0,7 -7,0" fill="#1a1d24" opacity="0.55" />
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
  // CUDO 配色をテンプレ ID で固定 (ハッシュ揺れを避け、再起動でも同じ色)
  switch (templateId) {
    case 'template.character':
      return '#56b4e9'; // sky
    case 'template.location':
      return '#009e73'; // green
    case 'template.item':
      return '#e69f00'; // orange
    case 'template.faction':
      return '#cc79a7'; // purple
    default:
      return '#cccccc';
  }
}

function shapeForTemplate(templateId: string): 'circle' | 'square' | 'triangle' | 'diamond' {
  // 色だけに依存せず、形でも識別できるよう冗長化
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

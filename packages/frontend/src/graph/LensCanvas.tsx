import { createSignal, For, onCleanup, onMount } from 'solid-js';
import type { Component } from 'solid-js';
import type { LensPayload, NodeId } from '@scenario-studio/core';

// SVG ベースの軽量グラフ canvas (M5)。
// solid-flow を使わず自前 SVG で書くことで bundle を抑え、ノード描画を完全制御。
// pan / zoom の基本だけ実装。Phase 1 後半で必要に応じて solid-flow / Sigma に切替判定。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §1, §3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M5

export interface LensCanvasProps {
  payload: LensPayload;
  positions: ReadonlyMap<NodeId, { x: number; y: number }>;
  onSelect?: (id: NodeId) => void;
  selected?: NodeId | undefined;
}

const NODE_RADIUS = 22;

export const LensCanvas: Component<LensCanvasProps> = (props) => {
  let svg: SVGSVGElement | undefined;
  const [view, setView] = createSignal({ x: 0, y: 0, scale: 1 });
  let dragging: { startX: number; startY: number; vx: number; vy: number } | null = null;

  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 1) return;
    const v = view();
    dragging = { startX: e.clientX, startY: e.clientY, vx: v.x, vy: v.y };
    e.preventDefault();
  }
  function onMouseMove(e: MouseEvent): void {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    const v = view();
    setView({ ...v, x: dragging.vx + dx, y: dragging.vy + dy });
  }
  function onMouseUp(): void {
    dragging = null;
  }
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const v = view();
    const next = clampScale(v.scale * factor);
    if (next === v.scale) return;
    // ズームの中心はマウス位置 (簡易)
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

  return (
    <svg ref={svg} class="lens-canvas" onMouseDown={onMouseDown} onWheel={onWheel}>
      <g transform={`translate(${view().x}, ${view().y}) scale(${view().scale})`}>
        {/* edges 描画 */}
        <For each={props.payload.edges}>
          {(edge) => {
            const s = pos(edge.source);
            const t = pos(edge.target);
            const mid = { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
            return (
              <g class="lens-edge">
                <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#aaa" stroke-width="1.5" />
                <text x={mid.x} y={mid.y} class="lens-edge-label">
                  {edge.fieldId}
                </text>
              </g>
            );
          }}
        </For>
        {/* nodes 描画 */}
        <For each={props.payload.nodes}>
          {(node) => {
            const p = pos(node.id);
            const isSelected = () => props.selected === node.id;
            return (
              <g
                class="lens-node"
                classList={{ 'lens-node--selected': isSelected() }}
                transform={`translate(${p.x}, ${p.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onSelect?.(node.id);
                }}
              >
                <circle
                  r={NODE_RADIUS}
                  fill={colorForTemplate(node.templateId)}
                  stroke={isSelected() ? '#1f6fff' : '#444'}
                  stroke-width={isSelected() ? 3 : 1.5}
                />
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
  // 04_graph-editor.md §1 のズーム範囲 10%-400%
  return Math.max(0.1, Math.min(4, s));
}

function colorForTemplate(templateId: string): string {
  // 簡易: テンプレ ID をハッシュして HSL に
  let h = 0;
  for (const c of templateId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}deg 60% 78%)`;
}

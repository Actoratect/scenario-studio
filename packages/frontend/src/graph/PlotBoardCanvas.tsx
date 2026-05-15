import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type {
  PlotBoard,
  PlotBoardEdge,
  PlotBoardEdgeId,
  PlotBoardNode,
  PlotBoardNodeId,
  PlotBoardNodeKind,
  PlotBoardPosition,
} from '@scenario-studio/core';
import { StableTextInput, StableTextarea } from '../global/StableTextControl';

export interface PlotBoardCanvasProps {
  board: PlotBoard;
  dimmed?: ReadonlySet<PlotBoardNodeId> | undefined;
  viewKey?: string | undefined;
  onAddNode: (kind: PlotBoardNodeKind, position: PlotBoardPosition) => void;
  onNodeChange: (id: PlotBoardNodeId, patch: Partial<Omit<PlotBoardNode, 'id'>>) => void;
  onNodeMove: (id: PlotBoardNodeId, position: PlotBoardPosition) => void;
  onNodeMoveCommit: (id: PlotBoardNodeId, position: PlotBoardPosition) => void;
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
    return {
      width: node.width ?? CARD_WIDTH,
      height: node.height ?? CARD_HEIGHT,
    };
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
        props.onNodeMoveCommit(d.id, current);
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
        <button type="button" onClick={() => addAtCenter('thread')}>
          ＋ スレッド
        </button>
        <button type="button" onClick={() => addAtCenter('beat')}>
          ＋ ビート
        </button>
        <button type="button" onClick={() => addAtCenter('memo')}>
          ＋ メモ
        </button>
        <span class="plot-board-toolbar-hint">カード上部をドラッグ / Shift+ドラッグで接続</span>
      </div>
      <svg
        ref={svg}
        class="plot-board-canvas"
        classList={{ 'plot-board-canvas--dragging': !!drag() }}
        onMouseDown={onBackgroundMouseDown}
        onWheel={onWheel}
        onDblClick={(e) => {
          if (e.target !== svg) return;
          props.onAddNode('beat', clientToWorld(e.clientX, e.clientY));
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
                  <div
                    class="plot-board-card"
                    classList={{
                      'plot-board-card--target':
                        drag()?.kind === 'connect' && hoverNode() === node.id,
                    }}
                    data-kind={node.kind}
                  >
                    <div
                      class="plot-board-card-header"
                      title="ドラッグで移動 / Shift+ドラッグで接続"
                      onMouseDown={(e) => onHeaderMouseDown(e, node)}
                    >
                      <span class="plot-board-card-kind">{kindLabel(node.kind)}</span>
                      <select
                        value={node.kind}
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          props.onNodeChange(node.id, {
                            kind: e.currentTarget.value as PlotBoardNodeKind,
                          })
                        }
                        title="ノード種別"
                      >
                        <option value="thread">スレッド</option>
                        <option value="beat">ビート</option>
                        <option value="memo">メモ</option>
                        <option value="question">問い</option>
                        <option value="scene_ref">シーン</option>
                      </select>
                      <button
                        type="button"
                        title="削除"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('このプロットノードを削除しますか?')) {
                            props.onNodeDelete(node.id);
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <StableTextInput
                      class="plot-board-card-title"
                      value={node.title}
                      placeholder="タイトル"
                      onInput={(title) => props.onNodeChange(node.id, { title })}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <StableTextarea
                      class="plot-board-card-body"
                      value={node.body}
                      placeholder="メモ / 台詞案 / 伏線 / 目的"
                      onInput={(body) => props.onNodeChange(node.id, { body })}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  </div>
                </foreignObject>
              );
            }}
          </For>
        </g>
      </svg>
    </div>
  );
};

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

function centerOf(node: PlotBoardNode): PlotBoardPosition {
  return {
    x: node.position.x + (node.width ?? CARD_WIDTH) / 2,
    y: node.position.y + (node.height ?? CARD_HEIGHT) / 2,
  };
}

function kindLabel(kind: PlotBoardNodeKind): string {
  switch (kind) {
    case 'thread':
      return 'スレッド';
    case 'beat':
      return 'ビート';
    case 'memo':
      return 'メモ';
    case 'question':
      return '問い';
    case 'scene_ref':
      return 'シーン';
  }
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

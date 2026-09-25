import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  createUniqueId,
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
import { fitGraphBounds, plotCardSize, plotNodeAt, PLOT_NODE_KINDS } from './plot-board-model';
import './editor.css';
import { StableTextarea, StableTextInput } from '../global/StableTextControl';

export interface PlotBoardCanvasProps {
  board: PlotBoard;
  dimmed?: ReadonlySet<PlotBoardNodeId> | undefined;
  referenceNodes?: readonly ScenarioNode[] | undefined;
  viewKey?: string | undefined;
  onAddNode: (kind: PlotBoardNodeKind, position: PlotBoardPosition) => PlotBoardNodeId | undefined;
  onDuplicateNode: (id: PlotBoardNodeId) => PlotBoardNodeId | undefined;
  sceneOptions?: readonly { id: string; label: string }[] | undefined;
  onOpenScene?: (id: string) => void;
  onOpenNode?: (id: NodeId) => void;
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
const CARD_WIDTH = 250;
const CARD_HEIGHT = 156;

export const PlotBoardCanvas: Component<PlotBoardCanvasProps> = (props) => {
  let svg: SVGSVGElement | undefined;
  const markerId = createUniqueId();
  const [selected, setSelected] = createSignal<PlotBoardNodeId>();
  const [addKind, setAddKind] = createSignal<PlotBoardNodeKind>('memo');
  const viewStorageKey = createMemo(() => props.viewKey);
  const [view, setViewSignal] = createSignal<ViewState>({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = createSignal<DragMode | null>(null);

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

  createEffect(() => {
    setViewSignal(loadView(viewStorageKey()));
    setSelected(undefined);
    setDrag(null);
  });

  onMount(() => {
    const frame = requestAnimationFrame(() => {
      try {
        if (!props.viewKey || !localStorage.getItem(`${VIEW_PREFIX}${props.viewKey}`)) fitAll();
      } catch {
        fitAll();
      }
    });
    onCleanup(() => cancelAnimationFrame(frame));
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
    setSelected(undefined);
    svg?.focus();
    setDrag({ kind: 'pan', startX: e.clientX, startY: e.clientY, vx: view().x, vy: view().y });
    e.preventDefault();
  }

  function onHeaderMouseDown(e: MouseEvent, node: PlotBoardNode): void {
    if (e.button !== 0) return;
    setSelected(node.id);
    svg?.focus();
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
    return plotNodeAt(props.board.nodes, point, except);
  }

  function fitAll(): void {
    const rect = svg?.getBoundingClientRect();
    if (!rect || props.board.nodes.length === 0) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const nodes = props.board.nodes;
    const x = Math.min(...nodes.map((node) => node.position.x));
    const y = Math.min(...nodes.map((node) => node.position.y));
    const right = Math.max(...nodes.map((node) => node.position.x + cardSize(node).width));
    const bottom = Math.max(...nodes.map((node) => node.position.y + cardSize(node).height));
    setView(fitGraphBounds({ x, y, width: right - x, height: bottom - y }, rect));
  }

  function onWheel(e: WheelEvent): void {
    if (e.target instanceof Element && e.target.closest('textarea, select, input')) return;
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
    let position = center;
    while (
      props.board.nodes.some(
        (node) => Math.hypot(node.position.x - position.x, node.position.y - position.y) < 24,
      )
    )
      position = { x: position.x + 28, y: position.y + 28 };
    setSelected(props.onAddNode(kind, position));
  }

  function isDimmed(id: PlotBoardNodeId): boolean {
    return props.dimmed?.has(id) ?? false;
  }

  // 接続ドラッグ中の接続先候補。確定 (onMouseUp の nearestNode) と同じ基準で
  // ハイライトするため、ポインタ位置の最近傍ノードを使う (旧 hover 基準だと
  // ハイライト無しのまま接続成立するなど挙動が乖離していた)。
  const connectTarget = createMemo<PlotBoardNodeId | undefined>(() => {
    const d = drag();
    if (!d || d.kind !== 'connect') return undefined;
    return nearestNode({ x: d.toX, y: d.toY }, d.source);
  });

  return (
    <div class="plot-board-shell">
      <div class="plot-board-toolbar">
        <select
          aria-label="追加するカードの種類"
          value={addKind()}
          onChange={(event) => setAddKind(event.currentTarget.value as PlotBoardNodeKind)}
        >
          <For each={PLOT_NODE_KINDS}>
            {(kind) => <option value={kind.value}>{kind.label}</option>}
          </For>
        </select>
        <button type="button" onClick={() => addAtCenter(addKind())}>
          ＋ カード
        </button>
        <button type="button" onClick={fitAll}>
          全体表示
        </button>
        <button
          type="button"
          onClick={() => setView({ x: 0, y: 0, scale: 1 })}
          title="表示位置と倍率をリセット"
        >
          100%
        </button>
        <span class="plot-board-toolbar-hint">上部をドラッグで移動 · 「接続 →」からドラッグ</span>
      </div>
      <svg
        ref={svg}
        class="plot-board-canvas"
        tabIndex={0}
        aria-label="プロットボード。Fで全体表示、Deleteで選択カードを削除"
        onKeyDown={(event) => {
          if (event.target instanceof Element && event.target.closest('input, textarea, select'))
            return;
          if (event.key.toLowerCase() === 'f') {
            event.preventDefault();
            fitAll();
          }
          if (event.key === 'Escape') {
            setDrag(null);
            setSelected(undefined);
          }
          if ((event.key === 'Delete' || event.key === 'Backspace') && selected()) {
            event.preventDefault();
            props.onNodeDelete(selected()!);
            setSelected(undefined);
          }
        }}
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
            id={markerId}
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
                        marker-end={`url(#${markerId})`}
                      />
                      {/* 当たり判定 (太い透明線): クリックで編集 / Alt+クリックで削除 */}
                      <line
                        class="plot-board-edge-hit"
                        x1={g().sx}
                        y1={g().sy}
                        x2={g().tx}
                        y2={g().ty}
                        stroke="transparent"
                        stroke-width={12 / view().scale}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (e.altKey) props.onEdgeDelete(edge.id);
                          else props.onEdgeEdit(edge.id);
                        }}
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
                          title="クリックで線を編集 / Alt+クリックで削除"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (e.altKey) props.onEdgeDelete(edge.id);
                            else props.onEdgeEdit(edge.id);
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
                () =>
                  drag() as { kind: 'connect'; source: PlotBoardNodeId; toX: number; toY: number },
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

          <For each={props.board.nodes.map((node) => node.id)}>
            {(id) => {
              const node = () => nodeById().get(id)!;
              const size = createMemo(() => cardSize(node()));
              return (
                <foreignObject
                  x={node().position.x}
                  y={node().position.y}
                  width={size().width}
                  height={size().height}
                  classList={{ 'plot-board-card-fo--dimmed': isDimmed(id) }}
                >
                  <PlotBoardMemoCard
                    selected={selected() === id}
                    onSelect={() => setSelected(id)}
                    onConnect={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSelected(id);
                      const center = nodeCenter(node());
                      setDrag({ kind: 'connect', source: id, toX: center.x, toY: center.y });
                    }}
                    node={node()}
                    target={connectTarget() === id}
                    referenceNodeById={referenceNodeById()}
                    referenceNodes={sortedReferenceNodes()}
                    onHeaderMouseDown={(e) => onHeaderMouseDown(e, node())}
                    onNodeChange={(patch) => props.onNodeChange(id, patch)}
                    onNodeCommit={() => props.onNodeCommit(id)}
                    onNodeDelete={() => props.onNodeDelete(id)}
                  />
                </foreignObject>
              );
            }}
          </For>
        </g>
      </svg>
      <Show when={selected() ? nodeById().get(selected()!) : undefined}>
        {(node) => (
          <aside class="plot-board-inspector" aria-label="選択カードの詳細">
            <header>
              <strong>{node().title || '無題カード'}</strong>
              <button
                type="button"
                onClick={() => setSelected(undefined)}
                aria-label="カード詳細を閉じる"
              >
                ×
              </button>
            </header>
            <label>
              種類
              <select
                value={node().kind}
                onChange={(event) =>
                  props.onNodeChange(node().id, {
                    kind: event.currentTarget.value as PlotBoardNodeKind,
                  })
                }
              >
                <For each={PLOT_NODE_KINDS}>
                  {(kind) => <option value={kind.value}>{kind.label}</option>}
                </For>
              </select>
            </label>
            <label>
              状態
              <select
                value={node().status ?? ''}
                onChange={(event) =>
                  props.onNodeChange(node().id, { status: event.currentTarget.value || undefined })
                }
              >
                <option value="">未設定</option>
                <option value="draft">検討中</option>
                <option value="ready">構成確定</option>
                <option value="done">完了</option>
                <Show when={node().status && !['draft', 'ready', 'done'].includes(node().status!)}>
                  <option value={node().status}>{node().status}</option>
                </Show>
              </select>
            </label>
            <Show
              when={props.board.nodes.some(
                (other) => other.kind === 'thread' && other.id !== node().id,
              )}
            >
              <fieldset>
                <legend>所属スレッド</legend>
                <For
                  each={props.board.nodes.filter(
                    (other) => other.kind === 'thread' && other.id !== node().id,
                  )}
                >
                  {(thread) => (
                    <label class="plot-board-thread-option">
                      <input
                        type="checkbox"
                        checked={node().threadIds?.includes(thread.id) ?? false}
                        onChange={(event) =>
                          props.onNodeChange(node().id, {
                            threadIds: event.currentTarget.checked
                              ? [...(node().threadIds ?? []), thread.id]
                              : (node().threadIds ?? []).filter((id) => id !== thread.id),
                          })
                        }
                      />
                      {thread.title}
                    </label>
                  )}
                </For>
              </fieldset>
            </Show>
            <label>
              シーンへの参照
              <select
                value=""
                onChange={(event) => {
                  const id = event.currentTarget.value;
                  event.currentTarget.value = '';
                  if (id)
                    props.onNodeChange(node().id, {
                      anchors: {
                        ...node().anchors,
                        scenes: [...(node().anchors?.scenes ?? []), id],
                      },
                    });
                }}
              >
                <option value="">シーンを追加…</option>
                <For
                  each={(props.sceneOptions ?? []).filter(
                    (scene) => !node().anchors?.scenes?.includes(scene.id),
                  )}
                >
                  {(scene) => <option value={scene.id}>{scene.label}</option>}
                </For>
              </select>
            </label>
            <For each={node().anchors?.scenes ?? []}>
              {(id) => (
                <div class="plot-board-anchor">
                  <button type="button" onClick={() => props.onOpenScene?.(id)}>
                    {props.sceneOptions?.find((scene) => scene.id === id)?.label ?? id} ↗
                  </button>
                  <button
                    type="button"
                    aria-label="シーン参照を外す"
                    onClick={() =>
                      props.onNodeChange(node().id, {
                        anchors: {
                          ...node().anchors,
                          scenes: node().anchors?.scenes?.filter((scene) => scene !== id),
                        },
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              )}
            </For>
            <label>
              キャラ・場所への参照
              <select
                value=""
                onChange={(event) => {
                  const id = event.currentTarget.value as NodeId;
                  event.currentTarget.value = '';
                  if (id) props.onNodeChange(node().id, addReferencePatch(node(), id));
                }}
              >
                <option value="">要素を追加…</option>
                <For
                  each={groupReferenceNodesByTemplate(
                    availableReferenceNodes(node(), sortedReferenceNodes()),
                  )}
                >
                  {(group) => (
                    <optgroup label={group.label}>
                      <For each={group.nodes}>
                        {(reference) => (
                          <option value={reference.id}>{scenarioNodeLabel(reference)}</option>
                        )}
                      </For>
                    </optgroup>
                  )}
                </For>
              </select>
            </label>
            <For each={node().anchors?.nodes ?? []}>
              {(id) => (
                <div class="plot-board-anchor">
                  <button type="button" onClick={() => props.onOpenNode?.(id)}>
                    {referenceNodeById().has(id)
                      ? scenarioNodeLabel(referenceNodeById().get(id)!)
                      : id}{' '}
                    ↗
                  </button>
                  <button
                    type="button"
                    aria-label="要素参照を外す"
                    onClick={() => props.onNodeChange(node().id, removeReferencePatch(node(), id))}
                  >
                    ×
                  </button>
                </div>
              )}
            </For>
            <div class="plot-board-inspector-actions">
              <button type="button" onClick={() => setSelected(props.onDuplicateNode(node().id))}>
                複製
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onNodeDelete(node().id);
                  setSelected(undefined);
                }}
              >
                削除
              </button>
            </div>
          </aside>
        )}
      </Show>
      <Show when={props.board.nodes.length === 0}>
        <div class="plot-board-empty" aria-hidden="true">
          <p class="plot-board-empty-title">まだカードがありません</p>
          <p>背景をダブルクリック、または「＋ カード」で追加できます。</p>
          <p class="plot-board-empty-hint">
            上部をドラッグで移動 / 「接続 →」から別カードへドラッグ
          </p>
        </div>
      </Show>
    </div>
  );
};

interface PlotBoardMemoCardProps {
  node: PlotBoardNode;
  target: boolean;
  selected: boolean;
  onSelect: () => void;
  onConnect: (event: MouseEvent) => void;
  referenceNodeById: ReadonlyMap<NodeId, ScenarioNode>;
  referenceNodes: readonly ScenarioNode[];
  onHeaderMouseDown: (e: MouseEvent) => void;
  onNodeChange: (patch: Partial<Omit<PlotBoardNode, 'id'>>) => void;
  onNodeCommit: () => void;
  onNodeDelete: () => void;
}

const PlotBoardMemoCard: Component<PlotBoardMemoCardProps> = (props) => {
  const mode = () => props.node.viewMode ?? 'summary';
  return (
    <div
      class="plot-board-card"
      classList={{
        'plot-board-card--target': props.target,
        'plot-board-card--selected': props.selected,
      }}
      data-kind={props.node.kind}
      data-mode={mode()}
      onMouseDown={(event) => {
        event.stopPropagation();
        props.onSelect();
      }}
    >
      <div class="plot-board-card-header" onMouseDown={(event) => props.onHeaderMouseDown(event)}>
        <span class="plot-board-drag-grip" aria-hidden="true">
          ⠇
        </span>
        <StableTextInput
          class="plot-board-card-kind plot-board-card-kind-edit"
          value={props.node.title}
          onInput={(title) => props.onNodeChange({ title })}
          onBlur={props.onNodeCommit}
          onMouseDown={(event) => event.stopPropagation()}
        />
        <button
          type="button"
          class="plot-board-mode-toggle"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => props.onNodeChange({ viewMode: mode() === 'full' ? 'summary' : 'full' })}
        >
          {mode() === 'full' ? '折畳' : '展開'}
        </button>
        <button
          type="button"
          title="削除"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => props.onNodeDelete()}
        >
          ×
        </button>
      </div>
      <StableTextarea
        class={`plot-board-card-body plot-board-card-body--${mode()}`}
        value={props.node.body}
        placeholder="メモ・台詞案・伏線を記入"
        onInput={(body) => props.onNodeChange({ body })}
        onBlur={props.onNodeCommit}
        onMouseDown={(event) => event.stopPropagation()}
      />
      <div class="plot-board-card-footer">
        <span>{PLOT_NODE_KINDS.find((kind) => kind.value === props.node.kind)?.label}</span>
        <span>
          {(props.node.anchors?.nodes?.length ?? 0) + (props.node.anchors?.scenes?.length ?? 0) > 0
            ? `参照 ${(props.node.anchors?.nodes?.length ?? 0) + (props.node.anchors?.scenes?.length ?? 0)}`
            : ''}
        </span>
        <button
          type="button"
          class="plot-board-connect"
          title="ここから別カードへドラッグして接続"
          onMouseDown={(event) => props.onConnect(event)}
        >
          接続 →
        </button>
      </div>
    </div>
  );
};

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
  // 端点は各カードの実サイズから矩形境界との交点で求める。
  // 固定オフセット (旧 92/46) と違い、可変幅/full カードでも矢印頭が縁にぴたりと付く。
  const start = rectBorderPoint(s, cardSizeOf(source), dx, dy);
  const end = rectBorderPoint(t, cardSizeOf(target), -dx, -dy);
  return {
    sx: start.x,
    sy: start.y,
    tx: end.x,
    ty: end.y,
    mx: (start.x + end.x) / 2,
    my: (start.y + end.y) / 2,
  };
}

// 中心 center から方向 (dx,dy) へ伸ばした半直線と、幅/高さ size の矩形境界との交点。
function rectBorderPoint(
  center: PlotBoardPosition,
  size: { width: number; height: number },
  dx: number,
  dy: number,
): PlotBoardPosition {
  const hw = size.width / 2;
  const hh = size.height / 2;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < 1e-6 && ady < 1e-6) return { x: center.x, y: center.y };
  const scale = 1 / Math.max(adx / hw, ady / hh);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

// width/height は壊れた YAML 由来で NaN/Infinity になり得る (parseNode は finite を
// 強制するが、防御を二重化して SVG 座標が NaN で全描画が崩れるのを防ぐ)。
const cardSizeOf = plotCardSize;

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
      x: typeof parsed.x === 'number' && Number.isFinite(parsed.x) ? parsed.x : 0,
      y: typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : 0,
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

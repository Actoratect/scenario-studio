import {
  createMainPlotBoard,
  createPlotBoardEdge,
  createPlotBoardNode,
  MAIN_PLOT_BOARD_ID,
  type PlotBoard,
  type PlotBoardEdgeId,
  type PlotBoardNode,
  type PlotBoardNodeId,
  type PlotBoardNodeKind,
  type PlotBoardPosition,
} from '@scenario-studio/core';
import { createSignal } from 'solid-js';
import { GlobalHistoryService } from './GlobalHistoryService';
import { ProjectService, type OpenProjectContext } from './ProjectService';
import { GraphPersistence } from '../graph/graph-persistence';
import { plotBody } from '../graph/plot-board-model';
import { Toast } from './Toast';

type SaveMode = 'immediate' | 'debounced' | 'none';
type BoardState = { projectKey: string; board: PlotBoard };

const persistence = new GraphPersistence();
let lastTextEdit: { nodeId: PlotBoardNodeId; revision: number; at: number } | undefined;
const [localBoard, setLocalBoard] = createSignal<BoardState | undefined>(undefined);
let historyProjectKey: string | undefined;
let applyingHistory = false;
const undoBoards: PlotBoard[] = [];
const redoBoards: PlotBoard[] = [];
const normalizedBoards = new WeakSet<PlotBoard>();

function projectKey(ctx: OpenProjectContext): string {
  return ctx.handle.id;
}

function currentBoardFrom(ctx: OpenProjectContext): PlotBoard {
  const board =
    ctx.project.plotBoards.find((b) => b.id === MAIN_PLOT_BOARD_ID) ?? createMainPlotBoard();
  if (normalizedBoards.has(board)) return board;
  const normalized = {
    ...board,
    nodes: board.nodes.map((node) => ({
      ...node,
      body: plotBody(node),
      bodyFormat: 'plain' as const,
    })),
  };
  normalizedBoards.add(normalized);
  Object.assign(ctx.project, {
    plotBoards: [
      normalized,
      ...ctx.project.plotBoards.filter((other) => other.id !== normalized.id),
    ],
  });
  return normalized;
}

function replaceBoardInProject(ctx: OpenProjectContext, board: PlotBoard): void {
  normalizedBoards.add(board);
  const others = ctx.project.plotBoards.filter((b) => b.id !== board.id);
  Object.assign(ctx.project, { plotBoards: [board, ...others] });
  setLocalBoard({ projectKey: projectKey(ctx), board });
}

function schedulePersist(ctx: OpenProjectContext, board: PlotBoard, mode: SaveMode): void {
  if (mode === 'none') return;
  const snapshot = cloneBoard(board);
  persistence.schedule(
    projectKey(ctx),
    () => ctx.plotBoardRepository.saveMain(snapshot),
    mode === 'immediate',
  );
}

function updateBoard(next: PlotBoard, mode: SaveMode, merge = false): void {
  const ctx = ProjectService.currentProject();
  if (!ctx) return;
  const before = currentBoardFrom(ctx);
  if (mode !== 'none' && !merge) recordHistory(ctx, before);
  replaceBoardInProject(ctx, next);
  schedulePersist(ctx, next, mode);
}

function withNode(
  nodeId: PlotBoardNodeId,
  patch: Partial<Omit<PlotBoardNode, 'id'>>,
): PlotBoard | undefined {
  const ctx = ProjectService.currentProject();
  if (!ctx) return undefined;
  const board = currentBoardFrom(ctx);
  let changed = false;
  const nodes = board.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    const next = { ...node, ...patch };
    changed = hasNodeChanged(node, next);
    return changed ? next : node;
  });
  return changed ? { ...board, nodes } : undefined;
}

function ensureHistoryProject(ctx: OpenProjectContext): void {
  const key = projectKey(ctx);
  if (historyProjectKey === key) return;
  historyProjectKey = key;
  undoBoards.length = 0;
  redoBoards.length = 0;
}

function recordHistory(ctx: OpenProjectContext, before: PlotBoard): void {
  ensureHistoryProject(ctx);
  if (applyingHistory) return;
  undoBoards.push(cloneBoard(before));
  redoBoards.length = 0;
  // 上限トリムは GlobalHistoryService の単一スタックに委譲する。plotBoard マーカーが
  // トリムされると onTrimOldest が呼ばれ undoBoards も同期で削るため、本数が常に一致し
  // 孤立スナップショットが残らない (旧: 独立 200 トリムで desync していた)。
  GlobalHistoryService.recordPlotBoard('プロットボードの変更');
}

function canUseHistory(stack: readonly PlotBoard[]): boolean {
  const ctx = ProjectService.currentProject();
  if (!ctx) return false;
  ensureHistoryProject(ctx);
  return stack.length > 0;
}

async function restoreHistoryBoard(source: PlotBoard[], target: PlotBoard[]): Promise<boolean> {
  const ctx = ProjectService.currentProject();
  if (!ctx) return false;
  ensureHistoryProject(ctx);
  const board = source.pop();
  if (!board) return false;
  applyingHistory = true;
  try {
    target.push(cloneBoard(currentBoardFrom(ctx)));
    replaceBoardInProject(ctx, cloneBoard(board));
    schedulePersist(ctx, board, 'immediate');
  } finally {
    applyingHistory = false;
  }
  return true;
}

function hasNodeChanged(prev: PlotBoardNode, next: PlotBoardNode): boolean {
  return (
    prev.kind !== next.kind ||
    prev.title !== next.title ||
    prev.body !== next.body ||
    prev.viewMode !== next.viewMode ||
    prev.status !== next.status ||
    prev.color !== next.color ||
    prev.width !== next.width ||
    prev.height !== next.height ||
    prev.position.x !== next.position.x ||
    prev.position.y !== next.position.y ||
    JSON.stringify(prev.threadIds ?? []) !== JSON.stringify(next.threadIds ?? []) ||
    JSON.stringify(prev.anchors ?? {}) !== JSON.stringify(next.anchors ?? {})
  );
}

GlobalHistoryService.registerPlotBoardController({
  canUndo: () => canUseHistory(undoBoards),
  canRedo: () => canUseHistory(redoBoards),
  undo: () => restoreHistoryBoard(undoBoards, redoBoards),
  redo: () => restoreHistoryBoard(redoBoards, undoBoards),
  onTrimOldest: (side) => {
    (side === 'undo' ? undoBoards : redoBoards).shift();
  },
});

export const PlotBoardService = {
  currentBoard(): PlotBoard | undefined {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    const cached = localBoard();
    return cached?.projectKey === projectKey(ctx) ? cached.board : currentBoardFrom(ctx);
  },

  addNode(kind: PlotBoardNodeKind, position: PlotBoardPosition): PlotBoardNodeId | undefined {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    const node = {
      ...createPlotBoardNode({
        kind,
        title: defaultTitle(kind),
        body: '',
        position,
        viewMode: 'summary',
      }),
      bodyFormat: 'plain' as const,
    };
    updateBoard({ ...board, nodes: [...board.nodes, node] }, 'immediate');
    return node.id;
  },

  updateNode(nodeId: PlotBoardNodeId, patch: Partial<Omit<PlotBoardNode, 'id'>>): void {
    const next = withNode(nodeId, patch);
    if (!next) return;
    const textOnly = Object.keys(patch).every((key) => key === 'title' || key === 'body');
    const merge =
      textOnly &&
      lastTextEdit?.nodeId === nodeId &&
      lastTextEdit.revision === GlobalHistoryService.revision() &&
      Date.now() - lastTextEdit.at < 1200;
    updateBoard(next, 'debounced', merge);
    lastTextEdit = textOnly
      ? { nodeId, revision: GlobalHistoryService.revision(), at: Date.now() }
      : undefined;
  },

  moveNode(nodeId: PlotBoardNodeId, position: PlotBoardPosition): void {
    const next = withNode(nodeId, { position });
    if (next) updateBoard(next, 'none');
  },

  // ドラッグ確定。`from` (ドラッグ開始位置) を持つ board を履歴に積むことで
  // undo で移動前へ戻せるようにする。ライブドラッグ中 (moveNode='none') は
  // すでに ctx.project を最終位置で上書き済みのため、updateBoard 経由だと
  // before が「移動後」になり履歴が無効化される。専用経路で before を再構成する。
  commitNodeMove(
    nodeId: PlotBoardNodeId,
    position: PlotBoardPosition,
    from: PlotBoardPosition,
  ): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    if (!board.nodes.some((node) => node.id === nodeId)) return;
    const moveNodeTo = (target: PlotBoardPosition): PlotBoard => ({
      ...board,
      nodes: board.nodes.map((node) =>
        node.id === nodeId ? { ...node, position: { x: target.x, y: target.y } } : node,
      ),
    });
    if (position.x === from.x && position.y === from.y) return;
    recordHistory(ctx, moveNodeTo(from));
    const next = moveNodeTo(position);
    replaceBoardInProject(ctx, next);
    schedulePersist(ctx, next, 'debounced');
  },

  commitNode(nodeId: PlotBoardNodeId): void {
    void nodeId;
    lastTextEdit = undefined;
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    schedulePersist(ctx, currentBoardFrom(ctx), 'immediate');
  },

  flushPending: () => persistence.flushPending(),

  hasPending: () => persistence.hasPending(),

  reset(): void {
    persistence.discardPending();
    lastTextEdit = undefined;
    setLocalBoard(undefined);
    undoBoards.length = 0;
    redoBoards.length = 0;
    historyProjectKey = undefined;
  },

  duplicateNode(nodeId: PlotBoardNodeId): PlotBoardNodeId | undefined {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    const source = board.nodes.find((node) => node.id === nodeId);
    if (!source) return;
    const node = {
      ...source,
      ...createPlotBoardNode({
        ...source,
        position: { x: source.position.x + 32, y: source.position.y + 32 },
      }),
    };
    updateBoard({ ...board, nodes: [...board.nodes, node] }, 'immediate');
    return node.id;
  },

  /** シーンの改名・章移動に追従。旧slugだけの参照は他章と曖昧な場合は温存する。 */
  remapSceneReferences(
    previous: { chapterSlug: string; sceneSlug: string },
    next?: { chapterSlug: string; sceneSlug: string },
  ): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const oldKey = `${previous.chapterSlug}/${previous.sceneSlug}`;
    const newKey = next ? `${next.chapterSlug}/${next.sceneSlug}` : undefined;
    const ambiguous = ctx.project.scenario.chapters.some((chapter) =>
      chapter.scenes.some(
        (scene) =>
          scene.slug === previous.sceneSlug &&
          `${chapter.slug}/${scene.slug}` !== oldKey &&
          `${chapter.slug}/${scene.slug}` !== newKey,
      ),
    );
    const remap = (board: PlotBoard): PlotBoard => ({
      ...board,
      nodes: board.nodes.map((node) => {
        const scenes = node.anchors?.scenes;
        if (!scenes) return node;
        const mapped = scenes.flatMap((scene) =>
          scene === oldKey || (!ambiguous && scene === previous.sceneSlug)
            ? newKey
              ? [newKey]
              : []
            : [scene],
        );
        return { ...node, anchors: { ...node.anchors, scenes: [...new Set(mapped)] } };
      }),
    });
    const before = currentBoardFrom(ctx);
    const updated = remap(before);
    if (JSON.stringify(before) === JSON.stringify(updated)) return;
    for (let index = 0; index < undoBoards.length; index += 1)
      undoBoards[index] = remap(undoBoards[index]!);
    for (let index = 0; index < redoBoards.length; index += 1)
      redoBoards[index] = remap(redoBoards[index]!);
    updateBoard(updated, 'immediate', true);
  },

  removeNode(nodeId: PlotBoardNodeId): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    if (!board.nodes.some((node) => node.id === nodeId)) return;
    updateBoard(
      {
        ...board,
        nodes: board.nodes
          .filter((node) => node.id !== nodeId)
          .map((node) =>
            node.threadIds?.includes(nodeId)
              ? { ...node, threadIds: node.threadIds.filter((id) => id !== nodeId) }
              : node,
          ),
        edges: board.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      },
      'immediate',
    );
    // カードは確認なしで消えるので、戻せることを明示する (エッジ削除との非対称緩和)。
    Toast.info('カードを削除しました (Ctrl+Z で元に戻せます)', 3000);
  },

  addEdge(source: PlotBoardNodeId, target: PlotBoardNodeId): void {
    if (source === target) return;
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    if (
      !board.nodes.some((node) => node.id === source) ||
      !board.nodes.some((node) => node.id === target)
    )
      return;
    const exists = board.edges.some((edge) => edge.source === source && edge.target === target);
    if (exists) return;
    const edge = createPlotBoardEdge({ source, target, type: 'next' });
    updateBoard({ ...board, edges: [...board.edges, edge] }, 'immediate');
  },

  updateEdge(edgeId: PlotBoardEdgeId, patch: { type?: string; label?: string }): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    let changed = false;
    const edges = board.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const type =
        patch.type !== undefined && patch.type.trim() !== '' ? patch.type.trim() : edge.type;
      const label = patch.label !== undefined ? patch.label.trim() : edge.label;
      if (edge.type === type && (edge.label ?? '') === (label ?? '')) return edge;
      changed = true;
      return {
        ...edge,
        type,
        ...(label !== undefined && label !== '' ? { label } : { label: undefined }),
      };
    });
    if (changed) updateBoard({ ...board, edges }, 'immediate');
  },

  removeEdge(edgeId: PlotBoardEdgeId): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    if (!board.edges.some((edge) => edge.id === edgeId)) return;
    updateBoard({ ...board, edges: board.edges.filter((edge) => edge.id !== edgeId) }, 'immediate');
  },
};

function defaultTitle(kind: PlotBoardNodeKind): string {
  switch (kind) {
    case 'thread':
      return '新しいプロットスレッド';
    case 'beat':
      return '新しいビート';
    case 'memo':
      return '脚本メモ';
    case 'question':
      return '未解決の問い';
    case 'scene_ref':
      return 'シーン参照';
  }
}

function cloneBoard(board: PlotBoard): PlotBoard {
  return {
    ...board,
    nodes: board.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      ...(node.threadIds !== undefined ? { threadIds: [...node.threadIds] } : {}),
      ...(node.anchors !== undefined
        ? {
            anchors: {
              ...(node.anchors.chapters !== undefined
                ? { chapters: [...node.anchors.chapters] }
                : {}),
              ...(node.anchors.scenes !== undefined ? { scenes: [...node.anchors.scenes] } : {}),
              ...(node.anchors.nodes !== undefined ? { nodes: [...node.anchors.nodes] } : {}),
              ...(node.anchors.scriptBlocks !== undefined
                ? { scriptBlocks: [...node.anchors.scriptBlocks] }
                : {}),
            },
          }
        : {}),
    })),
    edges: board.edges.map((edge) => ({ ...edge })),
  };
}

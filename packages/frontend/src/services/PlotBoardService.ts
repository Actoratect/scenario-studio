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
import { ProjectService, type OpenProjectContext } from './ProjectService';
import { Toast } from './Toast';

type SaveMode = 'immediate' | 'debounced' | 'none';

let persistTimer: ReturnType<typeof setTimeout> | undefined;

function currentBoardFrom(ctx: OpenProjectContext): PlotBoard {
  return ctx.project.plotBoards.find((b) => b.id === MAIN_PLOT_BOARD_ID) ?? createMainPlotBoard();
}

function replaceBoardInProject(ctx: OpenProjectContext, board: PlotBoard): void {
  const others = ctx.project.plotBoards.filter((b) => b.id !== board.id);
  Object.assign(ctx.project, { plotBoards: [board, ...others] });
  ProjectService.touch();
}

function schedulePersist(ctx: OpenProjectContext, board: PlotBoard, mode: SaveMode): void {
  if (mode === 'none') return;
  const snapshot = cloneBoard(board);
  if (persistTimer) clearTimeout(persistTimer);
  if (mode === 'immediate') {
    persistTimer = undefined;
    void persist(ctx, snapshot);
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    void persist(ctx, snapshot);
  }, 250);
}

async function persist(ctx: OpenProjectContext, board: PlotBoard): Promise<void> {
  try {
    await ctx.plotBoardRepository.saveMain(board);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    Toast.error(`プロットボードの保存に失敗しました: ${message}`, 7000);
  }
}

function updateBoard(next: PlotBoard, mode: SaveMode): void {
  const ctx = ProjectService.currentProject();
  if (!ctx) return;
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
    changed = true;
    return { ...node, ...patch };
  });
  return changed ? { ...board, nodes } : undefined;
}

export const PlotBoardService = {
  currentBoard(): PlotBoard | undefined {
    const ctx = ProjectService.currentProject();
    return ctx ? currentBoardFrom(ctx) : undefined;
  },

  addNode(kind: PlotBoardNodeKind, position: PlotBoardPosition): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    const node = createPlotBoardNode({
      kind,
      title: defaultTitle(kind),
      position,
    });
    updateBoard({ ...board, nodes: [...board.nodes, node] }, 'immediate');
  },

  updateNode(nodeId: PlotBoardNodeId, patch: Partial<Omit<PlotBoardNode, 'id'>>): void {
    const next = withNode(nodeId, patch);
    if (next) updateBoard(next, 'debounced');
  },

  moveNode(nodeId: PlotBoardNodeId, position: PlotBoardPosition): void {
    const next = withNode(nodeId, { position });
    if (next) updateBoard(next, 'none');
  },

  commitNodeMove(nodeId: PlotBoardNodeId, position: PlotBoardPosition): void {
    const next = withNode(nodeId, { position });
    if (next) updateBoard(next, 'debounced');
  },

  removeNode(nodeId: PlotBoardNodeId): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    updateBoard(
      {
        ...board,
        nodes: board.nodes.filter((node) => node.id !== nodeId),
        edges: board.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      },
      'immediate',
    );
  },

  addEdge(source: PlotBoardNodeId, target: PlotBoardNodeId): void {
    if (source === target) return;
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
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
      changed = true;
      const type = patch.type !== undefined && patch.type.trim() !== '' ? patch.type.trim() : edge.type;
      const label = patch.label !== undefined ? patch.label.trim() : edge.label;
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
              ...(node.anchors.chapters !== undefined ? { chapters: [...node.anchors.chapters] } : {}),
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

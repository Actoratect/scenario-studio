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
import { SaveStatus } from './SaveStatus';
import { Toast } from './Toast';

type SaveMode = 'immediate' | 'debounced' | 'none';
type BoardState = { projectKey: string; board: PlotBoard };

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let pendingPersist: { ctx: OpenProjectContext; board: PlotBoard } | undefined;
const [localBoard, setLocalBoard] = createSignal<BoardState | undefined>(undefined);
let historyProjectKey: string | undefined;
let applyingHistory = false;
const undoBoards: PlotBoard[] = [];
const redoBoards: PlotBoard[] = [];

function projectKey(ctx: OpenProjectContext): string {
  return ctx.handle.id;
}

function currentBoardFrom(ctx: OpenProjectContext): PlotBoard {
  return ctx.project.plotBoards.find((b) => b.id === MAIN_PLOT_BOARD_ID) ?? createMainPlotBoard();
}

function replaceBoardInProject(ctx: OpenProjectContext, board: PlotBoard): void {
  const others = ctx.project.plotBoards.filter((b) => b.id !== board.id);
  Object.assign(ctx.project, { plotBoards: [board, ...others] });
  setLocalBoard({ projectKey: projectKey(ctx), board });
}

function schedulePersist(ctx: OpenProjectContext, board: PlotBoard, mode: SaveMode): void {
  if (mode === 'none') return;
  const snapshot = cloneBoard(board);
  pendingPersist = { ctx, board: snapshot };
  if (persistTimer) clearTimeout(persistTimer);
  if (mode === 'immediate') {
    persistTimer = undefined;
    pendingPersist = undefined;
    void persist(ctx, snapshot);
    return;
  }
  // debounce 待ち開始を保存ステータスに反映 (バッジに「保存待機」を出す)。
  SaveStatus.markPending();
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    pendingPersist = undefined;
    // 発火までに別プロジェクトへ切り替わっていたら旧 ctx へは書かない
    // (切替/close 経路の reset() が保留分を先に flush 済み)。
    const current = ProjectService.currentProject();
    if (current && projectKey(current) === projectKey(ctx)) {
      void persist(ctx, snapshot);
    }
  }, 1200);
}

async function persist(ctx: OpenProjectContext, board: PlotBoard): Promise<boolean> {
  const token = SaveStatus.beginSave();
  try {
    await ctx.plotBoardRepository.saveMain(board);
    SaveStatus.endSave(token);
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    SaveStatus.failSave(token, message);
    Toast.error(`プロットボードの保存に失敗しました: ${message}`, 7000);
    return false;
  }
}

function updateBoard(next: PlotBoard, mode: SaveMode): void {
  const ctx = ProjectService.currentProject();
  if (!ctx) return;
  const before = currentBoardFrom(ctx);
  if (mode !== 'none') recordHistory(ctx, before);
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
  GlobalHistoryService.recordPlotBoard();
}

function canUseHistory(stack: readonly PlotBoard[]): boolean {
  const ctx = ProjectService.currentProject();
  if (!ctx) return false;
  ensureHistoryProject(ctx);
  return stack.length > 0;
}

async function restoreHistoryBoard(
  source: PlotBoard[],
  target: PlotBoard[],
): Promise<boolean> {
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

  addNode(kind: PlotBoardNodeKind, position: PlotBoardPosition): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    const node = createPlotBoardNode({
      kind,
      title: defaultTitle(kind),
      body: defaultTitle(kind),
      position,
      viewMode: 'summary',
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
    recordHistory(ctx, moveNodeTo(from));
    const next = moveNodeTo(position);
    replaceBoardInProject(ctx, next);
    schedulePersist(ctx, next, 'debounced');
  },

  commitNode(nodeId: PlotBoardNodeId): void {
    void nodeId;
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    schedulePersist(ctx, currentBoardFrom(ctx), 'immediate');
  },

  /** debounce 待ちの保存を即時に flush し、結果を待って件数で返す。 */
  async flushPending(): Promise<{ saved: number; failed: number }> {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = undefined;
    }
    const pending = pendingPersist;
    pendingPersist = undefined;
    if (!pending) return { saved: 0, failed: 0 };
    const ok = await persist(pending.ctx, pending.board);
    return ok ? { saved: 1, failed: 0 } : { saved: 0, failed: 1 };
  },

  /** debounce 待ちの未保存変更があるか (beforeunload / close ガード用)。 */
  hasPending(): boolean {
    return pendingPersist !== undefined;
  },

  /**
   * プロジェクト切替/close 時にモジュール状態をリセットする。
   * 保留中の保存は (旧 ctx へ) best-effort で flush してから破棄し、
   * 残った debounce タイマーが新プロジェクトへ書き込むのを防ぐ。
   */
  reset(): void {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = undefined;
    }
    const pending = pendingPersist;
    pendingPersist = undefined;
    if (pending) void persist(pending.ctx, pending.board);
    setLocalBoard(undefined);
    undoBoards.length = 0;
    redoBoards.length = 0;
    historyProjectKey = undefined;
  },

  removeNode(nodeId: PlotBoardNodeId): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const board = currentBoardFrom(ctx);
    if (!board.nodes.some((node) => node.id === nodeId)) return;
    updateBoard(
      {
        ...board,
        nodes: board.nodes.filter((node) => node.id !== nodeId),
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

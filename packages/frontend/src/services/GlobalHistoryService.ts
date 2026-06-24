import { createSignal } from 'solid-js';

const HISTORY_LIMIT = 200;

type HistoryEntry =
  | { readonly domain: 'project' }
  | { readonly domain: 'script'; readonly path: string; readonly mergeKey?: string }
  | { readonly domain: 'plotBoard' };

type ApplyState = 'apply' | 'blocked' | 'stale';

interface ProjectHistoryController {
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => boolean | Promise<boolean>;
  redo: () => boolean | Promise<boolean>;
}

interface ScriptHistoryController {
  canUndo: (path: string) => boolean;
  canRedo: (path: string) => boolean;
  undo: (path: string) => boolean | Promise<boolean>;
  redo: (path: string) => boolean | Promise<boolean>;
}

interface PlotBoardHistoryController {
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => boolean | Promise<boolean>;
  redo: () => boolean | Promise<boolean>;
}

const undoStack: HistoryEntry[] = [];
const redoStack: HistoryEntry[] = [];
const [revision, setRevision] = createSignal(0);

let projectController: ProjectHistoryController | undefined;
let scriptController: ScriptHistoryController | undefined;
let plotBoardController: PlotBoardHistoryController | undefined;
let applying = false;

function touch(): void {
  setRevision((v) => v + 1);
}

function trim(stack: HistoryEntry[]): void {
  while (stack.length > HISTORY_LIMIT) stack.shift();
}

function applyState(entry: HistoryEntry, direction: 'undo' | 'redo'): ApplyState {
  if (entry.domain === 'project') {
    if (!projectController) return 'blocked';
    return (direction === 'undo' ? projectController.canUndo() : projectController.canRedo())
      ? 'apply'
      : 'stale';
  }
  if (entry.domain === 'plotBoard') {
    if (!plotBoardController) return 'blocked';
    return (direction === 'undo' ? plotBoardController.canUndo() : plotBoardController.canRedo())
      ? 'apply'
      : 'stale';
  }
  if (!scriptController) return 'blocked';
  return (direction === 'undo'
    ? scriptController.canUndo(entry.path)
    : scriptController.canRedo(entry.path))
    ? 'apply'
    : 'stale';
}

function hasApplicable(stack: readonly HistoryEntry[], direction: 'undo' | 'redo'): boolean {
  revision();
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const state = applyState(stack[i]!, direction);
    if (state === 'blocked') return false;
    if (state === 'apply') return true;
  }
  return false;
}

async function applyTop(
  source: HistoryEntry[],
  target: HistoryEntry[],
  direction: 'undo' | 'redo',
): Promise<boolean> {
  if (applying) return false;
  while (source.length > 0) {
    const entry = source[source.length - 1]!;
    const state = applyState(entry, direction);
    if (state === 'blocked') return false;
    source.pop();
    if (state === 'stale') {
      touch();
      continue;
    }

    applying = true;
    let ok = false;
    try {
      if (entry.domain === 'project') {
        ok =
          direction === 'undo'
            ? await projectController!.undo()
            : await projectController!.redo();
      } else if (entry.domain === 'script') {
        ok =
          direction === 'undo'
            ? await scriptController!.undo(entry.path)
            : await scriptController!.redo(entry.path);
      } else {
        ok =
          direction === 'undo'
            ? await plotBoardController!.undo()
            : await plotBoardController!.redo();
      }
    } finally {
      applying = false;
    }

    if (ok) {
      target.push(entry);
      trim(target);
      touch();
      return true;
    }
    touch();
  }
  return false;
}

function record(entry: HistoryEntry): void {
  if (applying) return;
  undoStack.push(entry);
  trim(undoStack);
  redoStack.length = 0;
  touch();
}

export const GlobalHistoryService = {
  revision,

  registerProjectController(controller: ProjectHistoryController): () => void {
    projectController = controller;
    touch();
    return () => {
      if (projectController === controller) {
        projectController = undefined;
        touch();
      }
    };
  },

  registerScriptController(controller: ScriptHistoryController): () => void {
    scriptController = controller;
    touch();
    return () => {
      if (scriptController === controller) {
        scriptController = undefined;
        touch();
      }
    };
  },

  registerPlotBoardController(controller: PlotBoardHistoryController): () => void {
    plotBoardController = controller;
    touch();
    return () => {
      if (plotBoardController === controller) {
        plotBoardController = undefined;
        touch();
      }
    };
  },

  recordProject(): void {
    record({ domain: 'project' });
  },

  canMergeScript(path: string, mergeKey: string): boolean {
    const last = undoStack[undoStack.length - 1];
    return last?.domain === 'script' && last.path === path && last.mergeKey === mergeKey;
  },

  recordScript(path: string, mergeKey?: string): void {
    record(mergeKey ? { domain: 'script', path, mergeKey } : { domain: 'script', path });
  },

  recordPlotBoard(): void {
    record({ domain: 'plotBoard' });
  },

  canUndo(): boolean {
    return hasApplicable(undoStack, 'undo');
  },

  canRedo(): boolean {
    return hasApplicable(redoStack, 'redo');
  },

  async undo(): Promise<boolean> {
    return applyTop(undoStack, redoStack, 'undo');
  },

  async redo(): Promise<boolean> {
    return applyTop(redoStack, undoStack, 'redo');
  },

  clear(): void {
    undoStack.length = 0;
    redoStack.length = 0;
    touch();
  },
};

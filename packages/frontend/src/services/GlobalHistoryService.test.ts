import { beforeEach, describe, expect, it } from 'vitest';
import { GlobalHistoryService } from './GlobalHistoryService';

describe('GlobalHistoryService', () => {
  beforeEach(() => {
    GlobalHistoryService.clear();
  });

  it('undoes and redoes project and script edits in global chronological order', async () => {
    const calls: string[] = [];
    let projectUndo = 0;
    let projectRedo = 0;
    const scriptUndo = new Map([['scene-a', 0]]);
    const scriptRedo = new Map([['scene-a', 0]]);

    const unregisterProject = GlobalHistoryService.registerProjectController({
      canUndo: () => projectUndo > 0,
      canRedo: () => projectRedo > 0,
      undo: () => {
        projectUndo -= 1;
        projectRedo += 1;
        calls.push('project undo');
        return true;
      },
      redo: () => {
        projectRedo -= 1;
        projectUndo += 1;
        calls.push('project redo');
        return true;
      },
    });
    const unregisterScript = GlobalHistoryService.registerScriptController({
      canUndo: (path) => (scriptUndo.get(path) ?? 0) > 0,
      canRedo: (path) => (scriptRedo.get(path) ?? 0) > 0,
      undo: (path) => {
        scriptUndo.set(path, (scriptUndo.get(path) ?? 0) - 1);
        scriptRedo.set(path, (scriptRedo.get(path) ?? 0) + 1);
        calls.push(`script undo ${path}`);
        return true;
      },
      redo: (path) => {
        scriptRedo.set(path, (scriptRedo.get(path) ?? 0) - 1);
        scriptUndo.set(path, (scriptUndo.get(path) ?? 0) + 1);
        calls.push(`script redo ${path}`);
        return true;
      },
    });

    projectUndo += 1;
    GlobalHistoryService.recordProject();
    scriptUndo.set('scene-a', 1);
    GlobalHistoryService.recordScript('scene-a');

    expect(GlobalHistoryService.canUndo()).toBe(true);
    expect(await GlobalHistoryService.undo()).toBe(true);
    expect(await GlobalHistoryService.undo()).toBe(true);
    expect(calls).toEqual(['script undo scene-a', 'project undo']);

    expect(GlobalHistoryService.canRedo()).toBe(true);
    expect(await GlobalHistoryService.redo()).toBe(true);
    expect(await GlobalHistoryService.redo()).toBe(true);
    expect(calls).toEqual([
      'script undo scene-a',
      'project undo',
      'project redo',
      'script redo scene-a',
    ]);

    unregisterScript();
    unregisterProject();
  });

  it('clears redo when a new edit is recorded', async () => {
    let projectUndo = 0;
    let projectRedo = 0;
    const unregisterProject = GlobalHistoryService.registerProjectController({
      canUndo: () => projectUndo > 0,
      canRedo: () => projectRedo > 0,
      undo: () => {
        projectUndo -= 1;
        projectRedo += 1;
        return true;
      },
      redo: () => {
        projectRedo -= 1;
        projectUndo += 1;
        return true;
      },
    });

    projectUndo += 1;
    GlobalHistoryService.recordProject();
    expect(await GlobalHistoryService.undo()).toBe(true);
    expect(GlobalHistoryService.canRedo()).toBe(true);

    projectUndo += 1;
    GlobalHistoryService.recordProject();
    expect(GlobalHistoryService.canRedo()).toBe(false);

    unregisterProject();
  });

  it('notifies the plotBoard controller to drop snapshots trimmed past the limit', () => {
    const trims: Array<'undo' | 'redo'> = [];
    // controller 側の snapshot 本数を模した値。undoBoards.length に相当。
    let snapshots = 0;
    const unregister = GlobalHistoryService.registerPlotBoardController({
      canUndo: () => snapshots > 0,
      canRedo: () => false,
      undo: () => false,
      redo: () => false,
      onTrimOldest: (side) => {
        trims.push(side);
        snapshots -= 1;
      },
    });

    const LIMIT = 200;
    for (let i = 0; i < LIMIT + 30; i += 1) {
      snapshots += 1; // recordHistory が undoBoards.push する分
      GlobalHistoryService.recordPlotBoard();
    }

    // 上限超過の 30 件分、最古マーカーがトリムされ onTrimOldest('undo') が呼ばれる。
    expect(trims).toHaveLength(30);
    expect(trims.every((s) => s === 'undo')).toBe(true);
    // マーカー本数と snapshot 本数が一致 (孤立スナップショットが残らない)。
    expect(snapshots).toBe(LIMIT);

    unregister();
  });
});

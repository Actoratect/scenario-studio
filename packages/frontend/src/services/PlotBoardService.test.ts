import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMainPlotBoard, type PlotBoard } from '@scenario-studio/core';
import { PlotBoardService } from './PlotBoardService';
import { GlobalHistoryService } from './GlobalHistoryService';
import { SaveStatus } from './SaveStatus';
import { Toast } from './Toast';

let context: {
  handle: { id: string };
  project: { plotBoards: PlotBoard[] };
  plotBoardRepository: { saveMain: ReturnType<typeof vi.fn> };
};
vi.mock('./ProjectService', () => ({ ProjectService: { currentProject: () => context } }));

beforeEach(() => {
  context = {
    handle: { id: 'plot-test' },
    project: { plotBoards: [createMainPlotBoard()] },
    plotBoardRepository: { saveMain: vi.fn().mockResolvedValue(undefined) },
  };
  PlotBoardService.reset();
  GlobalHistoryService.clear();
});
afterEach(async () => {
  await PlotBoardService.flushPending();
  PlotBoardService.reset();
  SaveStatus.reset();
  Toast.clear();
});

describe('PlotBoardService', () => {
  it('入力のまとまりをUndoし、種別と参照を維持して複製する', async () => {
    const id = PlotBoardService.addNode('thread', { x: 10, y: 20 })!;
    PlotBoardService.updateNode(id, { title: '主筋', body: 'a' });
    PlotBoardService.updateNode(id, { body: 'abc' });
    await GlobalHistoryService.undo();
    expect(PlotBoardService.currentBoard()?.nodes[0]?.body).toBe('');
    await GlobalHistoryService.redo();
    PlotBoardService.updateNode(id, { anchors: { scenes: ['chapter/scene'] }, status: 'ready' });
    const copy = PlotBoardService.duplicateNode(id)!;
    expect(copy).not.toBe(id);
    expect(PlotBoardService.currentBoard()?.nodes[1]).toMatchObject({
      kind: 'thread',
      body: 'abc',
      anchors: { scenes: ['chapter/scene'] },
      status: 'ready',
      position: { x: 42, y: 52 },
    });
  });

  it('移動と削除をUndoし、関連線とスレッド所属も復元する', async () => {
    const thread = PlotBoardService.addNode('thread', { x: 0, y: 0 })!;
    const beat = PlotBoardService.addNode('beat', { x: 100, y: 0 })!;
    PlotBoardService.updateNode(beat, { threadIds: [thread] });
    PlotBoardService.addEdge(thread, beat);
    PlotBoardService.moveNode(beat, { x: 300, y: 200 });
    PlotBoardService.commitNodeMove(beat, { x: 300, y: 200 }, { x: 100, y: 0 });
    await GlobalHistoryService.undo();
    expect(PlotBoardService.currentBoard()?.nodes[1]?.position).toEqual({ x: 100, y: 0 });
    PlotBoardService.removeNode(thread);
    expect(PlotBoardService.currentBoard()?.edges).toHaveLength(0);
    expect(PlotBoardService.currentBoard()?.nodes[0]?.threadIds).toEqual([]);
    await GlobalHistoryService.undo();
    expect(PlotBoardService.currentBoard()?.edges).toHaveLength(1);
    expect(PlotBoardService.currentBoard()?.nodes[1]?.threadIds).toEqual([thread]);
    await PlotBoardService.flushPending();
    expect(context.plotBoardRepository.saveMain).toHaveBeenLastCalledWith(
      PlotBoardService.currentBoard(),
    );
  });
});

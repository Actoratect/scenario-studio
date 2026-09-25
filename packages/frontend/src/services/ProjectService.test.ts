import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMainPlotBoard, initializeProject } from '@scenario-studio/core';
import { InMemoryFileSystemAdapter } from '../../../core/src/testing/InMemoryFileSystemAdapter';
import { ProjectService } from './ProjectService';

// ProjectService / Coreのload・repositoryは実物を使用し、画面と保存キューの境界だけ制御する。
const mocks = vi.hoisted(() => {
  const graph = () => ({
    flushPending: vi.fn(),
    hasPending: vi.fn(),
    switchProject: vi.fn(),
    clear: vi.fn(),
    reset: vi.fn(),
    discardPending: vi.fn(),
  });
  return {
    pick: vi.fn(),
    positions: graph(),
    comments: graph(),
    flow: graph(),
    board: graph(),
    relations: graph(),
    scheduler: { flushAllAsync: vi.fn(), pendingCount: 0 },
    dirty: { flushAll: vi.fn(), isDirty: vi.fn() },
  };
});

vi.mock('virtual:meros-sample', () => ({
  MEROS_SAMPLE: { files: { 'keep.txt': { kind: 'text', text: '上書きされてはいけない' } } },
}));
vi.mock('@scenario-studio/adapter-browser', () => ({
  pickProjectDirectory: mocks.pick,
  restoreProjectDirectory: vi.fn(),
  supportsFileSystemAccess: () => false,
}));
vi.mock('../graph/graph-positions.js', () => ({ GraphPositions: mocks.positions }));
vi.mock('../graph/graph-comments.js', () => ({ GraphComments: mocks.comments }));
vi.mock('../graph/plot-flow-edges.js', () => ({ PlotFlowEdges: mocks.flow }));
vi.mock('./PlotBoardService.js', () => ({ PlotBoardService: mocks.board }));
vi.mock('./RelationsService.js', () => ({ RelationsService: mocks.relations }));
vi.mock('./save-scheduler-binding.js', () => ({ useSaveScheduler: () => mocks.scheduler }));
vi.mock('./DirtyTracker.js', () => ({ DirtyTracker: mocks.dirty }));
vi.mock('./ThumbnailService.js', () => ({ ThumbnailService: { clearAll: vi.fn() } }));
vi.mock('./ConflictDetector.js', () => ({
  ConflictDetector: { clear: vi.fn(), recordSnapshot: vi.fn() },
}));
vi.mock('./GlobalHistoryService.js', () => ({
  GlobalHistoryService: {
    clear: vi.fn(),
    registerProjectController: () => vi.fn(),
    recordProject: vi.fn(),
  },
}));
vi.mock('./ScriptHistoryService.js', () => ({ ScriptHistoryService: { clear: vi.fn() } }));
vi.mock('./Toast.js', () => ({ Toast: { error: vi.fn() } }));
vi.mock('./recent-projects.js', () => ({
  rememberProject: vi.fn(),
  forgetProject: vi.fn(),
  listRecentProjects: async () => [],
  pinProject: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const service of [
    mocks.board,
    mocks.relations,
    mocks.positions,
    mocks.comments,
    mocks.flow,
  ]) {
    service.flushPending.mockResolvedValue({ saved: 0, failed: 0 });
    service.hasPending.mockReturnValue(false);
    service.switchProject.mockResolvedValue(undefined);
  }
  mocks.scheduler.flushAllAsync.mockResolvedValue({ saved: 0, failed: 0, skipped: 0, errors: [] });
  mocks.scheduler.pendingCount = 0;
  mocks.dirty.flushAll.mockResolvedValue({ saved: 0, failed: 0, skipped: 0, errors: [] });
  mocks.dirty.isDirty.mockReturnValue(false);
});

afterEach(() => {
  ProjectService.close();
  vi.restoreAllMocks();
});

async function openProject() {
  const adapter = new InMemoryFileSystemAdapter();
  const handle = adapter.register('reload-test');
  const initialized = await initializeProject(adapter, handle, { name: '再読込のテスト' });
  await initialized.plotBoardRepository.saveMain({ ...createMainPlotBoard(), title: '保存前' });
  mocks.pick.mockResolvedValue({ adapter, handle });
  const context = await ProjectService.openWithPicker();
  return { adapter, handle, context };
}

describe('ProjectServiceの安全な再読込', () => {
  it('遅いプロット保存の完了後にloadし、最新ディスク内容を読み戻す', async () => {
    const { adapter, context } = await openProject();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.board.flushPending.mockImplementationOnce(async () => {
      await gate;
      await context.plotBoardRepository.saveMain({
        ...createMainPlotBoard(),
        title: '保存後の最新版',
      });
      return { saved: 1, failed: 0 };
    });
    const readFromDisk = adapter.read.bind(adapter);
    const read = vi.spyOn(adapter, 'read').mockImplementation(async (handle, path) => {
      // 再読込中は古い画面も別のProjectPickerも操作させない。
      expect(ProjectService.opening()).toBe(true);
      expect(ProjectService.currentProject()).toBeUndefined();
      return readFromDisk(handle, path);
    });
    const reloading = ProjectService.reload();
    // loadProjectがflushより先なら、ここで既に旧ディスクを読んでしまう。
    expect(read).not.toHaveBeenCalled();
    expect(ProjectService.currentProject()).toBe(context);
    for (const service of [
      mocks.board,
      mocks.relations,
      mocks.positions,
      mocks.comments,
      mocks.flow,
    ]) {
      expect(service.flushPending).toHaveBeenCalledOnce();
    }
    release();
    await reloading;
    expect(ProjectService.currentProject()?.project.plotBoards[0]?.title).toBe('保存後の最新版');
    expect(ProjectService.currentProject()?.history).not.toBe(context.history);
    expect(ProjectService.opening()).toBe(false);
  });

  it('保存失敗時はloadもhistoryの破棄もせず、編集可能な現在プロジェクトを維持する', async () => {
    const { adapter, context } = await openProject();
    const read = vi.spyOn(adapter, 'read');
    const destroy = vi.spyOn(context.history, 'destroy');
    mocks.relations.flushPending.mockResolvedValueOnce({ saved: 0, failed: 1 });
    await expect(ProjectService.reload()).rejects.toThrow('未保存の変更があります');
    expect(read).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(ProjectService.currentProject()).toBe(context);
    expect(ProjectService.opening()).toBe(false);
  });

  it('サンプル展開先に既存ファイルがあれば書き込まず、元データを保持する', async () => {
    const adapter = new InMemoryFileSystemAdapter();
    const handle = adapter.register('non-empty-sample');
    await adapter.write(handle, 'keep.txt', '既存の大切なデータ');
    mocks.pick.mockResolvedValue({ adapter, handle });
    const write = vi.spyOn(adapter, 'write');
    const writeBytes = vi.spyOn(adapter, 'writeBytes');
    await expect(ProjectService.openMerosSample()).rejects.toThrow('空のフォルダー');
    expect(write).not.toHaveBeenCalled();
    expect(writeBytes).not.toHaveBeenCalled();
    expect(await adapter.read(handle, 'keep.txt')).toBe('既存の大切なデータ');
    expect(ProjectService.currentProject()).toBeUndefined();
  });
});

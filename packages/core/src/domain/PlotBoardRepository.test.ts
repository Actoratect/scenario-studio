import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFileSystemAdapter } from '../testing/InMemoryFileSystemAdapter.js';
import type { ProjectHandle } from '../platform.js';
import {
  createPlotBoardEdge,
  createPlotBoardNode,
  FsPlotBoardRepository,
  MAIN_PLOT_BOARD_FILE,
} from './PlotBoardRepository.js';
import { createMainPlotBoard, plotBoardNodeId } from './PlotBoard.js';
import { nodeId } from './era.js';

describe('FsPlotBoardRepository', () => {
  let adapter: InMemoryFileSystemAdapter;
  let handle: ProjectHandle;
  let repo: FsPlotBoardRepository;

  beforeEach(() => {
    adapter = new InMemoryFileSystemAdapter();
    handle = adapter.register('test');
    repo = new FsPlotBoardRepository(adapter, handle);
  });

  it('returns no boards when PlotBoards is empty', async () => {
    expect(await repo.loadAll()).toEqual([]);
    expect(await repo.loadMain()).toBeUndefined();
  });

  it('saveMain() then loadMain() round-trips a board', async () => {
    const thread = createPlotBoardNode({
      kind: 'thread',
      title: '主筋',
      position: { x: 10, y: 20 },
    });
    const beat = createPlotBoardNode({
      kind: 'beat',
      title: '偽りの勝利',
      body: '勝ったように見えるが、敵の目的は別にある。',
      position: { x: 260, y: 80 },
      threadIds: [thread.id],
      viewMode: 'full',
    });
    const edge = createPlotBoardEdge({
      source: thread.id,
      target: beat.id,
      type: 'foreshadows',
      label: '違和感',
    });
    const board = {
      ...createMainPlotBoard(),
      nodes: [
        thread,
        {
          ...beat,
          anchors: {
            chapters: ['ch_001'],
            scenes: ['sc_003'],
            nodes: [nodeId('node.aria')],
          },
        },
      ],
      edges: [edge],
    };

    await repo.saveMain(board);

    expect(await adapter.exists(handle, MAIN_PLOT_BOARD_FILE)).toBe(true);
    expect(await repo.loadMain()).toEqual(board);
    expect(await repo.loadAll()).toEqual([board]);
  });

  it('drops edges whose nodes are missing', async () => {
    await adapter.write(
      handle,
      MAIN_PLOT_BOARD_FILE,
      `schemaVersion: 1
id: plotboard.main
title: Test
nodes:
  - { id: pnode.a, kind: memo, title: A, body: "", position: { x: 0, y: 0 } }
edges:
  - { id: pedge.good, source: pnode.a, target: pnode.a, type: next }
  - { id: pedge.bad, source: pnode.a, target: pnode.missing, type: next }
`,
    );

    const board = await repo.loadMain();
    expect(board?.edges.map((e) => e.id)).toEqual(['pedge.good']);
  });

  it('falls back unknown node kinds to memo', async () => {
    await adapter.write(
      handle,
      MAIN_PLOT_BOARD_FILE,
      `schemaVersion: 1
id: plotboard.main
title: Test
nodes:
  - { id: pnode.a, kind: custom, title: A, body: "", position: { x: 0, y: 0 } }
edges: []
`,
    );

    const board = await repo.loadMain();
    expect(board?.nodes[0]?.id).toBe(plotBoardNodeId('pnode.a'));
    expect(board?.nodes[0]?.kind).toBe('memo');
  });

  it('drops non-finite width/height so the canvas never gets NaN sizes', async () => {
    await adapter.write(
      handle,
      MAIN_PLOT_BOARD_FILE,
      `schemaVersion: 1
id: plotboard.main
title: Test
nodes:
  - id: pnode.a
    kind: memo
    title: A
    body: ""
    position: { x: 0, y: 0 }
    width: .nan
    height: .inf
edges: []
`,
    );

    const board = await repo.loadMain();
    expect(board?.nodes[0]?.width).toBeUndefined();
    expect(board?.nodes[0]?.height).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeId } from '@scenario-studio/core';
import { InMemoryFileSystemAdapter } from '../../../core/src/testing/InMemoryFileSystemAdapter';
import { GraphPositions } from './graph-positions';
import { GraphComments } from './graph-comments';
import { PlotFlowEdges } from './plot-flow-edges';
import { GlobalHistoryService } from '../services/GlobalHistoryService';
import { SaveStatus } from '../services/SaveStatus';
import { Toast } from '../services/Toast';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  GlobalHistoryService.clear();
});
afterEach(() => {
  GraphPositions.clear();
  GraphComments.clear();
  PlotFlowEdges.clear();
  SaveStatus.reset();
  Toast.clear();
  vi.unstubAllGlobals();
});

describe('グラフの保存と履歴', () => {
  it('位置・メモ・接続を保存し、別プロジェクトへ切替えても混ざらず再読込する', async () => {
    const adapter = new InMemoryFileSystemAdapter();
    const first = adapter.register('first');
    const second = adapter.register('second');
    await Promise.all([
      GraphPositions.switchProject(adapter, first),
      GraphComments.switchProject(adapter, first),
      PlotFlowEdges.switchProject(adapter, first),
    ]);
    GraphPositions.commitPosition(nodeId('a'), { x: 250, y: 150 }, { x: 0, y: 0 });
    const comment = GraphComments.add({ x: 30, y: 50 });
    PlotFlowEdges.add(nodeId('plot.ch.a'), nodeId('plot.ch.b'), '伏線');
    await GlobalHistoryService.undo();
    expect(PlotFlowEdges.customEdges()).toHaveLength(0);
    await GlobalHistoryService.redo();
    expect(PlotFlowEdges.customEdges()).toHaveLength(1);
    await Promise.all([
      GraphPositions.switchProject(adapter, second),
      GraphComments.switchProject(adapter, second),
      PlotFlowEdges.switchProject(adapter, second),
    ]);
    expect(GraphPositions.positions().size).toBe(0);
    expect(GraphComments.comments()).toHaveLength(0);
    expect(PlotFlowEdges.customEdges()).toHaveLength(0);
    await Promise.all([
      GraphPositions.switchProject(adapter, first),
      GraphComments.switchProject(adapter, first),
      PlotFlowEdges.switchProject(adapter, first),
    ]);
    expect(GraphPositions.get(nodeId('a'))).toEqual({ x: 250, y: 150 });
    expect(GraphComments.comments()[0]?.id).toBe(comment.id);
    expect(PlotFlowEdges.customEdges()[0]?.label).toBe('伏線');
  });

  it('明示破棄した変更はlocalStorage fallbackから復活しない', async () => {
    const adapter = new InMemoryFileSystemAdapter();
    const handle = adapter.register();
    await Promise.all([
      GraphPositions.switchProject(adapter, handle),
      GraphComments.switchProject(adapter, handle),
      PlotFlowEdges.switchProject(adapter, handle),
    ]);
    GraphPositions.commitPosition(nodeId('discarded'), { x: 200, y: 300 });
    GraphComments.add({ x: 10, y: 20 });
    PlotFlowEdges.add(nodeId('a'), nodeId('b'), '破棄');
    GraphPositions.clear();
    GraphComments.clear();
    PlotFlowEdges.clear();
    await Promise.all([
      GraphPositions.switchProject(adapter, handle),
      GraphComments.switchProject(adapter, handle),
      PlotFlowEdges.switchProject(adapter, handle),
    ]);
    expect(GraphPositions.positions().size).toBe(0);
    expect(GraphComments.comments()).toHaveLength(0);
    expect(PlotFlowEdges.customEdges()).toHaveLength(0);
    expect(await adapter.list(handle, '**/*')).toEqual([]);
  });
});

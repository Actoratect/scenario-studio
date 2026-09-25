import { describe, expect, it } from 'vitest';
import { createPlotBoardNode } from '@scenario-studio/core';
import { fitGraphBounds, plotBody, plotCardSize, plotNodeAt } from './plot-board-model';

describe('plot board interaction geometry', () => {
  it('大きなカードの端でも接続でき、カード外の空間には誤接続しない', () => {
    const source = createPlotBoardNode({
      kind: 'beat',
      title: '転機',
      position: { x: 500, y: 500 },
    });
    const target = { ...source, width: 600, height: 400 };
    expect(plotNodeAt([target], { x: 1090, y: 890 })).toBe(target.id);
    expect(plotNodeAt([target], { x: 499, y: 500 })).toBeUndefined();
    expect(plotNodeAt([target], { x: 550, y: 550 }, target.id)).toBeUndefined();
  });

  it('既存の表題付きメモと独立した本文の両方を表示する', () => {
    const node = createPlotBoardNode({
      kind: 'thread',
      title: '謎',
      body: '謎\n伏線の回収',
      position: { x: 0, y: 0 },
    });
    expect(plotBody(node)).toBe('伏線の回収');
    expect(plotBody({ ...node, body: '独立した本文' })).toBe('独立した本文');
    expect(node.kind).toBe('thread');
  });

  it('不正なカード寸法を補正し、全体を表示領域の中心に収める', () => {
    const node = createPlotBoardNode({ kind: 'memo', title: '', position: { x: 0, y: 0 } });
    expect(plotCardSize({ ...node, width: -100, height: Infinity })).toEqual({
      width: 180,
      height: 156,
    });
    const view = fitGraphBounds(
      { x: 2000, y: -900, width: 500, height: 200 },
      { width: 600, height: 400 },
    );
    expect(2250 * view.scale + view.x).toBeCloseTo(300);
    expect(-800 * view.scale + view.y).toBeCloseTo(200);
  });
});

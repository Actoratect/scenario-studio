import type { PlotBoardNode, PlotBoardNodeId, PlotBoardPosition } from '@scenario-studio/core';

export const PLOT_NODE_KINDS = [
  { value: 'memo', label: 'メモ' },
  { value: 'thread', label: 'スレッド' },
  { value: 'beat', label: '出来事' },
  { value: 'question', label: '問い' },
  { value: 'scene_ref', label: 'シーン参照' },
] as const;

/** 旧版の「本文1行目が表題」形式を表示時だけ吸収する。 */
export function plotBody(node: PlotBoardNode): string {
  if (node.bodyFormat === 'plain') return node.body;
  const lines = node.body.split(/\r?\n/);
  if (lines[0]?.trim() === node.title.trim()) lines.shift();
  return lines.join('\n');
}

export function plotCardSize(node: PlotBoardNode): { width: number; height: number } {
  return {
    width: Number.isFinite(node.width) ? Math.max(180, node.width!) : 250,
    height: Number.isFinite(node.height)
      ? Math.max(120, node.height!)
      : node.viewMode === 'full'
        ? 260
        : 156,
  };
}

/** 中心からの距離ではなく、実際にポインタが重なるカードだけを接続先にする。 */
export function plotNodeAt(
  nodes: readonly PlotBoardNode[],
  point: PlotBoardPosition,
  except?: PlotBoardNodeId,
): PlotBoardNodeId | undefined {
  return [...nodes].reverse().find((node) => {
    if (node.id === except) return false;
    const size = plotCardSize(node);
    return (
      point.x >= node.position.x &&
      point.x <= node.position.x + size.width &&
      point.y >= node.position.y &&
      point.y <= node.position.y + size.height
    );
  })?.id;
}

export function fitGraphBounds(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number; scale: number } {
  const scale = Math.max(
    0.1,
    Math.min(
      1.25,
      (viewport.width - 72) / Math.max(1, bounds.width),
      (viewport.height - 72) / Math.max(1, bounds.height),
    ),
  );
  return {
    x: (viewport.width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (viewport.height - bounds.height * scale) / 2 - bounds.y * scale,
    scale,
  };
}

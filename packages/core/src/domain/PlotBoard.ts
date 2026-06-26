import type { NodeId } from './era.js';

export type PlotBoardId = string & { readonly __brand: 'PlotBoardId' };
export type PlotBoardNodeId = string & { readonly __brand: 'PlotBoardNodeId' };
export type PlotBoardEdgeId = string & { readonly __brand: 'PlotBoardEdgeId' };

export const plotBoardId = (s: string): PlotBoardId => s as PlotBoardId;
export const plotBoardNodeId = (s: string): PlotBoardNodeId => s as PlotBoardNodeId;
export const plotBoardEdgeId = (s: string): PlotBoardEdgeId => s as PlotBoardEdgeId;

export type PlotBoardNodeKind = 'thread' | 'beat' | 'memo' | 'question' | 'scene_ref';
export type PlotBoardNodeViewMode = 'summary' | 'full';

export interface PlotBoardPosition {
  x: number;
  y: number;
}

export interface PlotBoardAnchors {
  chapters?: readonly string[] | undefined;
  scenes?: readonly string[] | undefined;
  nodes?: readonly NodeId[] | undefined;
  scriptBlocks?: readonly string[] | undefined;
}

export interface PlotBoardNode {
  id: PlotBoardNodeId;
  kind: PlotBoardNodeKind;
  title: string;
  body: string;
  position: PlotBoardPosition;
  threadIds?: readonly PlotBoardNodeId[] | undefined;
  anchors?: PlotBoardAnchors | undefined;
  viewMode?: PlotBoardNodeViewMode | undefined;
  status?: string | undefined;
  color?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export interface PlotBoardEdge {
  id: PlotBoardEdgeId;
  source: PlotBoardNodeId;
  target: PlotBoardNodeId;
  type: string;
  label?: string | undefined;
}

export interface PlotBoard {
  schemaVersion: 1;
  id: PlotBoardId;
  title: string;
  nodes: readonly PlotBoardNode[];
  edges: readonly PlotBoardEdge[];
}

export const MAIN_PLOT_BOARD_ID = plotBoardId('plotboard.main');
export const MAIN_PLOT_BOARD_TITLE = '本編プロットボード';

export function createMainPlotBoard(): PlotBoard {
  return {
    schemaVersion: 1,
    id: MAIN_PLOT_BOARD_ID,
    title: MAIN_PLOT_BOARD_TITLE,
    nodes: [],
    edges: [],
  };
}

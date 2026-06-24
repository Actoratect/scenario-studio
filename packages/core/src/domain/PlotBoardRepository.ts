import { ulid } from 'ulid';
import type { FileSystemAdapter, ProjectHandle } from '../platform.js';
import { parseYaml, sanitizeYamlTree, stringifyYaml } from '../yaml/index.js';
import type { YamlValue } from '../yaml/index.js';
import { nodeId } from './era.js';
import type { NodeId } from './era.js';
import {
  createMainPlotBoard,
  MAIN_PLOT_BOARD_ID,
  type PlotBoard,
  type PlotBoardAnchors,
  plotBoardEdgeId,
  type PlotBoardEdge,
  type PlotBoardNode,
  plotBoardId,
  plotBoardNodeId,
  type PlotBoardNodeKind,
  type PlotBoardNodeId,
  type PlotBoardNodeViewMode,
  type PlotBoardPosition,
} from './PlotBoard.js';

const PLOT_BOARDS_ROOT = 'PlotBoards';
export const MAIN_PLOT_BOARD_FILE = `${PLOT_BOARDS_ROOT}/main.board.yaml`;

const NODE_KINDS = new Set<PlotBoardNodeKind>([
  'thread',
  'beat',
  'memo',
  'question',
  'scene_ref',
]);

export class FsPlotBoardRepository {
  constructor(
    private readonly adapter: FileSystemAdapter,
    private readonly handle: ProjectHandle,
  ) {}

  async loadAll(): Promise<readonly PlotBoard[]> {
    const paths = await this.adapter.list(this.handle, `${PLOT_BOARDS_ROOT}/*.board.yaml`);
    const boards: PlotBoard[] = [];
    for (const path of paths) {
      try {
        boards.push(await this.loadFile(path));
      } catch {
        // 1 つ壊れてもプロジェクト全体は開けるようにする。
      }
    }
    boards.sort((a, b) => a.title.localeCompare(b.title));
    return boards;
  }

  async loadMain(): Promise<PlotBoard | undefined> {
    if (!(await this.adapter.exists(this.handle, MAIN_PLOT_BOARD_FILE))) return undefined;
    return this.loadFile(MAIN_PLOT_BOARD_FILE);
  }

  async saveMain(board: PlotBoard): Promise<void> {
    await this.save(MAIN_PLOT_BOARD_FILE, board);
  }

  async save(path: string, board: PlotBoard): Promise<void> {
    await this.adapter.write(this.handle, path, stringifyYaml(sanitizeYamlTree(boardToYaml(board))));
  }

  private async loadFile(path: string): Promise<PlotBoard> {
    const text = await this.adapter.read(this.handle, path);
    const { value } = parseYaml(text);
    return parsePlotBoard(value);
  }
}

export function createPlotBoardNode(input: {
  kind: PlotBoardNodeKind;
  title: string;
  body?: string | undefined;
  position: PlotBoardPosition;
  threadIds?: readonly PlotBoardNodeId[] | undefined;
  viewMode?: PlotBoardNodeViewMode | undefined;
}): PlotBoardNode {
  const node: PlotBoardNode = {
    id: plotBoardNodeId(`pnode.${ulid()}`),
    kind: input.kind,
    title: input.title,
    body: input.body ?? '',
    position: input.position,
  };
  const withViewMode = input.viewMode !== undefined ? { ...node, viewMode: input.viewMode } : node;
  if (input.threadIds !== undefined && input.threadIds.length > 0) {
    return { ...withViewMode, threadIds: [...input.threadIds] };
  }
  return withViewMode;
}

export function createPlotBoardEdge(input: {
  source: PlotBoardNodeId;
  target: PlotBoardNodeId;
  type?: string | undefined;
  label?: string | undefined;
}): PlotBoardEdge {
  const edge: PlotBoardEdge = {
    id: plotBoardEdgeId(`pedge.${ulid()}`),
    source: input.source,
    target: input.target,
    type: input.type?.trim() || 'next',
  };
  if (input.label !== undefined && input.label.trim() !== '') {
    return { ...edge, label: input.label.trim() };
  }
  return edge;
}

function parsePlotBoard(value: YamlValue): PlotBoard {
  if (!isMapping(value)) return createMainPlotBoard();
  const id = typeof value['id'] === 'string' ? plotBoardId(value['id']) : MAIN_PLOT_BOARD_ID;
  const title = typeof value['title'] === 'string' ? value['title'] : 'プロットボード';
  const nodesRaw = Array.isArray(value['nodes']) ? value['nodes'] : [];
  const edgesRaw = Array.isArray(value['edges']) ? value['edges'] : [];
  const nodes: PlotBoardNode[] = [];
  for (const raw of nodesRaw) {
    const node = parseNode(raw);
    if (node) nodes.push(node);
  }
  const validNodeIds = new Set(nodes.map((n) => n.id));
  const edges: PlotBoardEdge[] = [];
  for (const raw of edgesRaw) {
    const edge = parseEdge(raw, validNodeIds);
    if (edge) edges.push(edge);
  }
  return { schemaVersion: 1, id, title, nodes, edges };
}

function parseNode(value: YamlValue): PlotBoardNode | undefined {
  if (!isMapping(value)) return undefined;
  if (typeof value['id'] !== 'string') return undefined;
  const kindRaw = value['kind'];
  const kind = typeof kindRaw === 'string' && NODE_KINDS.has(kindRaw as PlotBoardNodeKind)
    ? (kindRaw as PlotBoardNodeKind)
    : 'memo';
  const position = parsePosition(value['position']);
  const node: PlotBoardNode = {
    id: plotBoardNodeId(value['id']),
    kind,
    title: typeof value['title'] === 'string' ? value['title'] : '',
    body: typeof value['body'] === 'string' ? value['body'] : '',
    position,
  };
  const threadIds = brandedStringArray(value['threadIds'], plotBoardNodeId);
  const anchors = parseAnchors(value['anchors']);
  const viewMode = parseViewMode(value['viewMode']);
  const status = typeof value['status'] === 'string' ? value['status'] : undefined;
  const color = typeof value['color'] === 'string' ? value['color'] : undefined;
  const width =
    typeof value['width'] === 'number' && Number.isFinite(value['width'])
      ? value['width']
      : undefined;
  const height =
    typeof value['height'] === 'number' && Number.isFinite(value['height'])
      ? value['height']
      : undefined;
  return {
    ...node,
    ...(threadIds.length > 0 ? { threadIds } : {}),
    ...(anchors ? { anchors } : {}),
    ...(viewMode !== undefined ? { viewMode } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

function parseEdge(
  value: YamlValue,
  validNodeIds: ReadonlySet<PlotBoardNodeId>,
): PlotBoardEdge | undefined {
  if (!isMapping(value)) return undefined;
  if (
    typeof value['id'] !== 'string' ||
    typeof value['source'] !== 'string' ||
    typeof value['target'] !== 'string'
  ) {
    return undefined;
  }
  const source = plotBoardNodeId(value['source']);
  const target = plotBoardNodeId(value['target']);
  if (!validNodeIds.has(source) || !validNodeIds.has(target)) return undefined;
  const edge: PlotBoardEdge = {
    id: plotBoardEdgeId(value['id']),
    source,
    target,
    type: typeof value['type'] === 'string' && value['type'].trim() !== '' ? value['type'] : 'next',
  };
  if (typeof value['label'] === 'string' && value['label'].trim() !== '') {
    return { ...edge, label: value['label'] };
  }
  return edge;
}

function parseAnchors(value: YamlValue | undefined): PlotBoardAnchors | undefined {
  if (!isMapping(value)) return undefined;
  const chapters = stringArray(value['chapters']);
  const scenes = stringArray(value['scenes']);
  const nodes = brandedStringArray<NodeId>(value['nodes'], nodeId);
  const scriptBlocks = stringArray(value['scriptBlocks']);
  const anchors: PlotBoardAnchors = {};
  if (chapters.length > 0) anchors.chapters = chapters;
  if (scenes.length > 0) anchors.scenes = scenes;
  if (nodes.length > 0) anchors.nodes = nodes;
  if (scriptBlocks.length > 0) anchors.scriptBlocks = scriptBlocks;
  return Object.keys(anchors).length > 0 ? anchors : undefined;
}

function parsePosition(value: YamlValue | undefined): PlotBoardPosition {
  if (!isMapping(value)) return { x: 0, y: 0 };
  const x = value['x'];
  const y = value['y'];
  return {
    x: typeof x === 'number' && Number.isFinite(x) ? x : 0,
    y: typeof y === 'number' && Number.isFinite(y) ? y : 0,
  };
}

function parseViewMode(value: YamlValue | undefined): PlotBoardNodeViewMode | undefined {
  return value === 'summary' || value === 'full' ? value : undefined;
}

function boardToYaml(board: PlotBoard): { [key: string]: YamlValue } {
  return {
    schemaVersion: 1,
    kind: 'plot_board',
    id: board.id,
    title: board.title,
    nodes: board.nodes.map(nodeToYaml),
    edges: board.edges.map(edgeToYaml),
  };
}

function nodeToYaml(node: PlotBoardNode): { [key: string]: YamlValue } {
  const out: { [key: string]: YamlValue } = {
    id: node.id,
    kind: node.kind,
    title: node.title,
    body: node.body,
    position: { x: node.position.x, y: node.position.y },
  };
  if (node.threadIds !== undefined && node.threadIds.length > 0) {
    out['threadIds'] = [...node.threadIds];
  }
  if (node.anchors !== undefined) {
    const anchors = anchorsToYaml(node.anchors);
    if (Object.keys(anchors).length > 0) out['anchors'] = anchors;
  }
  if (node.viewMode !== undefined) out['viewMode'] = node.viewMode;
  if (node.status !== undefined && node.status !== '') out['status'] = node.status;
  if (node.color !== undefined && node.color !== '') out['color'] = node.color;
  if (node.width !== undefined) out['width'] = node.width;
  if (node.height !== undefined) out['height'] = node.height;
  return out;
}

function edgeToYaml(edge: PlotBoardEdge): { [key: string]: YamlValue } {
  const out: { [key: string]: YamlValue } = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
  };
  if (edge.label !== undefined && edge.label !== '') out['label'] = edge.label;
  return out;
}

function anchorsToYaml(anchors: PlotBoardAnchors): { [key: string]: YamlValue } {
  const out: { [key: string]: YamlValue } = {};
  if (anchors.chapters !== undefined && anchors.chapters.length > 0) {
    out['chapters'] = [...anchors.chapters];
  }
  if (anchors.scenes !== undefined && anchors.scenes.length > 0) {
    out['scenes'] = [...anchors.scenes];
  }
  if (anchors.nodes !== undefined && anchors.nodes.length > 0) {
    out['nodes'] = [...anchors.nodes];
  }
  if (anchors.scriptBlocks !== undefined && anchors.scriptBlocks.length > 0) {
    out['scriptBlocks'] = [...anchors.scriptBlocks];
  }
  return out;
}

function isMapping(value: YamlValue | undefined): value is { [key: string]: YamlValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: YamlValue | undefined): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function brandedStringArray<T extends string>(
  value: YamlValue | undefined,
  brand: (s: string) => T,
): readonly T[] {
  return stringArray(value).map(brand);
}

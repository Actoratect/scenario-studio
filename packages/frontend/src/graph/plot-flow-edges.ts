import { createSignal, untrack } from 'solid-js';
import { GraphPersistence } from './graph-persistence';
import { GlobalHistoryService } from '../services/GlobalHistoryService';
import {
  parseYaml,
  sanitizeYamlTree,
  stringifyYaml,
  type FileSystemAdapter,
  type NodeId,
  type ProjectHandle,
  type YamlValue,
} from '@scenario-studio/core';

// P1 (dogfood): Plot Flow のユーザ定義エッジとラベル上書きを永続化する。
//   - custom: 章をまたぐ接続など、ユーザが Shift+drag で自由に張った線
//   - labels: 構造由来エッジ (暗黙 next / choice) の id → ラベル上書き
//     (暗黙 next の既定ラベルは空。任意テキストを付けたい時だけここに入る)
// ストレージ: `Graph/plot-flow.yaml` (positions.yaml / comments.yaml と同じ流儀で
// プロジェクト内ファイル = git 管理可能)。書き込みは 1 秒 debounce。

export interface PlotFlowCustomEdge {
  id: string;
  /** plot.<chapter>.<scene> 形式のノード id。 */
  source: NodeId;
  target: NodeId;
  label: string;
}

const FILE = 'Graph/plot-flow.yaml';

const [customEdges, setCustomEdges] = createSignal<readonly PlotFlowCustomEdge[]>([]);
const [labelOverrides, setLabelOverrides] = createSignal<ReadonlyMap<string, string>>(new Map());

let activeAdapter: FileSystemAdapter | undefined;
let activeHandle: ProjectHandle | undefined;
const persistence = new GraphPersistence();
let loadVersion = 0;
let seq = 0;

function isMapping(v: unknown): v is { [key: string]: YamlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function readFile(
  adapter: FileSystemAdapter,
  handle: ProjectHandle,
): Promise<{ custom: PlotFlowCustomEdge[]; labels: Map<string, string> }> {
  const out = { custom: [] as PlotFlowCustomEdge[], labels: new Map<string, string>() };
  if (!(await adapter.exists(handle, FILE))) return out;
  const { value } = parseYaml(await adapter.read(handle, FILE));
  if (!isMapping(value)) return out;
  const custom = value['custom'];
  if (Array.isArray(custom)) {
    for (const raw of custom) {
      if (!isMapping(raw)) continue;
      const { id, source, target, label } = raw;
      if (typeof id === 'string' && typeof source === 'string' && typeof target === 'string') {
        out.custom.push({
          id,
          source: source as NodeId,
          target: target as NodeId,
          label: typeof label === 'string' ? label : '',
        });
      }
    }
  }
  const labels = value['labels'];
  if (isMapping(labels)) {
    for (const [k, v] of Object.entries(labels)) {
      if (typeof v === 'string') out.labels.set(k, v);
    }
  }
  return out;
}

function schedulePersist(): void {
  if (!activeAdapter || !activeHandle) return;
  const adapter = activeAdapter;
  const handle = activeHandle;
  const custom = customEdges();
  const labels = labelOverrides();
  persistence.schedule(handle.id, async () => {
    const labelsObj: Record<string, YamlValue> = {};
    for (const [k, v] of labels) labelsObj[k] = v;
    await adapter.write(
      handle,
      FILE,
      stringifyYaml(
        sanitizeYamlTree({
          schemaVersion: 1,
          kind: 'plot_flow_edges',
          custom: custom.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label,
          })),
          labels: labelsObj,
        }),
      ),
    );
  });
}

function change(update: () => void): void {
  const before = { custom: customEdges(), labels: labelOverrides() };
  loadVersion += 1;
  update();
  const after = { custom: customEdges(), labels: labelOverrides() };
  const restore = (state: typeof before): void => {
    setCustomEdges(state.custom);
    setLabelOverrides(state.labels);
    schedulePersist();
  };
  GlobalHistoryService.recordGraph(
    'プロットフローの接続を変更',
    () => untrack(() => restore(before)),
    () => untrack(() => restore(after)),
  );
  schedulePersist();
}

export const PlotFlowEdges = {
  customEdges,
  labelOverrides,

  /** プロジェクト切替時に呼ぶ。保存済みエッジを読み込む。 */
  async switchProject(adapter: FileSystemAdapter, handle: ProjectHandle): Promise<void> {
    await persistence.flushPending();
    const version = ++loadVersion;
    activeAdapter = adapter;
    activeHandle = handle;
    setCustomEdges([]);
    setLabelOverrides(new Map());
    await readFile(adapter, handle)
      .then((loaded) => {
        if (loadVersion !== version) return;
        setCustomEdges(loaded.custom);
        setLabelOverrides(loaded.labels);
      })
      .catch((e: unknown) => console.warn('[PlotFlowEdges] load failed', e));
  },

  /** ユーザ定義の接続を追加 (章またぎ可)。 */
  add(source: NodeId, target: NodeId, label: string): void {
    if (
      source === target ||
      customEdges().some(
        (edge) => edge.source === source && edge.target === target && edge.label === label.trim(),
      )
    )
      return;
    seq += 1;
    const edge: PlotFlowCustomEdge = {
      id: `pfc:${Date.now().toString(36)}-${seq.toString(36)}`,
      source,
      target,
      label: label.trim(),
    };
    const next = [...customEdges(), edge];
    change(() => setCustomEdges(next));
  },

  updateLabel(id: string, label: string): void {
    if (!customEdges().some((e) => e.id === id && e.label !== label)) return;
    const next = customEdges().map((e) => (e.id === id ? { ...e, label } : e));
    change(() => setCustomEdges(next));
  },

  remove(id: string): void {
    if (!customEdges().some((e) => e.id === id)) return;
    const next = customEdges().filter((e) => e.id !== id);
    change(() => setCustomEdges(next));
  },

  /** 構造由来エッジ (暗黙 next / choice) のラベルを上書き。空文字で解除。 */
  setOverride(edgeId: string, label: string): void {
    if ((labelOverrides().get(edgeId) ?? '') === label) return;
    const next = new Map(labelOverrides());
    if (label === '') next.delete(edgeId);
    else next.set(edgeId, label);
    change(() => setLabelOverrides(next));
  },

  /** プロジェクトを閉じた時のクリーンアップ。 */
  clear(): void {
    persistence.discardPending();
    loadVersion += 1;
    activeAdapter = undefined;
    activeHandle = undefined;
    setCustomEdges([]);
    setLabelOverrides(new Map());
  },
  flushPending: () => persistence.flushPending(),
  hasPending: () => persistence.hasPending(),
};

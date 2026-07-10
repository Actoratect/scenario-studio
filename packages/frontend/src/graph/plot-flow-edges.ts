import { createSignal } from 'solid-js';
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
let persistTimer: ReturnType<typeof setTimeout> | undefined;
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
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    const labelsObj: Record<string, YamlValue> = {};
    for (const [k, v] of labels) labelsObj[k] = v;
    void adapter
      .write(
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
      )
      .catch((e: unknown) => console.warn('[PlotFlowEdges] persist failed', e));
  }, 1000);
}

export const PlotFlowEdges = {
  customEdges,
  labelOverrides,

  /** プロジェクト切替時に呼ぶ。保存済みエッジを読み込む。 */
  switchProject(adapter: FileSystemAdapter, handle: ProjectHandle): void {
    activeAdapter = adapter;
    activeHandle = handle;
    setCustomEdges([]);
    setLabelOverrides(new Map());
    void readFile(adapter, handle)
      .then((loaded) => {
        if (activeHandle?.id !== handle.id) return;
        setCustomEdges(loaded.custom);
        setLabelOverrides(loaded.labels);
      })
      .catch((e: unknown) => console.warn('[PlotFlowEdges] load failed', e));
  },

  /** ユーザ定義の接続を追加 (章またぎ可)。 */
  add(source: NodeId, target: NodeId, label: string): void {
    seq += 1;
    const edge: PlotFlowCustomEdge = {
      id: `pfc:${Date.now().toString(36)}-${seq.toString(36)}`,
      source,
      target,
      label,
    };
    setCustomEdges([...customEdges(), edge]);
    schedulePersist();
  },

  updateLabel(id: string, label: string): void {
    setCustomEdges(customEdges().map((e) => (e.id === id ? { ...e, label } : e)));
    schedulePersist();
  },

  remove(id: string): void {
    setCustomEdges(customEdges().filter((e) => e.id !== id));
    schedulePersist();
  },

  /** 構造由来エッジ (暗黙 next / choice) のラベルを上書き。空文字で解除。 */
  setOverride(edgeId: string, label: string): void {
    const next = new Map(labelOverrides());
    if (label === '') next.delete(edgeId);
    else next.set(edgeId, label);
    setLabelOverrides(next);
    schedulePersist();
  },

  /** プロジェクトを閉じた時のクリーンアップ。 */
  clear(): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = undefined;
    activeAdapter = undefined;
    activeHandle = undefined;
    setCustomEdges([]);
    setLabelOverrides(new Map());
  },
};

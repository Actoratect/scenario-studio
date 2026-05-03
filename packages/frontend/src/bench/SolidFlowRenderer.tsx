import { createSignal } from 'solid-js';
import type { Component } from 'solid-js';
import { SolidFlow } from 'solid-flow';
import type { Edge as SolidFlowEdge, Node as SolidFlowNode } from 'solid-flow';
import type { BenchGraph } from './generateGraph';

// SolidFlow (DOM ベース) で BenchGraph を描画する。
// 設計上の MVP 採用候補 — 〜500 ノード狙い。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md, 12_architecture.md §3.1

export const SolidFlowRenderer: Component<{ graph: BenchGraph }> = (props) => {
  // SolidFlow は ID ごとに座標を画面ピクセルで持つので、正規化座標を viewport にスケール
  const SCALE = 600;
  // 親 (BenchmarkPanel) が graph 変更時に Switch+Match で本コンポーネントを unmount/remount するため、
  // props.graph は本インスタンスの寿命中で immutable。reactivity 警告は誤検知。
  // eslint-disable-next-line solid/reactivity
  const initialNodes = props.graph.nodes.map<SolidFlowNode>((n) => ({
    id: n.id,
    position: { x: n.x * SCALE + 600, y: n.y * SCALE + 400 },
    data: { label: n.label, content: '' },
    inputs: 1,
    outputs: 1,
  }));
  // eslint-disable-next-line solid/reactivity
  const initialEdges = props.graph.edges.map<SolidFlowEdge>((e) => ({
    id: e.id,
    sourceNode: e.source,
    targetNode: e.target,
    sourceOutput: 0,
    targetInput: 0,
  }));

  // SolidFlow は内部で nodes を mutable に扱うため、setter を渡しつつローカル signal を保つ
  const [n, setN] = createSignal(initialNodes);
  const [e, setE] = createSignal(initialEdges);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <SolidFlow nodes={n()} edges={e()} onNodesChange={setN} onEdgesChange={setE} />
    </div>
  );
};

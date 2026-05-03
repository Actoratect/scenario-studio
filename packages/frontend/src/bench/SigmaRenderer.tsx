import { onCleanup, onMount } from 'solid-js';
import type { Component } from 'solid-js';
import Graph from 'graphology';
import Sigma from 'sigma';
import type { BenchGraph } from './generateGraph';

// Sigma.js + Graphology (WebGL ベース) で BenchGraph を描画する。
// 設計上の β/1.0 採用候補 — 5,000〜10,000 ノード狙い。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md, 12_architecture.md §3.1

export const SigmaRenderer: Component<{ graph: BenchGraph }> = (props) => {
  let host: HTMLDivElement | undefined;
  let renderer: Sigma | undefined;

  onMount(() => {
    if (!host) return;
    const g = new Graph();
    for (const n of props.graph.nodes) {
      g.addNode(n.id, {
        x: n.x,
        y: n.y,
        size: 4,
        label: n.label,
        color: `hsl(${Math.floor(n.hue * 360)}deg 60% 60%)`,
      });
    }
    for (const e of props.graph.edges) {
      // Sigma 側は同 (source, target) 重複を許さないので try/catch でスキップ
      try {
        g.addEdgeWithKey(e.id, e.source, e.target, { color: 'rgba(120,120,120,0.4)' });
      } catch {
        // duplicate edge — skip
      }
    }
    renderer = new Sigma(g, host, {
      labelDensity: 0.2,
      labelGridCellSize: 80,
      renderLabels: true,
      renderEdgeLabels: false,
    });
  });

  onCleanup(() => {
    renderer?.kill();
  });

  return (
    <div
      ref={host}
      style={{ position: 'relative', width: '100%', height: '100%', background: '#fafafa' }}
    />
  );
};

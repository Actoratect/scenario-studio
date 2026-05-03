import { createSignal, For, Match, Switch } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { generateGraph } from '../bench/generateGraph';
import type { BenchGraph } from '../bench/generateGraph';
import { measureFps } from '../bench/measureFps';
import type { FpsResult } from '../bench/measureFps';
import { SigmaRenderer } from '../bench/SigmaRenderer';
import { SolidFlowRenderer } from '../bench/SolidFlowRenderer';

// PoC-B 大規模グラフ描画ベンチ Panel。
// SolidFlow (DOM) vs Sigma.js (WebGL) を同じ合成グラフで比較する最小ハーネス。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md, 13_roadmap.md PoC-B

type Library = 'solid-flow' | 'sigma' | 'none';
const NODE_PRESETS: readonly number[] = [100, 500, 1000, 2500, 5000];

interface BenchResult {
  library: Library;
  nodeCount: number;
  edgeCount: number;
  /** mount 開始から rAF 1 フレーム経過までの時間 (ms)。初回描画コストの目安。 */
  mountMs: number;
  /** mount 後 2 秒間の idle 時 rAF 計測。avgFps が 60 から落ちるなら描画/イベントループが詰まっている。 */
  idle: FpsResult;
}

export const BenchmarkPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [library, setLibrary] = createSignal<Library>('none');
  const [nodeCount, setNodeCount] = createSignal(100);
  const [graph, setGraph] = createSignal<BenchGraph | undefined>(undefined);
  const [running, setRunning] = createSignal(false);
  const [result, setResult] = createSignal<BenchResult | undefined>(undefined);

  async function runBench(lib: 'solid-flow' | 'sigma'): Promise<void> {
    setRunning(true);
    setResult(undefined);
    setLibrary('none');
    // 前回 renderer を必ず unmount してから次の bench に入る
    setGraph(undefined);
    await waitFrame();

    const g = generateGraph(nodeCount(), 42);
    setGraph(g);
    const mountStart = performance.now();
    setLibrary(lib);
    await waitFrame();
    const mountMs = performance.now() - mountStart;

    const idle = await measureFps({ onFrame: () => {}, durationMs: 2000 });

    setResult({
      library: lib,
      nodeCount: g.nodes.length,
      edgeCount: g.edges.length,
      mountMs,
      idle,
    });
    setRunning(false);
  }

  return (
    <div class="panel-content panel-bench">
      <div class="panel-bench-controls">
        <span>
          PoC-B grade-graph bench · <code>{params.api.id}</code>
        </span>
        <label>
          Nodes:
          <select
            disabled={running()}
            value={nodeCount()}
            onInput={(e) => setNodeCount(Number(e.currentTarget.value))}
          >
            <For each={NODE_PRESETS}>{(n) => <option value={n}>{n.toLocaleString()}</option>}</For>
          </select>
        </label>
        <button disabled={running()} onClick={() => void runBench('solid-flow')}>
          Render: SolidFlow (DOM)
        </button>
        <button disabled={running()} onClick={() => void runBench('sigma')}>
          Render: Sigma.js (WebGL)
        </button>
      </div>

      <div class="panel-bench-results">
        {running() && <span>Running…</span>}
        {result() && <ResultRow result={result()!} />}
      </div>

      <div class="panel-bench-stage">
        <Switch fallback={<EmptyStage />}>
          <Match when={library() === 'solid-flow' && graph()}>
            <SolidFlowRenderer graph={graph()!} />
          </Match>
          <Match when={library() === 'sigma' && graph()}>
            <SigmaRenderer graph={graph()!} />
          </Match>
        </Switch>
      </div>
    </div>
  );
};

const EmptyStage: Component = () => (
  <div class="panel-bench-empty">
    Select a node count, then click <strong>Render</strong> to mount a graph and measure FPS.
  </div>
);

const ResultRow: Component<{ result: BenchResult }> = (props) => (
  <span class="panel-bench-result">
    <strong>{props.result.library}</strong> · {props.result.nodeCount.toLocaleString()} nodes /{' '}
    {props.result.edgeCount.toLocaleString()} edges · mount {props.result.mountMs.toFixed(0)} ms ·
    idle {props.result.idle.avgFps.toFixed(1)} fps (max frame{' '}
    {props.result.idle.maxFrameMs.toFixed(1)} ms, p99 {props.result.idle.p99FrameMs.toFixed(1)} ms)
  </span>
);

function waitFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

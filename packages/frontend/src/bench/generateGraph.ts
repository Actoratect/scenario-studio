// 大規模グラフベンチ用の合成データジェネレータ。
// シード固定なので比較ベンチで両ライブラリに同じデータを投入できる。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md, 13_roadmap.md PoC-B

export interface BenchNode {
  id: string;
  label: string;
  /** -1..1 範囲の正規化座標。各 renderer 側で実画面サイズにスケールする。 */
  x: number;
  y: number;
  /** 0..1。renderer によって色相にマップする等。 */
  hue: number;
}

export interface BenchEdge {
  id: string;
  source: string;
  target: string;
}

export interface BenchGraph {
  nodes: readonly BenchNode[];
  edges: readonly BenchEdge[];
}

/**
 * 決定論的乱数で N ノード + 約 2N エッジのグラフを生成。
 * 配置は 2D 上のクラスタ (sqrt(N) 個) に分布させ、相関図っぽい疎結合を再現。
 */
export function generateGraph(nodeCount: number, seed = 42): BenchGraph {
  const rng = mulberry32(seed);
  const clusters = Math.max(1, Math.round(Math.sqrt(nodeCount)));
  const clusterCenters: Array<{ x: number; y: number; hue: number }> = [];
  for (let i = 0; i < clusters; i++) {
    const angle = (i / clusters) * Math.PI * 2;
    const radius = 0.6;
    clusterCenters.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      hue: rng(),
    });
  }

  const nodes: BenchNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const c = clusterCenters[i % clusters]!;
    const jitter = 0.15;
    nodes.push({
      id: `n${i}`,
      label: `Node ${i}`,
      x: c.x + (rng() - 0.5) * jitter,
      y: c.y + (rng() - 0.5) * jitter,
      hue: c.hue,
    });
  }

  const edgeCount = Math.floor(nodeCount * 2);
  const edges: BenchEdge[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < edgeCount; i++) {
    const a = Math.floor(rng() * nodeCount);
    let b = Math.floor(rng() * nodeCount);
    if (a === b) b = (b + 1) % nodeCount;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: `e${i}`, source: `n${a}`, target: `n${b}` });
  }
  return { nodes, edges };
}

// xorshift 系の決定論的 PRNG (Mulberry32)。0..1 を返す。
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

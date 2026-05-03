import type { LensNode, LensPayload } from './relationship-lens.js';
import type { NodeId } from '../domain/era.js';

// グラフ描画用の決定論的初期レイアウト。
// MVP は「ノード ID をハッシュして円周上に並べる + テンプレ別に半径オフセット」。
// 真の Force-directed (graphology-layout-forceatlas2) は Phase 1 後半 / M5 拡張で。
// レイアウト保存 (`Layouts/<lens>.yaml`) も Phase 1 後半。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M5

export interface NodePosition {
  x: number;
  y: number;
}

export interface LayoutOptions {
  /** 描画キャンバスの中心。 */
  centerX?: number;
  centerY?: number;
  /** 円配置の基本半径。 */
  radius?: number;
  /** テンプレ別に外側にオフセットする量。 */
  templateOffset?: number;
}

/**
 * 決定論的な「テンプレ別同心円」レイアウト。
 * - 同テンプレのノードは円周上に等間隔で並ぶ
 * - テンプレが違えば違う半径
 * - シードに依存せず再現可能 (テストで安定)
 */
export function deterministicCircularLayout(
  payload: LensPayload,
  options: LayoutOptions = {},
): ReadonlyMap<NodeId, NodePosition> {
  const center = { x: options.centerX ?? 0, y: options.centerY ?? 0 };
  const baseRadius = options.radius ?? 200;
  const offset = options.templateOffset ?? 90;

  const buckets = bucketByTemplate(payload.nodes);
  const result = new Map<NodeId, NodePosition>();

  let templateIndex = 0;
  for (const [, group] of buckets) {
    const r = baseRadius + offset * templateIndex;
    const sorted = [...group].sort((a, b) => a.label.localeCompare(b.label));
    sorted.forEach((node, i) => {
      const angle = (i / Math.max(sorted.length, 1)) * Math.PI * 2;
      result.set(node.id, {
        x: center.x + Math.cos(angle) * r,
        y: center.y + Math.sin(angle) * r,
      });
    });
    templateIndex++;
  }
  return result;
}

function bucketByTemplate(nodes: readonly LensNode[]): Map<string, LensNode[]> {
  const out = new Map<string, LensNode[]>();
  for (const n of nodes) {
    const arr = out.get(n.templateId) ?? [];
    arr.push(n);
    out.set(n.templateId, arr);
  }
  // テンプレ ID 順で安定化 (forEach の挿入順に依存しないため)
  return new Map(Array.from(out.entries()).sort((a, b) => a[0].localeCompare(b[0])));
}

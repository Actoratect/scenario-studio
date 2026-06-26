// 明示的なノード間関係 (Relation)。PR-E で導入。
//
// 既存の暗黙関係 (node_ref フィールド由来) と並ぶ第 2 系統:
//   - 暗黙: ScenarioNode.fields の node_ref → 1 ノードに 1 個固定 (faction / leader 等)
//   - 明示: Relation エンティティ → 任意の 2 ノード間に N 個、type を後で変更可
//
// 永続化は `Relations/relations.yaml` に array で集約。
// MVP は単一ファイル、Phase 3 で「from-source 単位の分割ファイル」に変更余地を残す。
//
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §2,
//       ../../../../Documentation/ScenarioEditor/03_data-model.md

import type { NodeId } from './era.js';

export type RelationId = string & { readonly __brand: 'RelationId' };
export const relationId = (s: string): RelationId => s as RelationId;

export interface Relation {
  id: RelationId;
  source: NodeId;
  target: NodeId;
  /**
   * source → target 方向の関係性を表す自由テキスト。
   * グラフでは source→target の矢印として 1 本描かれる。
   * 双方向にしたい場合は逆向き (target→source) の Relation をもう 1 本作る。
   */
  text: string;
}

import type { NodeId } from '../domain/era.js';
import type { ScenarioNode } from '../domain/node.js';
import type { Relation, RelationId } from '../domain/Relation.js';
import { getRelationType, type RelationType } from '../domain/relations.js';
import type { TemplateRegistry } from '../domain/templates/index.js';

// ScenarioNode 集合と TemplateRegistry から「Relationship Lens」用の
// 描画ペイロード ({ nodes, edges }) を構築する。
// 2 系統の edges を統合して返す:
//   - implicit: ScenarioNode.fields の node_ref から自動導出 (faction / leader 等)
//   - explicit: PR-E で導入した Relation エンティティ (任意の type を後から変更可)
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §2,
//       ../../../../Documentation/ScenarioEditor/03_data-model.md,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M5

export interface LensNode {
  id: NodeId;
  /** UI 表示用の slug or display_name。 */
  label: string;
  /** テンプレート ID — UI 側で色やアイコンに transform。 */
  templateId: string;
  /** ScenarioNode.thumbnail (Media/ 配下のパス) があれば。 */
  thumbnail?: string | undefined;
}

export type LensEdgeKind = 'implicit' | 'explicit';

export interface LensEdge {
  /** edge の安定 ID。implicit は `<src>:<fieldId>:<tgt>`、explicit は Relation.id。 */
  id: string;
  source: NodeId;
  target: NodeId;
  /** 表示ラベル — implicit は fieldId、explicit は relation type の label (Relation.label があれば優先)。 */
  label: string;
  kind: LensEdgeKind;
  /** explicit の場合のみ: Relation.id を保持 (UI で picker / delete に使う)。 */
  relationId?: RelationId;
  /** explicit の場合のみ: relation type を保持。 */
  relationType?: RelationType;
}

export interface LensPayload {
  nodes: readonly LensNode[];
  edges: readonly LensEdge[];
}

/**
 * Relationship Lens — 全 ScenarioNode と node_ref フィールド由来 edges + 明示 Relations。
 * target が project.nodes に無いリレーション (孤児参照) は edge に含まない (M7 Lint で警告)。
 */
export function computeRelationshipLens(
  nodes: ReadonlyMap<NodeId, ScenarioNode>,
  templates: TemplateRegistry,
  relations: readonly Relation[] = [],
): LensPayload {
  const lensNodes: LensNode[] = [];
  for (const node of nodes.values()) {
    lensNodes.push({
      id: node.id,
      label: pickLabel(node),
      templateId: node.templateId,
      ...(node.thumbnail !== undefined ? { thumbnail: node.thumbnail } : {}),
    });
  }
  lensNodes.sort((a, b) => a.label.localeCompare(b.label));

  const validIds = new Set(nodes.keys());
  const edges: LensEdge[] = [];

  // Implicit: node_ref フィールド由来
  for (const node of nodes.values()) {
    const tmpl = templates.tryGet(node.templateId as never);
    if (!tmpl) continue;
    for (const field of tmpl.fields) {
      if (field.type !== 'node_ref') continue;
      const v = node.fields[field.id];
      if (typeof v !== 'string' || v === '') continue;
      const target = v as NodeId;
      if (!validIds.has(target)) continue;
      edges.push({
        id: `${node.id}:${field.id}:${target}`,
        source: node.id,
        target,
        label: field.id,
        kind: 'implicit',
      });
    }
  }

  // Explicit: PR-E Relation エンティティ
  for (const rel of relations) {
    if (!validIds.has(rel.source) || !validIds.has(rel.target)) continue;
    const typeLabel = (() => {
      try {
        return getRelationType(rel.type).label;
      } catch {
        return rel.type;
      }
    })();
    edges.push({
      id: rel.id,
      source: rel.source,
      target: rel.target,
      label: rel.label && rel.label !== '' ? rel.label : typeLabel,
      kind: 'explicit',
      relationId: rel.id,
      relationType: rel.type,
    });
  }

  return { nodes: lensNodes, edges };
}

function pickLabel(node: ScenarioNode): string {
  const display = node.fields['display_name'];
  if (typeof display === 'string' && display !== '') return display;
  return node.slug;
}

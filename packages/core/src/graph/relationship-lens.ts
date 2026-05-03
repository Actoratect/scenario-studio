import type { NodeId } from '../domain/era.js';
import type { ScenarioNode } from '../domain/node.js';
import type { TemplateRegistry } from '../domain/templates/index.js';

// ScenarioNode 集合と TemplateRegistry から「Relationship Lens」用の
// 描画ペイロード ({ nodes, edges }) を構築する。
// MVP は **node_ref フィールドから edges を導出**する暗黙関係モデル。
// Phase 3 で `Relations/*.yaml` 明示エンティティと混合 (Q-B3 inverse 自動推論)。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §2,
//       ../../../../Documentation/ScenarioEditor/03_data-model.md,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M5

export interface LensNode {
  id: NodeId;
  /** UI 表示用の slug or display_name (LocalizedString は ja を優先)。 */
  label: string;
  /** テンプレート ID — UI 側で色やアイコンに transform。 */
  templateId: string;
}

export interface LensEdge {
  /** edge の安定 ID。`<sourceNodeId>:<fieldId>:<targetNodeId>`。 */
  id: string;
  source: NodeId;
  target: NodeId;
  /** 由来 field id (例: `faction` / `leader` / `parent_location`)。UI ラベルとしても使用。 */
  fieldId: string;
}

export interface LensPayload {
  nodes: readonly LensNode[];
  edges: readonly LensEdge[];
}

/**
 * Relationship Lens (MVP) — 全 ScenarioNode と node_ref フィールド由来 edges。
 * target が project.nodes に無いリレーション (孤児参照) は edge に含まない (M7 Lint で警告)。
 */
export function computeRelationshipLens(
  nodes: ReadonlyMap<NodeId, ScenarioNode>,
  templates: TemplateRegistry,
): LensPayload {
  const lensNodes: LensNode[] = [];
  for (const node of nodes.values()) {
    lensNodes.push({
      id: node.id,
      label: pickLabel(node),
      templateId: node.templateId,
    });
  }
  // 安定描画のため slug でソート
  lensNodes.sort((a, b) => a.label.localeCompare(b.label));

  const validIds = new Set(nodes.keys());
  const edges: LensEdge[] = [];
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
        fieldId: field.id,
      });
    }
  }
  return { nodes: lensNodes, edges };
}

function pickLabel(node: ScenarioNode): string {
  const display = node.fields['display_name'] ?? node.fields['full_name'];
  if (typeof display === 'object' && display !== null && !Array.isArray(display)) {
    const localized = display as { [k: string]: unknown };
    if (typeof localized['ja'] === 'string') return localized['ja'];
    if (typeof localized['en'] === 'string') return localized['en'];
  }
  return node.slug;
}

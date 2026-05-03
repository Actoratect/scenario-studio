// MVP の固定 5 種リレーション。
// Phase 3 でユーザ定義リレーションタイプ + inverse 自動推論 (Q-B3) に拡張予定。
// PR-B: label を LocalizedString → plain string (ja) に簡略化。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md, 04_graph-editor.md,
//       ../../../../Documentation/ScenarioEditor/14_open-questions.md Q-B3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M4

export type RelationType = 'parent' | 'child' | 'friend' | 'enemy' | 'member_of';

export interface RelationTypeDefinition {
  id: RelationType;
  label: string;
  /** inverse 関係 (parent ↔ child)。symmetric なら自分自身。 */
  inverse: RelationType;
  /** symmetric (friend ↔ friend など) なら true。 */
  symmetric: boolean;
}

export const RELATION_TYPES: ReadonlyArray<RelationTypeDefinition> = [
  { id: 'parent', label: '親', inverse: 'child', symmetric: false },
  { id: 'child', label: '子', inverse: 'parent', symmetric: false },
  { id: 'friend', label: '友人', inverse: 'friend', symmetric: true },
  { id: 'enemy', label: '敵対', inverse: 'enemy', symmetric: true },
  // 厳密 inverse は has_member だが Phase 3 で追加
  { id: 'member_of', label: '所属', inverse: 'member_of', symmetric: false },
];

const BY_ID = new Map<RelationType, RelationTypeDefinition>(RELATION_TYPES.map((r) => [r.id, r]));

export function getRelationType(id: RelationType): RelationTypeDefinition {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`Unknown relation type: ${id}`);
  return r;
}

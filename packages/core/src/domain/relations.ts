// MVP の固定 5 種リレーション。
// Phase 3 でユーザ定義リレーションタイプ + inverse 自動推論 (Q-B3) に拡張予定。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md, 04_graph-editor.md,
//       ../../../../Documentation/ScenarioEditor/14_open-questions.md Q-B3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M4

import type { LocalizedString } from './templates/index.js';

export type RelationType = 'parent' | 'child' | 'friend' | 'enemy' | 'member_of';

export interface RelationTypeDefinition {
  id: RelationType;
  label: LocalizedString;
  /** inverse 関係 (parent ↔ child)。symmetric なら自分自身。 */
  inverse: RelationType;
  /** symmetric (friend ↔ friend など) なら true。 */
  symmetric: boolean;
}

export const RELATION_TYPES: ReadonlyArray<RelationTypeDefinition> = [
  {
    id: 'parent',
    label: { ja: '親', en: 'Parent' },
    inverse: 'child',
    symmetric: false,
  },
  {
    id: 'child',
    label: { ja: '子', en: 'Child' },
    inverse: 'parent',
    symmetric: false,
  },
  {
    id: 'friend',
    label: { ja: '友人', en: 'Friend' },
    inverse: 'friend',
    symmetric: true,
  },
  {
    id: 'enemy',
    label: { ja: '敵対', en: 'Enemy' },
    inverse: 'enemy',
    symmetric: true,
  },
  {
    id: 'member_of',
    label: { ja: '所属', en: 'Member of' },
    inverse: 'member_of', // 厳密 inverse は has_member だが Phase 3 で追加
    symmetric: false,
  },
];

const BY_ID = new Map<RelationType, RelationTypeDefinition>(RELATION_TYPES.map((r) => [r.id, r]));

export function getRelationType(id: RelationType): RelationTypeDefinition {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`Unknown relation type: ${id}`);
  return r;
}

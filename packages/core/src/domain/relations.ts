// リレーションタイプ。RelationType は **任意の文字列** を許容する (= 自由入力)。
// 下の RELATION_TYPES は組込のプリセット (UI のショートカット) であり、
// データとしてはこれら以外の値も保存可能。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md, 04_graph-editor.md,
//       ../../../../Documentation/ScenarioEditor/14_open-questions.md Q-B3

export type RelationType = string;

export interface RelationTypeDefinition {
  id: RelationType;
  label: string;
  /** inverse 関係 (parent ↔ child)。symmetric なら自分自身。 */
  inverse: RelationType;
  /** symmetric (friend ↔ friend など) なら true。 */
  symmetric: boolean;
}

/**
 * 組込プリセット。UI のクイック選択用。データはこれ以外の任意文字列も持てる。
 */
export const RELATION_TYPES: ReadonlyArray<RelationTypeDefinition> = [
  { id: 'parent', label: '親', inverse: 'child', symmetric: false },
  { id: 'child', label: '子', inverse: 'parent', symmetric: false },
  { id: 'friend', label: '友人', inverse: 'friend', symmetric: true },
  { id: 'enemy', label: '敵対', inverse: 'enemy', symmetric: true },
  // 厳密 inverse は has_member だが Phase 3 で追加
  { id: 'member_of', label: '所属', inverse: 'member_of', symmetric: false },
];

const BY_ID = new Map<RelationType, RelationTypeDefinition>(RELATION_TYPES.map((r) => [r.id, r]));

/**
 * プリセットに登録された型ならその定義、未登録なら **任意文字列扱いで symmetric** とみなす
 * フォールバック定義を返す (= throw しない)。
 * 自由入力対応のため、呼び元は throw を期待しない実装にする。
 */
export function getRelationType(id: RelationType): RelationTypeDefinition {
  const r = BY_ID.get(id);
  if (r) return r;
  return { id, label: id, inverse: id, symmetric: true };
}

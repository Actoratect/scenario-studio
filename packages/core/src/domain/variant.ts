import type { EraId, EraIndex } from './era.js';
import type { FieldRecord, FieldValue, NodeVariant, ResolvedNode, ScenarioNode } from './node.js';

// Era Variant 解決 (PoC-E)。
// 与えられた `targetEraId` に対し、ベースフィールドに **祖先 Era の variant 群を general → specific の順** で
// マージして「その時代の見え方」を計算する。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md §1.2,
//       ../../../../Documentation/ScenarioEditor/14_open-questions.md Q-B2 (merge セマンティクス),
//       ../../../../Documentation/ScenarioEditor/05_timeline.md

/**
 * @param node — 対象ノード (ベース fields + variants)
 * @param targetEraId — 「この時代の状態を見たい」ターゲット Era
 * @param eraIndex — Era 階層 index (buildEraIndex で構築)
 *
 * アルゴリズム:
 *   1. targetEraId の祖先列を取得 (`[target, parent, ...]`)
 *   2. ノードの variants から「祖先列に含まれる」ものだけ抽出
 *   3. general (root 寄り) → specific (target) の順に並べ、ベースから順に override 適用
 *   4. fields は per-key の merge セマンティクス:
 *      - 配列: 全置換
 *      - レコード (object): shallow merge
 *      - スカラー: 上書き
 *   5. thumbnailOverride は最も specific な値で上書き
 *   6. isAlive は最も specific な non-null 値、それも無ければベース、それも無ければ undefined
 */
export function resolveNode(
  node: ScenarioNode,
  targetEraId: EraId,
  eraIndex: EraIndex,
): ResolvedNode {
  // ancestry は [target, parent, ..., root] の順なので、reverse すれば root → target になる。
  // 該当 era 系統に属さない variant (e.g. era.young vs era.elder) は applicable に入らない。
  const generalToSpecific = [...eraIndex.ancestorsOf(targetEraId)].reverse();
  const applicable: NodeVariant[] = [];
  for (const eraId of generalToSpecific) {
    const variant = node.variants?.find((v) => v.eraId === eraId);
    if (variant) applicable.push(variant);
  }
  // ancestry に含まれない variant (= 全く別の era 系統) は無視する。
  // データ整合性のため、見つからない eraId の variant がある場合も silent に無視
  // (Phase 1 の Linter で警告候補とする)。

  // fields マージ
  const fields: { [key: string]: FieldValue } = { ...node.fields };
  for (const variant of applicable) {
    if (!variant.fieldsOverride) continue;
    for (const [key, override] of Object.entries(variant.fieldsOverride)) {
      fields[key] = mergeField(fields[key], override);
    }
  }

  // thumbnail / isAlive — 「最も specific な値」が勝つ。
  let thumbnail = node.thumbnail;
  let isAlive: boolean | undefined =
    node.isAlive === null || node.isAlive === undefined ? undefined : node.isAlive;
  for (const variant of applicable) {
    if (variant.thumbnailOverride !== undefined) {
      thumbnail = variant.thumbnailOverride;
    }
    if (variant.isAlive !== undefined && variant.isAlive !== null) {
      isAlive = variant.isAlive;
    }
  }

  const result: ResolvedNode = {
    id: node.id,
    templateId: node.templateId,
    slug: node.slug,
    fields,
    appliedVariantEras: applicable.map((v) => v.eraId),
  };
  if (thumbnail !== undefined) result.thumbnail = thumbnail;
  if (isAlive !== undefined) result.isAlive = isAlive;
  return result;
}

/**
 * 14_open-questions Q-B2 の merge 規則。
 * - 配列 → 全置換
 * - record (plain object) → shallow merge
 * - スカラー → 上書き
 * 型が異なる場合 (例: base が array で override が scalar) も「全置換」とする。
 */
export function mergeField(base: FieldValue | undefined, override: FieldValue): FieldValue {
  if (Array.isArray(override)) return override;
  if (isRecord(override)) {
    if (isRecord(base)) {
      return { ...base, ...override } as FieldRecord;
    }
    return override;
  }
  return override;
}

function isRecord(v: FieldValue | undefined): v is FieldRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ScenarioNode (世界の最小単位) と NodeVariant (時代差分) の型。
// PoC-E は Variant 解決ロジックの contract に必要な最小限のみ。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md §1

import type { EraId, NodeId } from './era.js';

export type Scalar = string | number | boolean | null;
export type FieldArray = readonly Scalar[];
export type FieldRecord = { readonly [key: string]: Scalar };
/**
 * テンプレートで定義されたフィールド値。Phase 1 でテンプレート schema 検証を入れる。
 * - スカラー: string/number/boolean/null
 * - 配列: スカラー要素のみ
 * - レコード: スカラー値のみ (LocalizedString 等)
 */
export type FieldValue = Scalar | FieldArray | FieldRecord;

export type MediaRef = string;

/**
 * 14_open-questions Q-B2 の暫定方針:
 *   - スカラーは上書き
 *   - 配列は全置換
 *   - マップ (FieldRecord) は shallow merge
 * `null` の eraId 別 isAlive は「親 Era から継承」を意味する。
 */
export interface NodeVariant {
  eraId: EraId;
  fieldsOverride?: { readonly [key: string]: FieldValue };
  thumbnailOverride?: MediaRef;
  isAlive?: boolean | null;
}

/**
 * 立ち絵 (full portrait) のうち、サムネイル円に表示する正方形クロップ位置 (PR-AC)。
 * x / y / size は 0..1 の比率。size が 1.0 なら全体を 1:1 で、
 * 0.3 なら portrait の 30% × 30% の領域を crop する。
 */
export interface ThumbnailRect {
  x: number;
  y: number;
  size: number;
}

export interface ScenarioNode {
  id: NodeId;
  templateId: string;
  slug: string;
  /** 立ち絵 / 全身画像 (Inspector header に大きく表示) */
  thumbnail?: MediaRef;
  /** thumbnail のうち、丸サムネイルとして使う正方形クロップ (PR-AC)。未指定なら全体を使う。 */
  thumbnailRect?: ThumbnailRect;
  fields: { readonly [key: string]: FieldValue };
  variants?: readonly NodeVariant[];
  /** ベース isAlive。Variant が null なら継承。 */
  isAlive?: boolean | null;
}

/**
 * resolveNode() の戻り値。fields は変異済 (base + 該当 Era 群の override をマージ)。
 */
export interface ResolvedNode {
  id: NodeId;
  templateId: string;
  slug: string;
  thumbnail?: MediaRef;
  fields: { readonly [key: string]: FieldValue };
  isAlive?: boolean;
  /** 適用された variant の eraId 群 (general → specific の順)。デバッグ・UI 表示用。 */
  appliedVariantEras: readonly EraId[];
}

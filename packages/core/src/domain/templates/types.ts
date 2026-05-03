// Template (ノード型定義) のスキーマ。03_data-model.md §2 に対応。
// MVP は string / localized_string / multiline / int / number / enum / bool / node_ref を担保。
// markdown / media_ref / array<T> / date は M3-M8 で追加予定。
// 詳細: ../../../../../Documentation/ScenarioEditor/03_data-model.md §2,
//       ../../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M2

export type TemplateId = string & { readonly __brand: 'TemplateId' };
export const templateId = (s: string): TemplateId => s as TemplateId;

export type LocalizedString = { readonly [locale: string]: string };

export type FieldType =
  | 'string'
  | 'multiline_string'
  | 'localized_string'
  | 'int'
  | 'number'
  | 'enum'
  | 'bool'
  | 'node_ref'
  | 'markdown'
  | 'media_ref';

interface BaseFieldSchema {
  id: string;
  label: LocalizedString;
  type: FieldType;
  required?: boolean;
  description?: string;
  unit?: string;
}

export interface StringFieldSchema extends BaseFieldSchema {
  type: 'string' | 'multiline_string' | 'markdown';
  defaultValue?: string;
  /** 表示時の最大文字数バッジ用 (M6 Script 編集の超過警告などにも転用予定)。 */
  maxLength?: number;
}

export interface LocalizedStringFieldSchema extends BaseFieldSchema {
  type: 'localized_string';
  defaultValue?: LocalizedString;
}

export interface NumericFieldSchema extends BaseFieldSchema {
  type: 'int' | 'number';
  defaultValue?: number;
  min?: number;
  max?: number;
}

export interface EnumFieldSchema extends BaseFieldSchema {
  type: 'enum';
  values: readonly string[];
  defaultValue?: string;
}

export interface BoolFieldSchema extends BaseFieldSchema {
  type: 'bool';
  defaultValue?: boolean;
}

export interface NodeRefFieldSchema extends BaseFieldSchema {
  type: 'node_ref';
  /** 参照可能な template id を絞り込む。空なら任意のノード OK。 */
  referencesTemplateId?: TemplateId;
  defaultValue?: string;
}

export interface MediaRefFieldSchema extends BaseFieldSchema {
  type: 'media_ref';
  defaultValue?: string;
}

export type FieldSchema =
  | StringFieldSchema
  | LocalizedStringFieldSchema
  | NumericFieldSchema
  | EnumFieldSchema
  | BoolFieldSchema
  | NodeRefFieldSchema
  | MediaRefFieldSchema;

export interface TemplateDefinition {
  id: TemplateId;
  /** ノード保存時の `Nodes/<directory>/<slug>.yaml`。`characters` 等。 */
  directory: string;
  displayName: LocalizedString;
  /** UI で使う icon ID。MVP は string 識別子だけ持つ (実 icon ライブラリは Phase 3)。 */
  icon: string;
  defaultThumbnailColor: string;
  fields: readonly FieldSchema[];
}

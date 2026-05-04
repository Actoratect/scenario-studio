// Template (ノード型定義) のスキーマ。03_data-model.md §2 に対応。
// MVP は string / multiline / int / number / enum / bool / node_ref を担保。
// markdown / media_ref / array<T> / date は M3-M8 で追加予定。
//
// PR-B: localized_string field type を廃止。
//   理由: ライターのワークフローでは「シナリオを書き終えてから他言語化する」のが現実的で、
//   執筆中に毎フィールド JA/EN を入力させる UX は破綻する (3 言語以上に増えると爆発)。
//   既存の `full_name: LocalizedString` は `display_name + reading + dev_name` の 3 つに分解。
//   翻訳機能 (Phase 3+) は別レイヤ (用語集連動の翻訳パネル) で実装する。
//   label / displayName も plain string (ja) に簡略化。
//
// 詳細: ../../../../../Documentation/ScenarioEditor/03_data-model.md §2,
//       ../../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M2

export type TemplateId = string & { readonly __brand: 'TemplateId' };
export const templateId = (s: string): TemplateId => s as TemplateId;

export type FieldType =
  | 'string'
  | 'multiline_string'
  | 'int'
  | 'number'
  | 'enum'
  | 'bool'
  | 'node_ref'
  | 'markdown'
  | 'media_ref';

interface BaseFieldSchema {
  id: string;
  /** UI ラベル (日本語)。Phase 3+ で多言語化する場合はここを拡張。 */
  label: string;
  type: FieldType;
  required?: boolean;
  description?: string;
  unit?: string;
  /** Inspector でフィールドを分類するグループ名 (PR-O)。同じ名前の field をまとめて表示。 */
  group?: string;
}

export interface StringFieldSchema extends BaseFieldSchema {
  type: 'string' | 'multiline_string' | 'markdown';
  defaultValue?: string;
  /** 表示時の最大文字数バッジ用 (M6 Script 編集の超過警告などにも転用予定)。 */
  maxLength?: number;
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
  | NumericFieldSchema
  | EnumFieldSchema
  | BoolFieldSchema
  | NodeRefFieldSchema
  | MediaRefFieldSchema;

export interface TemplateDefinition {
  id: TemplateId;
  /** ノード保存時の `Nodes/<directory>/<slug>.yaml`。`characters` 等。 */
  directory: string;
  /** 表示名 (日本語)。 */
  displayName: string;
  /** UI で使う icon ID。MVP は string 識別子だけ持つ (実 icon ライブラリは Phase 3)。 */
  icon: string;
  defaultThumbnailColor: string;
  fields: readonly FieldSchema[];
}

/**
 * 全テンプレ共通の「3 つの名前」ヘルパ。
 *  - display_name: 画面 / 出力に出る人間用の名前 (必須)
 *  - reading: 読み仮名 (任意)
 *  - dev_name: 開発名 / 内部コード呼称 (任意)。slug とは別、ScriptPanel での参照に使う英字呼称
 */
export const NAME_FIELDS: readonly FieldSchema[] = [
  {
    id: 'display_name',
    label: '名前',
    type: 'string',
    required: true,
    description: '画面・出力に出る人間用の名前',
    group: '名前',
  },
  {
    id: 'reading',
    label: '読み仮名',
    type: 'string',
    description: 'ふりがな / カナ。検索 / ソート / TTS で利用',
    group: '名前',
  },
  {
    id: 'dev_name',
    label: '開発名',
    type: 'string',
    description: '英字内部呼称。脚本 (who: ...) で参照する短い識別子',
    group: '名前',
  },
];

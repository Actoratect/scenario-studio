// YAML parse / serialize — Eemeli `yaml` を使い AST (Document) を保持して
// 「ライターが書いたコメント・空行・配列スタイル」を編集後も保つ往復可能性を持つ。
// 詳細: ../../../../Documentation/ScenarioEditor/08_file-format.md §4 (style guide),
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1

import { Document, parseDocument, stringify } from 'yaml';
import type { ToStringOptions } from 'yaml';

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue };

export interface ParsedYaml<T extends YamlValue = YamlValue> {
  /** AST 保持 — comment や styling を後段の serialize で復元するために使う。 */
  readonly doc: Document.Parsed;
  /** plain JS の値 (toJSON 相当)。読み取り専用としてのみ使い、変更は編集系 API を経由する。 */
  readonly value: T;
}

const DEFAULT_STRINGIFY_OPTIONS: ToStringOptions = {
  // 08_file-format.md §4 の方針:
  //   - インデント 2 スペース
  //   - 複数行文字列は `|` (literal block) を優先
  //   - fold (`>`) は禁止 (意図せぬ空白吸収を避ける)
  indent: 2,
  blockQuote: 'literal',
  defaultStringType: 'PLAIN',
  defaultKeyType: 'PLAIN',
  // null 値は省略 (08 §4: "field: null ではなくキー自体を消す")
  nullStr: 'null',
  // 行幅は固定しない (Japanese テーブルなどで折り返されるのを避ける)
  lineWidth: 0,
};

/**
 * YAML テキストをパースして AST + plain value を返す。
 * @throws YAML.YAMLParseError
 */
export function parseYaml<T extends YamlValue = YamlValue>(text: string): ParsedYaml<T> {
  const doc = parseDocument(text, { keepSourceTokens: true });
  if (doc.errors.length > 0) {
    const first = doc.errors[0]!;
    throw first;
  }
  return { doc, value: doc.toJSON() as T };
}

/**
 * AST を再シリアライズ。`parseYaml` で取った doc を更新せずそのまま渡せば、
 * 元のコメント・空行・配列スタイルが保たれる。
 *
 * 値だけ更新したい場合は、`doc.set(key, value)` を呼んでから本関数で書き戻す。
 */
export function serializeYaml(doc: Document.Parsed | Document, options?: ToStringOptions): string {
  return doc.toString({ ...DEFAULT_STRINGIFY_OPTIONS, ...options });
}

/**
 * plain な JS 値から新規 YAML を作る (新規ファイル生成時用)。
 * comment 保持の round-trip が必要なら parseYaml + doc.set を使うこと。
 */
export function stringifyYaml(value: YamlValue, options?: ToStringOptions): string {
  return stringify(value, { ...DEFAULT_STRINGIFY_OPTIONS, ...options });
}

// M8 セキュリティ — 入力サニタイズ (C0 制御文字フィルタ)
export { sanitizeYamlKey, sanitizeYamlTree, sanitizeYamlValue } from './sanitize.js';

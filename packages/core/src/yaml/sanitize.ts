// 入力サニタイズ: YAML キー / 値の制御文字フィルタ (M8 セキュリティ)。
//
// 攻撃シナリオ:
//   - ユーザがスクリプトファイルをコピペで貼った時に NUL / BEL 等が混入し、
//     エディタや CI ツールが誤動作する。
//   - C0 コントロール (LF / CR / TAB を除く) は YAML 1.2 でも非推奨。
//
// 方針:
//   - 文字列値からは `\n` (0x0A), `\r` (0x0D), `\t` (0x09) 以外の C0 + DEL を除去
//   - キー名からは LF / CR / TAB も含めて全 C0 を除去 (キーに改行があると壊れる)
//   - 0x00 (NUL) は最も危険なので両方で削る
//
// 詳細: ../../../../Documentation/ScenarioEditor/16_security.md §2.4 (入力サニタイズ),
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

// C0 コントロール (LF / CR / TAB を除く) + DEL を値から除去。
// eslint-disable-next-line no-control-regex
const VALUE_BAD = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
// キー名からは全 C0 + DEL を除去 (改行・タブが入ると YAML が壊れる)。
// eslint-disable-next-line no-control-regex
const KEY_BAD = /[\x00-\x1f\x7f]/g;

export function sanitizeYamlValue(s: string): string {
  return s.replace(VALUE_BAD, '');
}

export function sanitizeYamlKey(s: string): string {
  return s.replace(KEY_BAD, '');
}

/**
 * 任意の YamlValue ツリーを再帰的にサニタイズして返す。
 * 元の値は変更しない (immutable)。配列 / オブジェクトの構造は保持。
 */
export function sanitizeYamlTree<T>(value: T): T {
  return sanitize(value) as T;
}

function sanitize(v: unknown): unknown {
  if (typeof v === 'string') return sanitizeYamlValue(v);
  if (Array.isArray(v)) return v.map(sanitize);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      out[sanitizeYamlKey(k)] = sanitize(val);
    }
    return out;
  }
  return v;
}

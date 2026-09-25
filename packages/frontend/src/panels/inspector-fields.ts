import type { FieldSchema, FieldValue } from '@scenario-studio/core';

/** false / 0 は入力済み。null の継承削除は空欄として扱う。 */
export function hasFieldContent(value: FieldValue | undefined): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some(hasFieldContent);
  return true;
}

export function fieldIsVisible(
  field: FieldSchema,
  value: FieldValue | undefined,
  revealed: ReadonlySet<string>,
): boolean {
  return (
    !field.hiddenWhenEmpty || !!field.required || hasFieldContent(value) || revealed.has(field.id)
  );
}

export function textMapEntries(value: FieldValue | undefined): readonly [string, string][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
}

/** null を残し、時代差分の shallow merge 後も削除した項目が復活しないようにする。 */
export function updateTextMap(
  value: FieldValue | undefined,
  key: string,
  text: string | null,
): FieldValue {
  const base = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { ...base, [key]: text };
}

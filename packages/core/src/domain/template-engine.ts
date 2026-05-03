import type { FieldValue, ScenarioNode } from './node.js';
import type { FieldSchema, TemplateDefinition } from './templates/index.js';

// Template に基づく field 値の検証 + デフォルト値生成。
// MVP は厳密 schema 違反を「警告として返し続ける」方針 (UI / Lint で表示)。
// hard error にしてしまうと既存プロジェクトを編集中に阻害するため、
// missing / wrong-type / out-of-range は ValidationIssue で集約。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md §2,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M2

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  fieldId: string;
  severity: ValidationSeverity;
  message: string;
}

/**
 * テンプレートに対してノードのフィールド値を検証する。
 * ノード自体の id / slug は検証対象外 (Lint 側で別ルール)。
 */
export function validateNode(
  node: ScenarioNode,
  template: TemplateDefinition,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const knownFieldIds = new Set(template.fields.map((f) => f.id));

  for (const field of template.fields) {
    const v = node.fields[field.id];
    if (v === undefined || v === null) {
      if (field.required) {
        issues.push({
          fieldId: field.id,
          severity: 'error',
          message: `Required field "${field.id}" is missing`,
        });
      }
      continue;
    }
    const issue = checkType(field, v);
    if (issue) issues.push(issue);
  }

  // 未知フィールドは warning (テンプレート schema 削除後の残骸を検出可能に)
  for (const key of Object.keys(node.fields)) {
    if (!knownFieldIds.has(key)) {
      issues.push({
        fieldId: key,
        severity: 'warning',
        message: `Field "${key}" is not declared in template "${template.id}"`,
      });
    }
  }
  return issues;
}

/**
 * テンプレートの defaultValue を集めて初期 fields マップを返す。
 * ノード新規作成時 (`createNode()`) の入力に使う。
 */
export function defaultFields(template: TemplateDefinition): { [key: string]: FieldValue } {
  const out: { [key: string]: FieldValue } = {};
  for (const field of template.fields) {
    const def = (field as { defaultValue?: FieldValue }).defaultValue;
    if (def !== undefined) out[field.id] = def;
  }
  return out;
}

function checkType(field: FieldSchema, value: FieldValue): ValidationIssue | undefined {
  switch (field.type) {
    case 'string':
    case 'multiline_string':
    case 'markdown':
    case 'media_ref':
    case 'node_ref':
      if (typeof value !== 'string') {
        return typeIssue(field, 'string', value);
      }
      if (field.type === 'string' || field.type === 'multiline_string') {
        const max = (field as { maxLength?: number }).maxLength;
        if (max !== undefined && value.length > max) {
          return {
            fieldId: field.id,
            severity: 'warning',
            message: `Field "${field.id}" exceeds maxLength ${max} (got ${value.length})`,
          };
        }
      }
      return undefined;
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return typeIssue(field, 'integer', value);
      }
      return rangeCheck(field, value);
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return typeIssue(field, 'finite number', value);
      }
      return rangeCheck(field, value);
    case 'enum':
      if (typeof value !== 'string' || !field.values.includes(value)) {
        return {
          fieldId: field.id,
          severity: 'error',
          message: `Field "${field.id}" must be one of [${field.values.join(', ')}], got ${JSON.stringify(value)}`,
        };
      }
      return undefined;
    case 'bool':
      if (typeof value !== 'boolean') {
        return typeIssue(field, 'boolean', value);
      }
      return undefined;
  }
}

function rangeCheck(
  field: { id: string; min?: number; max?: number },
  value: number,
): ValidationIssue | undefined {
  if (field.min !== undefined && value < field.min) {
    return {
      fieldId: field.id,
      severity: 'warning',
      message: `Field "${field.id}" below min ${field.min} (got ${value})`,
    };
  }
  if (field.max !== undefined && value > field.max) {
    return {
      fieldId: field.id,
      severity: 'warning',
      message: `Field "${field.id}" above max ${field.max} (got ${value})`,
    };
  }
  return undefined;
}

function typeIssue(field: { id: string }, expected: string, actual: FieldValue): ValidationIssue {
  return {
    fieldId: field.id,
    severity: 'error',
    message: `Field "${field.id}" expected ${expected}, got ${typeof actual === 'object' ? JSON.stringify(actual) : typeof actual}`,
  };
}

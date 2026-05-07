import { describe, expect, it } from 'vitest';
import { defaultFields, validateNode } from './template-engine.js';
import { CHARACTER_TEMPLATE, FACTION_TEMPLATE } from './templates/index.js';
import { nodeId } from './era.js';
import type { ScenarioNode } from './node.js';

describe('defaultFields', () => {
  it('character template defaults', () => {
    const d = defaultFields(CHARACTER_TEMPLATE);
    // gender / tone は自由入力 string になったため default は無い (undefined)
    expect(d['gender']).toBeUndefined();
    expect(d['tone']).toBeUndefined();
    // required fields without defaultValue は default に出ない
    expect(d['display_name']).toBeUndefined();
  });

  it('faction template includes bool default', () => {
    const d = defaultFields(FACTION_TEMPLATE);
    expect(d['is_active']).toBe(true);
  });
});

describe('validateNode', () => {
  function characterNode(fields: { [k: string]: import('./node.js').FieldValue }): ScenarioNode {
    return {
      id: nodeId('node.t'),
      templateId: CHARACTER_TEMPLATE.id,
      slug: 't',
      fields,
    };
  }

  it('returns no issues for a valid node', () => {
    const node = characterNode({
      display_name: '太郎',
      birth_year: -50,
      gender: 'male',
      height: 175,
      tone: 'casual',
    });
    expect(validateNode(node, CHARACTER_TEMPLATE)).toEqual([]);
  });

  it('flags missing required field', () => {
    const node = characterNode({ gender: 'male' });
    const issues = validateNode(node, CHARACTER_TEMPLATE);
    expect(issues.find((i) => i.fieldId === 'display_name')?.severity).toBe('error');
  });

  it('flags wrong type for int field', () => {
    const node = characterNode({
      display_name: '太郎',
      birth_year: 'not-a-number',
    });
    const issues = validateNode(node, CHARACTER_TEMPLATE);
    expect(issues.find((i) => i.fieldId === 'birth_year')?.severity).toBe('error');
  });

  it('flags out-of-range numeric (height min=0)', () => {
    const node = characterNode({
      display_name: '太郎',
      height: -10,
    });
    const issues = validateNode(node, CHARACTER_TEMPLATE);
    const heightIssue = issues.find((i) => i.fieldId === 'height');
    expect(heightIssue?.severity).toBe('warning');
    expect(heightIssue?.message).toContain('below min');
  });

  it('accepts custom enum-like string for gender/tone (= 自由入力)', () => {
    // gender / tone は free-input になったので、独自値を入れても error にならない
    const node = characterNode({
      display_name: '太郎',
      gender: 'alien',
      tone: '武人風',
    });
    const issues = validateNode(node, CHARACTER_TEMPLATE);
    expect(issues.find((i) => i.fieldId === 'gender')).toBeUndefined();
    expect(issues.find((i) => i.fieldId === 'tone')).toBeUndefined();
  });

  it('flags maxLength overrun on string field', () => {
    const node = characterNode({
      display_name: '太郎',
      first_person: 'verylongfirstperson', // maxLength 8
    });
    const issues = validateNode(node, CHARACTER_TEMPLATE);
    expect(issues.find((i) => i.fieldId === 'first_person')?.severity).toBe('warning');
  });

  it('flags unknown field as warning', () => {
    const node = characterNode({
      display_name: '太郎',
      ghost_field: 'no such schema',
    });
    const issues = validateNode(node, CHARACTER_TEMPLATE);
    const ghost = issues.find((i) => i.fieldId === 'ghost_field');
    expect(ghost?.severity).toBe('warning');
    expect(ghost?.message).toContain('not declared');
  });

  it('flags non-string value on string field', () => {
    const node = characterNode({
      display_name: 42 as unknown as import('./node.js').FieldValue,
    });
    const issues = validateNode(node, CHARACTER_TEMPLATE);
    expect(issues.find((i) => i.fieldId === 'display_name')?.severity).toBe('error');
  });
});

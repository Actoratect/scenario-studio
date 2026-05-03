import { describe, expect, it } from 'vitest';
import { parseYaml, serializeYaml, stringifyYaml } from './index.js';

describe('parseYaml + serializeYaml', () => {
  it('parses scalars and structures', () => {
    const { value } = parseYaml(`schemaVersion: 1
kind: node
slug: tarou
fields:
  height: 175
  inventory:
    - sword
    - cloak
`);
    expect(value).toEqual({
      schemaVersion: 1,
      kind: 'node',
      slug: 'tarou',
      fields: {
        height: 175,
        inventory: ['sword', 'cloak'],
      },
    });
  });

  it('preserves comments through round-trip when AST is reused', () => {
    const src = `# header comment
schemaVersion: 1
kind: node # inline comment on key
slug: tarou
# block comment between
fields:
  height: 175
`;
    const parsed = parseYaml(src);
    const out = serializeYaml(parsed.doc);
    expect(out).toContain('# header comment');
    expect(out).toContain('# inline comment on key');
    expect(out).toContain('# block comment between');
  });

  it('preserves multi-line literal block style (`|`)', () => {
    const src = `appearance: |
  黒髪・黒目。背丈は平均より少し高め。
  左頬に古傷がある。
`;
    const parsed = parseYaml(src);
    const out = serializeYaml(parsed.doc);
    expect(out).toContain('appearance: |');
    expect(out).toContain('  黒髪・黒目。');
  });

  it('round-trip after value update via doc.set keeps surrounding comments', () => {
    const src = `# top
schemaVersion: 1
slug: old_slug # field comment
fields:
  height: 100
`;
    const parsed = parseYaml(src);
    parsed.doc.set('slug', 'new_slug');
    const out = serializeYaml(parsed.doc);
    expect(out).toContain('# top');
    expect(out).toContain('# field comment');
    expect(out).toContain('slug: new_slug');
    expect(out).not.toContain('old_slug');
  });

  it('throws YAMLParseError on invalid input', () => {
    expect(() => parseYaml('foo: : bar')).toThrow();
  });

  it('stringifyYaml produces valid round-trippable output', () => {
    const value = {
      schemaVersion: 1,
      slug: 'tarou',
      fields: { height: 175, alive: true },
    };
    const text = stringifyYaml(value);
    const reparsed = parseYaml(text);
    expect(reparsed.value).toEqual(value);
  });

  it('multi-line strings use literal block (not fold)', () => {
    const value = {
      notes: 'line 1\nline 2\nline 3\n',
    };
    const text = stringifyYaml(value);
    expect(text).toContain('|');
    expect(text).not.toMatch(/^[^|]*>/m);
  });

  it('does not wrap long lines (lineWidth=0)', () => {
    const longLine = 'a'.repeat(200);
    const text = stringifyYaml({ description: longLine });
    expect(text).toContain(longLine);
  });
});

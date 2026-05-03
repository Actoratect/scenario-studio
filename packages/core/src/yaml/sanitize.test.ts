import { describe, expect, it } from 'vitest';
import { sanitizeYamlKey, sanitizeYamlTree, sanitizeYamlValue } from './sanitize.js';

describe('sanitizeYamlValue', () => {
  it('preserves normal text', () => {
    expect(sanitizeYamlValue('Hello, 世界!')).toBe('Hello, 世界!');
  });

  it('preserves whitespace LF/CR/TAB', () => {
    expect(sanitizeYamlValue('a\nb\rc\td')).toBe('a\nb\rc\td');
  });

  it('strips NUL', () => {
    expect(sanitizeYamlValue('hello\x00world')).toBe('helloworld');
  });

  it('strips BEL / VT / form-feed / DEL', () => {
    expect(sanitizeYamlValue('a\x07b\x0bc\x0cd\x7fe')).toBe('abcde');
  });
});

describe('sanitizeYamlKey', () => {
  it('strips newline from keys', () => {
    expect(sanitizeYamlKey('field\nname')).toBe('fieldname');
  });

  it('strips tab from keys', () => {
    expect(sanitizeYamlKey('a\tb')).toBe('ab');
  });

  it('strips NUL', () => {
    expect(sanitizeYamlKey('foo\x00bar')).toBe('foobar');
  });
});

describe('sanitizeYamlTree', () => {
  it('walks nested objects and arrays', () => {
    const dirty = {
      'name\n': 'Tarou\x00',
      tags: ['a\x00b', { who: 'b\x07b' }],
      n: 42,
      flag: true,
      nada: null,
    };
    expect(sanitizeYamlTree(dirty)).toEqual({
      name: 'Tarou',
      tags: ['ab', { who: 'bb' }],
      n: 42,
      flag: true,
      nada: null,
    });
  });

  it('returns scalars as-is', () => {
    expect(sanitizeYamlTree(42)).toBe(42);
    expect(sanitizeYamlTree(null)).toBe(null);
    expect(sanitizeYamlTree(true)).toBe(true);
  });
});

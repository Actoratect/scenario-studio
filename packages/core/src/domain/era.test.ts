import { describe, expect, it } from 'vitest';
import { buildEraIndex, CircularEraHierarchyError, eraId } from './era.js';
import type { EraDefinition } from './era.js';

describe('buildEraIndex', () => {
  it('returns ancestors from self up to root', () => {
    const idx = buildEraIndex([
      { id: eraId('world'), label: 'World' },
      { id: eraId('medieval'), label: 'Medieval', parent: eraId('world') },
      { id: eraId('medieval_late'), label: 'Late Medieval', parent: eraId('medieval') },
    ]);
    expect(idx.ancestorsOf(eraId('medieval_late'))).toEqual(['medieval_late', 'medieval', 'world']);
    expect(idx.ancestorsOf(eraId('world'))).toEqual(['world']);
  });

  it('isAncestorOf reflects hierarchy (and treats self as ancestor)', () => {
    const idx = buildEraIndex([
      { id: eraId('world'), label: 'World' },
      { id: eraId('medieval'), label: 'Medieval', parent: eraId('world') },
      { id: eraId('renaissance'), label: 'Renaissance', parent: eraId('world') },
    ]);
    expect(idx.isAncestorOf(eraId('world'), eraId('medieval'))).toBe(true);
    expect(idx.isAncestorOf(eraId('medieval'), eraId('medieval'))).toBe(true);
    expect(idx.isAncestorOf(eraId('medieval'), eraId('renaissance'))).toBe(false);
  });

  it('returns empty for unknown era', () => {
    const idx = buildEraIndex([{ id: eraId('world'), label: 'World' }]);
    expect(idx.ancestorsOf(eraId('missing'))).toEqual([]);
  });

  it('rejects duplicate era id', () => {
    expect(() =>
      buildEraIndex([
        { id: eraId('a'), label: 'A' },
        { id: eraId('a'), label: 'A2' },
      ]),
    ).toThrow(/Duplicate era id/);
  });

  it('rejects unknown parent reference', () => {
    expect(() => buildEraIndex([{ id: eraId('a'), label: 'A', parent: eraId('ghost') }])).toThrow(
      /unknown parent/,
    );
  });

  it('detects circular hierarchy', () => {
    // a → b → a (循環)
    const eras: EraDefinition[] = [
      { id: eraId('a'), label: 'A', parent: eraId('b') },
      { id: eraId('b'), label: 'B', parent: eraId('a') },
    ];
    const idx = buildEraIndex(eras);
    expect(() => idx.ancestorsOf(eraId('a'))).toThrow(CircularEraHierarchyError);
  });

  it('all() lists every registered era id', () => {
    const idx = buildEraIndex([
      { id: eraId('a'), label: 'A' },
      { id: eraId('b'), label: 'B' },
    ]);
    expect([...idx.all()].sort()).toEqual(['a', 'b']);
  });
});

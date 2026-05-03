import { describe, expect, it } from 'vitest';
import { buildEraIndex, eraId, nodeId } from './era.js';
import { mergeField, resolveNode } from './variant.js';
import type { ScenarioNode } from './node.js';

const ERAS = buildEraIndex([
  { id: eraId('world'), label: 'World' },
  { id: eraId('era.young'), label: 'Young', parent: eraId('world') },
  { id: eraId('era.elder'), label: 'Elder', parent: eraId('world') },
  { id: eraId('era.medieval'), label: 'Medieval', parent: eraId('world') },
  { id: eraId('era.medieval_late'), label: 'Late Medieval', parent: eraId('era.medieval') },
]);

const tarou: ScenarioNode = {
  id: nodeId('node.tarou'),
  templateId: 'character',
  slug: 'tarou',
  thumbnail: 'media/characters/tarou_default.png',
  isAlive: true,
  fields: {
    full_name: 'Tarou',
    height: 175,
    hair_color: 'black',
    inventory: ['sword', 'cloak'],
    speech: { tone: 'casual', first_person: 'ore' },
  },
  variants: [
    {
      eraId: eraId('era.young'),
      thumbnailOverride: 'media/characters/tarou_young.png',
      fieldsOverride: { hair_color: 'brown', height: 165 },
    },
    {
      eraId: eraId('era.elder'),
      thumbnailOverride: 'media/characters/tarou_old.png',
      fieldsOverride: {
        hair_color: 'white',
        inventory: ['cane'],
        speech: { tone: 'reserved' },
      },
      isAlive: false,
    },
  ],
};

describe('resolveNode', () => {
  it('returns base when no variant matches the target era', () => {
    const r = resolveNode(tarou, eraId('era.medieval'), ERAS);
    expect(r.fields['hair_color']).toBe('black');
    expect(r.fields['height']).toBe(175);
    expect(r.thumbnail).toBe('media/characters/tarou_default.png');
    expect(r.isAlive).toBe(true);
    expect(r.appliedVariantEras).toEqual([]);
  });

  it('applies single matching variant (scalar overwrite)', () => {
    const r = resolveNode(tarou, eraId('era.young'), ERAS);
    expect(r.fields['hair_color']).toBe('brown');
    expect(r.fields['height']).toBe(165);
    expect(r.thumbnail).toBe('media/characters/tarou_young.png');
    expect(r.appliedVariantEras).toEqual(['era.young']);
  });

  it('preserves base fields not present in the override', () => {
    const r = resolveNode(tarou, eraId('era.young'), ERAS);
    expect(r.fields['full_name']).toBe('Tarou');
  });

  it('replaces arrays entirely (not merge)', () => {
    const r = resolveNode(tarou, eraId('era.elder'), ERAS);
    expect(r.fields['inventory']).toEqual(['cane']);
  });

  it('shallow-merges record-typed fields', () => {
    const r = resolveNode(tarou, eraId('era.elder'), ERAS);
    expect(r.fields['speech']).toEqual({ tone: 'reserved', first_person: 'ore' });
  });

  it('isAlive=false from variant overrides base true', () => {
    const r = resolveNode(tarou, eraId('era.elder'), ERAS);
    expect(r.isAlive).toBe(false);
  });

  it('isAlive=null in variant means inherit (PoC-E semantics)', () => {
    const node: ScenarioNode = {
      ...tarou,
      variants: [
        {
          eraId: eraId('era.young'),
          isAlive: null,
        },
      ],
    };
    const r = resolveNode(node, eraId('era.young'), ERAS);
    expect(r.isAlive).toBe(true); // base が引き継がれる
  });

  it('inherits parent-era variant when target is a child era', () => {
    const node: ScenarioNode = {
      id: nodeId('node.castle'),
      templateId: 'location',
      slug: 'castle',
      fields: { state: 'standing' },
      variants: [
        // Medieval にしか variant が無いが、Late Medieval から見ても継承される想定
        { eraId: eraId('era.medieval'), fieldsOverride: { state: 'fortified' } },
      ],
    };
    const r = resolveNode(node, eraId('era.medieval_late'), ERAS);
    expect(r.fields['state']).toBe('fortified');
    expect(r.appliedVariantEras).toEqual(['era.medieval']);
  });

  it('most-specific variant wins when both ancestor and target have one', () => {
    const node: ScenarioNode = {
      id: nodeId('node.castle'),
      templateId: 'location',
      slug: 'castle',
      fields: { state: 'standing' },
      variants: [
        { eraId: eraId('era.medieval'), fieldsOverride: { state: 'fortified' } },
        { eraId: eraId('era.medieval_late'), fieldsOverride: { state: 'in_decline' } },
      ],
    };
    const r = resolveNode(node, eraId('era.medieval_late'), ERAS);
    expect(r.fields['state']).toBe('in_decline');
    // general → specific の順で適用された記録
    expect(r.appliedVariantEras).toEqual(['era.medieval', 'era.medieval_late']);
  });

  it('ignores variants for unrelated era branches', () => {
    // target=era.young のとき、era.elder の variant は適用されない
    const r = resolveNode(tarou, eraId('era.young'), ERAS);
    expect(r.appliedVariantEras).toEqual(['era.young']);
    expect(r.fields['inventory']).toEqual(['sword', 'cloak']); // elder の inventory は適用されない
  });

  it('returns base when target era is unknown', () => {
    const r = resolveNode(tarou, eraId('era.unknown'), ERAS);
    expect(r.fields['hair_color']).toBe('black');
    expect(r.appliedVariantEras).toEqual([]);
  });
});

describe('mergeField', () => {
  it('replaces array values entirely', () => {
    expect(mergeField(['a', 'b'], ['c'])).toEqual(['c']);
  });

  it('shallow-merges records', () => {
    expect(mergeField({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('replaces scalars', () => {
    expect(mergeField('x', 'y')).toBe('y');
    expect(mergeField(1, 2)).toBe(2);
  });

  it('replaces when types differ (array → scalar)', () => {
    expect(mergeField(['x'], 'y')).toBe('y');
  });

  it('replaces when types differ (scalar → record)', () => {
    expect(mergeField('x', { a: 1 })).toEqual({ a: 1 });
  });
});

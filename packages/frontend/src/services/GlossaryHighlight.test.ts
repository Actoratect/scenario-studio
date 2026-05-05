import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '@scenario-studio/core';
import { scanGlossary } from './GlossaryHighlight';

const TERMS: readonly GlossaryTerm[] = [
  { term: 'クラウド', aliases: ['Cloud'], forbidden: ['くらうど'] },
  { term: 'バレット', aliases: ['Barret'], forbidden: ['バレッド'] },
];

describe('scanGlossary', () => {
  it('detects ok terms (term + aliases) case-insensitively', () => {
    const r = scanGlossary('cloud と バレット が出会う', TERMS);
    expect([...r.okTerms].sort()).toEqual(['クラウド', 'バレット']);
    expect(r.violations).toEqual([]);
  });

  it('detects forbidden as warning', () => {
    const r = scanGlossary('くらうど と バレッド', TERMS);
    expect(r.okTerms).toEqual([]);
    expect(r.violations).toHaveLength(2);
    expect(r.violations.map((v) => v.term).sort()).toEqual(['クラウド', 'バレット']);
  });

  it('returns empty for empty text', () => {
    expect(scanGlossary('', TERMS).hits).toEqual([]);
  });

  it('returns empty when glossary is empty', () => {
    expect(scanGlossary('クラウド', []).hits).toEqual([]);
  });

  it('counts repeated occurrences in hits but unique-ifies okTerms', () => {
    const r = scanGlossary('クラウド クラウド', TERMS);
    expect(r.hits.length).toBe(2);
    expect(r.okTerms).toEqual(['クラウド']);
  });
});

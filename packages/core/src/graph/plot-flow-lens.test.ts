import { describe, expect, it } from 'vitest';
import { computePlotFlowLens } from './plot-flow-lens.js';
import { chapterId, sceneId, type Chapter } from '../domain/scenario.js';
import type { ScriptScene } from '../lint/types.js';

function ch(slug: string, scenes: { slug: string; title: string }[]): Chapter {
  return {
    id: chapterId(`chapter.${slug}`),
    slug,
    title: slug,
    scenes: scenes.map((s) => ({
      id: sceneId(`scene.${s.slug}`),
      slug: s.slug,
      title: s.title,
      relativePath: `${s.slug}.scn.yaml`,
    })),
  };
}

describe('computePlotFlowLens', () => {
  it('builds implicit next edges between scenes in a chapter', () => {
    const chapters = [
      ch('ch01', [
        { slug: 's01', title: 'Opening' },
        { slug: 's02', title: 'Middle' },
        { slug: 's03', title: 'End' },
      ]),
    ];
    const scenes: ScriptScene[] = [
      { chapterSlug: 'ch01', sceneSlug: 's01', label: 'ch01/s01', blocks: [] },
      { chapterSlug: 'ch01', sceneSlug: 's02', label: 'ch01/s02', blocks: [] },
      { chapterSlug: 'ch01', sceneSlug: 's03', label: 'ch01/s03', blocks: [] },
    ];
    const result = computePlotFlowLens({ chapters, scenes });
    expect(result.payload.nodes.length).toBe(3);
    // 2 implicit edges (s01->s02, s02->s03)
    const implicitEdges = result.payload.edges.filter((e) => e.kind === 'implicit');
    expect(implicitEdges.length).toBe(2);
    expect(result.unreachable.length).toBe(0);
  });

  it('parses choice goto into explicit edges', () => {
    const chapters = [
      ch('ch01', [
        { slug: 'fork', title: 'Fork' },
        { slug: 'a', title: 'Path A' },
        { slug: 'b', title: 'Path B' },
      ]),
    ];
    const scenes: ScriptScene[] = [
      {
        chapterSlug: 'ch01',
        sceneSlug: 'fork',
        label: 'ch01/fork',
        blocks: [
          {
            kind: 'choice',
            prompt: 'どっち?',
            options: [
              { text: '左', then: 'scene.a' },
              { text: '右', then: 'ch01/b' },
            ],
          },
        ],
      },
      { chapterSlug: 'ch01', sceneSlug: 'a', label: 'ch01/a', blocks: [] },
      { chapterSlug: 'ch01', sceneSlug: 'b', label: 'ch01/b', blocks: [] },
    ];
    const result = computePlotFlowLens({ chapters, scenes });
    const explicit = result.payload.edges.filter((e) => e.kind === 'explicit');
    expect(explicit.length).toBe(2);
    expect(explicit.map((e) => e.label).sort()).toEqual(['右', '左']);
    expect(result.unresolvedTransitions.length).toBe(0);
  });

  it('records unresolved transitions when choice goto target is unknown', () => {
    const chapters = [ch('ch01', [{ slug: 's01', title: 'Only' }])];
    const scenes: ScriptScene[] = [
      {
        chapterSlug: 'ch01',
        sceneSlug: 's01',
        label: 'ch01/s01',
        blocks: [
          {
            kind: 'choice',
            prompt: 'どこへ?',
            options: [{ text: '不明', then: 'scene.does_not_exist' }],
          },
        ],
      },
    ];
    const result = computePlotFlowLens({ chapters, scenes });
    expect(result.unresolvedTransitions.length).toBe(1);
    expect(result.unresolvedTransitions[0]?.targetText).toBe('scene.does_not_exist');
  });

  it('identifies unreachable scenes (no in-edge except chapter 0)', () => {
    const chapters = [
      ch('ch01', [
        { slug: 's01', title: 'Opening' },
        { slug: 's02', title: 'Middle' },
      ]),
      ch('ch02', [
        { slug: 's01', title: 'Disconnected' }, // 章間の暗黙 next は無いので unreachable
      ]),
    ];
    const scenes: ScriptScene[] = [
      { chapterSlug: 'ch01', sceneSlug: 's01', label: 'ch01/s01', blocks: [] },
      { chapterSlug: 'ch01', sceneSlug: 's02', label: 'ch01/s02', blocks: [] },
      { chapterSlug: 'ch02', sceneSlug: 's01', label: 'ch02/s01', blocks: [] },
    ];
    const result = computePlotFlowLens({ chapters, scenes });
    // ch02/s01 は unreachable (in-edge 0 + 最初ではない)
    expect(result.unreachable.length).toBe(1);
    expect(result.unreachable[0]).toContain('ch02.s01');
  });
});

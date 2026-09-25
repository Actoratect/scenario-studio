import { describe, expect, it } from 'vitest';
import { computePlotFlowLens, plotFlowRowLayout } from './plot-flow-lens.js';
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
    // 暗黙 next のラベルは既定で空 (P1: 「次へ」の並びはノイズだったため廃止)
    expect(implicitEdges.every((e) => e.label === '')).toBe(true);
    expect(result.unreachable.length).toBe(0);
  });

  it('plotFlowRowLayout places each chapter on its own row, scenes left-to-right', () => {
    const chapters = [
      ch('ch01', [
        { slug: 's01', title: 'A' },
        { slug: 's02', title: 'B' },
      ]),
      ch('ch02', [{ slug: 's01', title: 'C' }]),
    ];
    const layout = plotFlowRowLayout(chapters, { originX: 0, originY: 0, xGap: 100, yGap: 200 });
    expect(layout.get('plot.ch01.s01' as never)).toEqual({ x: 0, y: 0 });
    expect(layout.get('plot.ch01.s02' as never)).toEqual({ x: 100, y: 0 });
    expect(layout.get('plot.ch02.s01' as never)).toEqual({ x: 0, y: 200 });
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

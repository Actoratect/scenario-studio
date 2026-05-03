import { describe, expect, it } from 'vitest';
import { deterministicCircularLayout } from './layout.js';
import type { LensPayload } from './relationship-lens.js';
import { nodeId } from '../domain/era.js';

function payload(...nodes: Array<{ id: string; templateId: string; label?: string }>): LensPayload {
  return {
    nodes: nodes.map((n) => ({
      id: nodeId(n.id),
      templateId: n.templateId,
      label: n.label ?? n.id,
    })),
    edges: [],
  };
}

describe('deterministicCircularLayout', () => {
  it('returns a position for each node', () => {
    const p = payload(
      { id: 'a', templateId: 'template.character' },
      { id: 'b', templateId: 'template.character' },
      { id: 'c', templateId: 'template.faction' },
    );
    const positions = deterministicCircularLayout(p);
    expect(positions.size).toBe(3);
  });

  it('places same-template nodes on the same radius', () => {
    const p = payload(
      { id: 'a', templateId: 'template.character' },
      { id: 'b', templateId: 'template.character' },
      { id: 'c', templateId: 'template.character' },
    );
    const positions = deterministicCircularLayout(p, {
      centerX: 0,
      centerY: 0,
      radius: 100,
    });
    for (const pos of positions.values()) {
      const r = Math.hypot(pos.x, pos.y);
      expect(r).toBeCloseTo(100, 5);
    }
  });

  it('puts different templates on different radii (templateOffset)', () => {
    const p = payload(
      { id: 'a', templateId: 'template.character' },
      { id: 'b', templateId: 'template.faction' },
    );
    const positions = deterministicCircularLayout(p, {
      centerX: 0,
      centerY: 0,
      radius: 100,
      templateOffset: 50,
    });
    const ra = Math.hypot(positions.get(nodeId('a'))!.x, positions.get(nodeId('a'))!.y);
    const rb = Math.hypot(positions.get(nodeId('b'))!.x, positions.get(nodeId('b'))!.y);
    expect(ra).toBeCloseTo(100, 5);
    expect(rb).toBeCloseTo(150, 5);
  });

  it('is deterministic — same input → same output', () => {
    const p = payload(
      { id: 'a', templateId: 'template.character' },
      { id: 'b', templateId: 'template.character' },
      { id: 'c', templateId: 'template.faction' },
    );
    const a = deterministicCircularLayout(p);
    const b = deterministicCircularLayout(p);
    expect(Array.from(a.entries())).toEqual(Array.from(b.entries()));
  });

  it('handles empty payload without error', () => {
    const p: LensPayload = { nodes: [], edges: [] };
    const positions = deterministicCircularLayout(p);
    expect(positions.size).toBe(0);
  });
});

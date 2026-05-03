import { describe, expect, it } from 'vitest';
import { computeRelationshipLens } from './relationship-lens.js';
import {
  CHARACTER_TEMPLATE,
  FACTION_TEMPLATE,
  TemplateRegistry,
} from '../domain/templates/index.js';
import { createNode } from '../domain/NodeRepository.js';
import type { ScenarioNode } from '../domain/node.js';
import type { NodeId } from '../domain/era.js';

function nodeMap(nodes: ScenarioNode[]): ReadonlyMap<NodeId, ScenarioNode> {
  const m = new Map<NodeId, ScenarioNode>();
  for (const n of nodes) m.set(n.id, n);
  return m;
}

describe('computeRelationshipLens', () => {
  it('returns lens nodes labeled by display_name', () => {
    const tmpl = new TemplateRegistry();
    const t = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'tarou',
      fields: { display_name: '太郎' },
    });
    const lens = computeRelationshipLens(nodeMap([t]), tmpl);
    expect(lens.nodes.length).toBe(1);
    expect(lens.nodes[0]!.label).toBe('太郎');
    expect(lens.edges).toEqual([]);
  });

  it('falls back to slug when no display name', () => {
    const tmpl = new TemplateRegistry();
    const t = createNode(tmpl, { templateId: CHARACTER_TEMPLATE.id, slug: 'no_name' });
    const lens = computeRelationshipLens(nodeMap([t]), tmpl);
    expect(lens.nodes[0]!.label).toBe('no_name');
  });

  it('infers edges from node_ref fields when target exists', () => {
    const tmpl = new TemplateRegistry();
    const fac = createNode(tmpl, {
      templateId: FACTION_TEMPLATE.id,
      slug: 'red_circle',
      fields: { display_name: '赤の輪' },
    });
    const tarou = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'tarou',
      fields: { display_name: '太郎', faction: fac.id },
    });
    const lens = computeRelationshipLens(nodeMap([tarou, fac]), tmpl);
    expect(lens.edges.length).toBe(1);
    expect(lens.edges[0]!.source).toBe(tarou.id);
    expect(lens.edges[0]!.target).toBe(fac.id);
    expect(lens.edges[0]!.label).toBe('faction');
    expect(lens.edges[0]!.kind).toBe('implicit');
    expect(lens.edges[0]!.id).toContain('faction');
  });

  it('skips orphan node_ref (target not in nodes map)', () => {
    const tmpl = new TemplateRegistry();
    const tarou = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'tarou',
      fields: { display_name: '太郎', faction: 'node.ghost' },
    });
    const lens = computeRelationshipLens(nodeMap([tarou]), tmpl);
    expect(lens.edges).toEqual([]); // orphan は edge に出ない (Lint で別途警告)
  });

  it('skips node_ref with empty/non-string value', () => {
    const tmpl = new TemplateRegistry();
    const tarou = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'tarou',
      fields: { display_name: '太郎', faction: '' },
    });
    const lens = computeRelationshipLens(nodeMap([tarou]), tmpl);
    expect(lens.edges).toEqual([]);
  });

  it('emits multiple edges for multiple node_ref fields on same node', () => {
    const tmpl = new TemplateRegistry();
    const fac = createNode(tmpl, {
      templateId: FACTION_TEMPLATE.id,
      slug: 'red',
      fields: { display_name: '赤' },
    });
    const tarou = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'tarou',
      fields: { display_name: '太郎', faction: fac.id },
    });
    // Faction にも leader: node_ref があるのでこれが 2 本目の edge になる
    const facWithLeader = { ...fac, fields: { ...fac.fields, leader: tarou.id } };
    const lens = computeRelationshipLens(nodeMap([tarou, facWithLeader]), tmpl);
    expect(lens.edges.length).toBe(2);
    const fields = lens.edges.map((e) => e.label).sort();
    expect(fields).toEqual(['faction', 'leader']);
  });

  it('merges explicit Relation entities with type label (PR-E)', () => {
    const tmpl = new TemplateRegistry();
    const a = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'a',
      fields: { display_name: 'A' },
    });
    const b = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'b',
      fields: { display_name: 'B' },
    });
    const lens = computeRelationshipLens(nodeMap([a, b]), tmpl, [
      {
        id: 'rel.x' as never,
        source: a.id,
        target: b.id,
        type: 'friend',
      },
    ]);
    expect(lens.edges.length).toBe(1);
    expect(lens.edges[0]!.kind).toBe('explicit');
    expect(lens.edges[0]!.label).toBe('友人'); // RELATION_TYPES.friend.label
    expect(lens.edges[0]!.relationType).toBe('friend');
  });

  it('explicit Relation custom label overrides type label', () => {
    const tmpl = new TemplateRegistry();
    const a = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'a',
      fields: { display_name: 'A' },
    });
    const b = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'b',
      fields: { display_name: 'B' },
    });
    const lens = computeRelationshipLens(nodeMap([a, b]), tmpl, [
      {
        id: 'rel.x' as never,
        source: a.id,
        target: b.id,
        type: 'friend',
        label: '幼馴染',
      },
    ]);
    expect(lens.edges[0]!.label).toBe('幼馴染');
  });
});

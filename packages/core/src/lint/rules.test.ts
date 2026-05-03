import { describe, expect, it } from 'vitest';
import { LintEngine } from './types.js';
import { BUILTIN_LINT_RULES } from './rules.js';
import {
  CHARACTER_TEMPLATE,
  FACTION_TEMPLATE,
  TemplateRegistry,
} from '../domain/templates/index.js';
import { createNode } from '../domain/NodeRepository.js';
import type { ScenarioNode } from '../domain/node.js';
import type { NodeId } from '../domain/era.js';

function ctxFor(nodes: ScenarioNode[]): {
  nodes: Map<NodeId, ScenarioNode>;
  templates: TemplateRegistry;
} {
  const m = new Map<NodeId, ScenarioNode>();
  for (const n of nodes) m.set(n.id, n);
  return { nodes: m, templates: new TemplateRegistry() };
}

describe('BUILTIN_LINT_RULES', () => {
  const engine = new LintEngine(BUILTIN_LINT_RULES);

  it('relation-target-exists fires when node_ref points to missing id', () => {
    const tmpl = new TemplateRegistry();
    const t = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'tarou',
      fields: { display_name: '太郎', faction: 'node.ghost' },
    });
    const issues = engine.run(ctxFor([t]));
    expect(issues.find((i) => i.ruleId === 'relation-target-exists')?.severity).toBe('error');
  });

  it('relation-target-exists OK when target exists', () => {
    const tmpl = new TemplateRegistry();
    const f = createNode(tmpl, {
      templateId: FACTION_TEMPLATE.id,
      slug: 'red',
      fields: { display_name: '赤' },
    });
    const t = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'tarou',
      fields: { display_name: '太郎', faction: f.id },
    });
    const issues = engine.run(ctxFor([t, f]));
    expect(issues.find((i) => i.ruleId === 'relation-target-exists')).toBeUndefined();
  });

  it('orphan-node info fires when no one references the node', () => {
    const tmpl = new TemplateRegistry();
    const lonely = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'lonely',
      fields: { display_name: '孤独' },
    });
    const issues = engine.run(ctxFor([lonely]));
    expect(issues.find((i) => i.ruleId === 'orphan-node')?.severity).toBe('info');
  });

  it('required-field-missing fires when display_name is absent', () => {
    const tmpl = new TemplateRegistry();
    const t = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'no_name',
      // display_name は required だが空
    });
    const issues = engine.run(ctxFor([t]));
    expect(
      issues.find((i) => i.ruleId === 'required-field-missing' && i.fieldId === 'display_name')
        ?.severity,
    ).toBe('error');
  });

  it('duplicate-slug fires within same template', () => {
    const tmpl = new TemplateRegistry();
    const a = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'dup',
      fields: { display_name: 'A' },
    });
    const b = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'dup',
      fields: { display_name: 'B' },
    });
    const issues = engine.run(ctxFor([a, b]));
    expect(issues.find((i) => i.ruleId === 'duplicate-slug')?.severity).toBe('error');
  });

  it('circular-relation detects faction self-reference (degenerate but cheap)', () => {
    const tmpl = new TemplateRegistry();
    // faction.leader が自分自身を指す → 1 hop で循環
    const f = createNode(tmpl, {
      templateId: FACTION_TEMPLATE.id,
      slug: 'self_led',
      fields: { display_name: '自家中毒', leader: 'placeholder' },
    });
    // leader を自身の id に書換える
    const fSelf = { ...f, fields: { ...f.fields, leader: f.id } };
    const issues = engine.run(ctxFor([fSelf]));
    expect(issues.find((i) => i.ruleId === 'circular-relation')?.severity).toBe('warning');
  });

  it('engine isolates a throwing rule and emits a synthetic issue', () => {
    const broken = {
      id: 'broken',
      description: 'always throws',
      defaultSeverity: 'error' as const,
      check: () => {
        throw new Error('boom');
      },
    };
    const e = new LintEngine([broken]);
    const issues = e.run(ctxFor([]));
    expect(issues[0]?.message).toContain('boom');
  });

  it('engine reports no issues for a valid project', () => {
    const tmpl = new TemplateRegistry();
    const f = createNode(tmpl, {
      templateId: FACTION_TEMPLATE.id,
      slug: 'red',
      fields: { display_name: '赤' },
    });
    const t = createNode(tmpl, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'tarou',
      fields: { display_name: '太郎', faction: f.id },
    });
    const issues = engine.run(ctxFor([t, f]));
    // orphan-node は出るが error は無いはず
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

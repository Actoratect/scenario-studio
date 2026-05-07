import { describe, expect, it, beforeEach } from 'vitest';
import type { GlossaryTerm, ProjectModel, ScenarioNode } from '@scenario-studio/core';
import { AiPatchQueue } from './AiPatchQueue';
import { scanGlossaryFixes } from './GlossaryPatchScanner';

// PR-AY: scanner unit tests
// AiPatchQueue は singleton state を持つので、各テスト前に clearAll() で初期化する。

function makeNode(id: string, fields: Record<string, unknown>): ScenarioNode {
  return {
    id: id as unknown as ScenarioNode['id'],
    templateId: 'template.character',
    slug: id,
    fields: fields as ScenarioNode['fields'],
  };
}

function makeProject(nodes: ScenarioNode[], glossary: GlossaryTerm[]): ProjectModel {
  // scanner は project.nodes と project.glossary しか触らないので、
  // 残りは test 用の最小スタブで unknown 経由で組み立てる。
  return {
    settings: { name: 'test' },
    nodes: new Map(nodes.map((n) => [n.id, n])),
    eras: [],
    relations: [],
    glossary,
    scenario: { projectSynopsis: '', chapters: [] },
  } as unknown as ProjectModel;
}

describe('scanGlossaryFixes', () => {
  beforeEach(() => {
    AiPatchQueue.clearAll();
  });

  it('禁止別表記を含む string field に patch を提案する', () => {
    const project = makeProject(
      [
        makeNode('n1', {
          display_name: 'アクトラの社員',
          description: '所属: アクトラ',
        }),
      ],
      [
        {
          term: 'アクトラテクト',
          aliases: [],
          forbidden: ['アクトラ'],
        },
      ],
    );
    const result = scanGlossaryFixes(project);
    expect(result.proposedCount).toBe(2);
    expect(AiPatchQueue.pendingCount()).toBe(2);
    const patches = AiPatchQueue.pending();
    expect(patches.every((p) => p.source === 'glossary-fix')).toBe(true);
    expect(patches[0]?.after).toContain('アクトラテクト');
  });

  it('forbidden が空の glossary entry を無視する', () => {
    const project = makeProject(
      [makeNode('n1', { description: '何でもよい' })],
      [{ term: 'アクトラテクト', aliases: [], forbidden: [] }],
    );
    const result = scanGlossaryFixes(project);
    expect(result.proposedCount).toBe(0);
  });

  it('1 文字の forbidden は対象外 (誤検知防止)', () => {
    const project = makeProject(
      [makeNode('n1', { description: 'AI と話した' })],
      [{ term: '人工知能', aliases: [], forbidden: ['A'] }],
    );
    const result = scanGlossaryFixes(project);
    expect(result.proposedCount).toBe(0);
  });

  it('正式 term と一致する forbidden は無視 (= no-op を提案しない)', () => {
    const project = makeProject(
      [makeNode('n1', { description: 'これは アクトラテクト の話' })],
      [{ term: 'アクトラテクト', aliases: [], forbidden: ['アクトラテクト'] }],
    );
    const result = scanGlossaryFixes(project);
    expect(result.proposedCount).toBe(0);
  });

  it('同一 (node, field, after) の二重 enqueue は dedupe される', () => {
    const project = makeProject(
      [makeNode('n1', { description: 'アクトラ' })],
      [{ term: 'アクトラテクト', aliases: [], forbidden: ['アクトラ'] }],
    );
    scanGlossaryFixes(project);
    const before = AiPatchQueue.pendingCount();
    scanGlossaryFixes(project);
    expect(AiPatchQueue.pendingCount()).toBe(before);
  });

  it('複数の forbidden が同時に当たった時、要約に件数が出る', () => {
    const project = makeProject(
      [makeNode('n1', { description: 'アクトラ と Actra と actoratect' })],
      [
        {
          term: 'アクトラテクト',
          aliases: [],
          forbidden: ['アクトラ', 'Actra', 'actoratect'],
        },
      ],
    );
    scanGlossaryFixes(project);
    const patches = AiPatchQueue.pending();
    expect(patches).toHaveLength(1);
    expect(patches[0]?.summary).toContain('他');
    expect(patches[0]?.after).not.toContain('アクトラ ');
    expect(patches[0]?.after).not.toContain('Actra');
    expect(patches[0]?.after).not.toContain('actoratect');
  });

  it('reject() で patch を queue から除外せず status を rejected にする', () => {
    const project = makeProject(
      [makeNode('n1', { description: 'アクトラ' })],
      [{ term: 'アクトラテクト', aliases: [], forbidden: ['アクトラ'] }],
    );
    scanGlossaryFixes(project);
    const patch = AiPatchQueue.pending()[0];
    expect(patch).toBeDefined();
    AiPatchQueue.reject(patch!.id);
    expect(AiPatchQueue.pendingCount()).toBe(0);
    expect(AiPatchQueue.all()).toHaveLength(1);
    expect(AiPatchQueue.all()[0]?.status).toBe('rejected');
  });
});

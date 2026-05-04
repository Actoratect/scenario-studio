import { describe, expect, it } from 'vitest';
import { buildCharacterLookups, exportScene } from './scene.js';
import { CHARACTER_TEMPLATE } from '../domain/templates/index.js';
import { nodeId, type NodeId } from '../domain/era.js';
import type { ScenarioNode } from '../domain/node.js';

const SCENE_YAML = `schemaVersion: 1
sceneId: scene.test
plot:
  title: テストシーン
  cast: []
script:
  - { kind: stage, text: "夜の街" }
  - { kind: line, who: cloud, emotion: calm, text: "..." }
  - { kind: line, who: barret, emotion: angry, text: "おい!" }
  - { kind: aside, text: "心の声" }
  - { kind: sfx, name: thunder }
  - { kind: bgm, cue: bgm_tense }
  - { kind: choice, prompt: どうする? }
`;

function makeChar(slug: string, devName: string, displayName: string): ScenarioNode {
  return {
    id: nodeId(`node.${slug}`),
    templateId: CHARACTER_TEMPLATE.id,
    slug,
    fields: { display_name: displayName, dev_name: devName },
  };
}

describe('exportScene', () => {
  const nodes = new Map<NodeId, ScenarioNode>();
  const cloud = makeChar('cloud', 'Cloud', 'クラウド');
  const barret = makeChar('barret', 'Barret', 'バレット');
  nodes.set(cloud.id, cloud);
  nodes.set(barret.id, barret);
  const lookups = buildCharacterLookups(nodes);

  it('text: タイトル + 各 kind を整形して返す', () => {
    const out = exportScene('text', {
      sceneYaml: SCENE_YAML,
      charactersBySlug: lookups.bySlug,
      charactersByDevName: lookups.byDevName,
    });
    expect(out).toContain('=== テストシーン ===');
    expect(out).toContain('[ステージ] 夜の街');
    expect(out).toContain('クラウド (calm): ...');
    expect(out).toContain('バレット (angry): おい!');
    expect(out).toContain('(独白) 心の声');
    expect(out).toContain('[SFX: thunder]');
    expect(out).toContain('[BGM: bgm_tense]');
    expect(out).toContain('[選択肢] どうする?');
  });

  it('markdown: speaker は **太字**、stage は引用、aside も引用 + (独白)', () => {
    const out = exportScene('markdown', {
      sceneYaml: SCENE_YAML,
      charactersBySlug: lookups.bySlug,
    });
    expect(out).toContain('## テストシーン');
    expect(out).toContain('> 夜の街');
    expect(out).toContain('**クラウド** *(calm)*: ...');
    expect(out).toContain('**バレット** *(angry)*: おい!');
    expect(out).toContain('> *(独白)* 心の声');
    expect(out).toContain('`SFX: thunder`');
  });

  it('未解決 who は dev_name / slug をそのまま出す', () => {
    const yaml = `script:
  - { kind: line, who: unknown_char, text: "..." }
`;
    const out = exportScene('text', { sceneYaml: yaml });
    expect(out).toContain('unknown_char: ...');
  });

  it('dev_name で解決できる (cast 表示は internal な dev_name で書かれる前提)', () => {
    const yaml = `script:
  - { kind: line, who: Cloud, text: "test" }
`;
    const out = exportScene('text', {
      sceneYaml: yaml,
      charactersByDevName: lookups.byDevName,
    });
    expect(out).toContain('クラウド: test');
  });

  it('includeTitle: false でタイトルを出さない', () => {
    const out = exportScene('markdown', {
      sceneYaml: SCENE_YAML,
      includeTitle: false,
    });
    expect(out).not.toContain('## テストシーン');
  });
});

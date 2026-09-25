import { describe, expect, it } from 'vitest';
import { InMemoryFileSystemAdapter } from '../testing/InMemoryFileSystemAdapter.js';
import { NodeFieldStore } from '../history/NodeFieldStore.js';
import { createNode, FsNodeRepository } from './NodeRepository.js';
import { CHARACTER_TEMPLATE, TemplateRegistry } from './templates/index.js';
import { validateNode } from './template-engine.js';
import { buildEraIndex, eraId } from './era.js';
import { resolveNode } from './variant.js';

describe('キャラクターの詳細情報と台詞', () => {
  it('詳細・相手別の複数行台詞を保存して再読込でき、時代の削除指定も保持する', async () => {
    const adapter = new InMemoryFileSystemAdapter();
    const handle = adapter.register('character-details');
    const templates = new TemplateRegistry();
    const repo = new FsNodeRepository(adapter, handle, templates);
    const later = eraId('era.later');
    const node = createNode(templates, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'hiyori',
      fields: {
        display_name: '朝倉 ひより',
        dev_name: 'hiyori',
        short_name: 'ひより',
        reading: 'あさくら ひより',
        school_year: '1',
        gender: '女子',
        club: '放送部',
        personality: '明るい',
        first_person: 'うち',
        enemy_name: 'オバケ',
        spawn_location: '最初から部室にいる',
        skin_color: '#f1d3b8',
        hair_color: '#6a4630',
        hair_style: 'twin',
        outfit: '',
        ribbon: '',
        holding_doll: true,
        pale: false,
        tagline: '沈黙が苦手な実況者',
        profile: '放送部の一年生。',
        background: '機材一式を抱えて参加した。',
        secret: '静かになると怖い。',
        secret_flag: 'sec_hiyori',
        dialogue_by_scene: {
          先頭になった時: 'うちが先頭？\nよーし、実況しながら行くよー！',
          自由な場面: '録音、まだ回ってる。',
        },
        dialogue_on_ally_down: { 'node.akari': '灯先輩……？\n返事してよ……！' },
      },
      variants: [{ eraId: later, fieldsOverride: { dialogue_by_scene: { 先頭になった時: null } } }],
    });
    expect(validateNode(node, CHARACTER_TEMPLATE)).toEqual([]);
    await repo.save(node);
    const loaded = (await repo.loadAll()).get(node.id)!;
    expect(loaded.fields).toEqual(node.fields);
    const resolved = resolveNode(loaded, later, buildEraIndex([{ id: later, label: '後日' }]));
    expect(resolved.fields['dialogue_by_scene']).toEqual({
      先頭になった時: null,
      自由な場面: '録音、まだ回ってる。',
    });
    expect(loaded.fields['dialogue_by_scene']).toEqual(node.fields['dialogue_by_scene']);
  });

  it('台詞mapの追加・編集・削除を通常のUndo/Redoで復元できる', () => {
    const original = { 待機: 'ねえ、誰か喋って？' };
    const store = new NodeFieldStore({ dialogue_by_scene: original });
    store.set('dialogue_by_scene', { ...original, 攻撃: 'そこだ！' });
    store.markUndoBoundary();
    store.set('dialogue_by_scene', { 待機: null, 攻撃: 'そこだ！' });
    expect(store.undo()).toBe(true);
    expect(store.get('dialogue_by_scene')).toEqual({ ...original, 攻撃: 'そこだ！' });
    expect(store.undo()).toBe(true);
    expect(store.get('dialogue_by_scene')).toEqual(original);
    expect(store.redo()).toBe(true);
    expect(store.get('dialogue_by_scene')).toEqual({ ...original, 攻撃: 'そこだ！' });
    store.destroy();
  });

  it('生存状態と時代別の画像・null継承を保存しても消失させない', async () => {
    const adapter = new InMemoryFileSystemAdapter();
    const handle = adapter.register('character-variants');
    const templates = new TemplateRegistry();
    const repo = new FsNodeRepository(adapter, handle, templates);
    const base = createNode(templates, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'variant',
      fields: { display_name: '時代差分' },
      variants: [
        {
          eraId: eraId('era.past'),
          isAlive: false,
          thumbnailOverride: 'Media/past.png',
          fieldsOverride: { profile: '昔のプロフィール' },
        },
        { eraId: eraId('era.future'), isAlive: null, fieldsOverride: { height: null } },
      ],
    });
    const node = { ...base, isAlive: true };
    await repo.save(node);
    const loaded = (await repo.loadAll()).get(node.id)!;
    expect(loaded.isAlive).toBe(true);
    expect(loaded.variants).toEqual(node.variants);
  });

  it.each([42, ['台詞'], { 攻撃: true }, { '': '空のキー' }])(
    '不正な台詞mapを検出する: %j',
    (value) => {
      const node = createNode(new TemplateRegistry(), {
        templateId: CHARACTER_TEMPLATE.id,
        slug: 'test',
        fields: { display_name: 'テスト', dialogue_by_scene: value },
      });
      expect(
        validateNode(node, CHARACTER_TEMPLATE).find(
          (issue) => issue.fieldId === 'dialogue_by_scene',
        )?.severity,
      ).toBe('error');
    },
  );
});

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFileSystemAdapter } from '../testing/InMemoryFileSystemAdapter.js';
import {
  CHARACTER_TEMPLATE,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  LOCATION_TEMPLATE,
  TemplateRegistry,
  createNode,
  FsNodeRepository,
  isValidSlug,
} from './index.js';
import type { ProjectHandle } from '../platform.js';

describe('NodeRepository', () => {
  let adapter: InMemoryFileSystemAdapter;
  let handle: ProjectHandle;
  let templates: TemplateRegistry;
  let repo: FsNodeRepository;

  beforeEach(() => {
    adapter = new InMemoryFileSystemAdapter();
    handle = adapter.register('test');
    templates = new TemplateRegistry();
    repo = new FsNodeRepository(adapter, handle, templates);
  });

  it('PR-AC: thumbnailRect round-trips via save → loadAll', async () => {
    const t = createNode(templates, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'cropped',
      fields: { display_name: 'クロップ太郎' },
    });
    const withRect = {
      ...t,
      thumbnail: 'Media/cropped.png',
      thumbnailRect: { x: 0.2, y: 0.05, size: 0.4 },
    };
    await repo.save(withRect);
    const all = await repo.loadAll();
    const loaded = all.get(t.id);
    expect(loaded?.thumbnail).toBe('Media/cropped.png');
    expect(loaded?.thumbnailRect).toEqual({ x: 0.2, y: 0.05, size: 0.4 });
  });

  it('PR-AC: thumbnailRect は 0..1 にクランプされる', async () => {
    const t = createNode(templates, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'over',
      fields: { display_name: 'オーバー' },
    });
    const withRect = {
      ...t,
      thumbnail: 'Media/over.png',
      thumbnailRect: { x: -0.5, y: 1.5, size: 2.0 },
    };
    await repo.save(withRect);
    const all = await repo.loadAll();
    const loaded = all.get(t.id);
    expect(loaded?.thumbnailRect).toEqual({ x: 0, y: 1, size: 1 });
  });

  it('save → loadAll round-trips a single node with all base fields', async () => {
    const tarou = createNode(templates, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'tarou',
      fields: {
        full_name: { ja: '太郎', en: 'Tarou' },
        birth_year: -50,
        gender: 'male',
        height: 175,
      },
    });
    await repo.save(tarou);
    const all = await repo.loadAll();
    expect(all.size).toBe(1);
    const loaded = all.get(tarou.id);
    expect(loaded?.slug).toBe('tarou');
    expect(loaded?.templateId).toBe(CHARACTER_TEMPLATE.id);
    expect(loaded?.fields['full_name']).toEqual({ ja: '太郎', en: 'Tarou' });
    expect(loaded?.fields['birth_year']).toBe(-50);
  });

  it('writes node to Nodes/<directory>/<slug>.yaml using template directory', async () => {
    const f = createNode(templates, {
      templateId: FACTION_TEMPLATE.id,
      slug: 'red_circle',
      fields: { display_name: { ja: '赤の輪', en: 'Red Circle' } },
    });
    await repo.save(f);
    expect(await adapter.exists(handle, 'Nodes/factions/red_circle.yaml')).toBe(true);
  });

  it('rename moves the file and updates slug', async () => {
    const node = createNode(templates, {
      templateId: ITEM_TEMPLATE.id,
      slug: 'old_sword',
    });
    await repo.save(node);
    await repo.rename(node.id, 'legendary_sword');

    expect(await adapter.exists(handle, 'Nodes/items/old_sword.yaml')).toBe(false);
    expect(await adapter.exists(handle, 'Nodes/items/legendary_sword.yaml')).toBe(true);
    const all = await repo.loadAll();
    expect(all.get(node.id)?.slug).toBe('legendary_sword');
  });

  it('rename rejects invalid slug', async () => {
    const node = createNode(templates, { templateId: ITEM_TEMPLATE.id, slug: 'a' });
    await repo.save(node);
    await expect(repo.rename(node.id, 'Has Space')).rejects.toThrow(/invalid slug/);
    await expect(repo.rename(node.id, 'UPPER')).rejects.toThrow(/invalid slug/);
  });

  it('rename rejects when target slug already exists', async () => {
    const a = createNode(templates, { templateId: ITEM_TEMPLATE.id, slug: 'a' });
    const b = createNode(templates, { templateId: ITEM_TEMPLATE.id, slug: 'b' });
    await repo.save(a);
    await repo.save(b);
    await expect(repo.rename(a.id, 'b')).rejects.toThrow(/already exists/);
  });

  it('delete removes the file and is idempotent on missing nodes', async () => {
    const a = createNode(templates, { templateId: LOCATION_TEMPLATE.id, slug: 'castle' });
    await repo.save(a);
    expect(await adapter.exists(handle, 'Nodes/locations/castle.yaml')).toBe(true);
    await repo.delete(a.id);
    expect(await adapter.exists(handle, 'Nodes/locations/castle.yaml')).toBe(false);
    // 二度目は no-op
    await repo.delete(a.id);
  });

  it('loadAll handles an empty project', async () => {
    const all = await repo.loadAll();
    expect(all.size).toBe(0);
  });

  it('loadAll mixes nodes across all template directories', async () => {
    await repo.save(createNode(templates, { templateId: CHARACTER_TEMPLATE.id, slug: 'tarou' }));
    await repo.save(createNode(templates, { templateId: LOCATION_TEMPLATE.id, slug: 'castle' }));
    await repo.save(createNode(templates, { templateId: ITEM_TEMPLATE.id, slug: 'sword' }));
    await repo.save(createNode(templates, { templateId: FACTION_TEMPLATE.id, slug: 'red' }));
    const all = await repo.loadAll();
    expect(all.size).toBe(4);
  });

  it('round-trips 50 nodes by load → save → load identity', async () => {
    const N = 50;
    const created = [] as ReturnType<typeof createNode>[];
    for (let i = 0; i < N; i++) {
      const n = createNode(templates, {
        templateId: CHARACTER_TEMPLATE.id,
        slug: `c${i.toString().padStart(3, '0')}`,
        fields: {
          full_name: { ja: `キャラ${i}`, en: `Char${i}` },
          birth_year: -i,
          height: 150 + (i % 50),
        },
      });
      await repo.save(n);
      created.push(n);
    }
    const all = await repo.loadAll();
    expect(all.size).toBe(N);

    // 全件を再保存してから再ロード — 識別子が安定していること
    for (const n of all.values()) {
      await repo.save(n);
    }
    const reloaded = await repo.loadAll();
    expect(reloaded.size).toBe(N);
    for (const c of created) {
      expect(reloaded.get(c.id)?.slug).toBe(c.slug);
    }
  });

  it('isValidSlug accepts a-z 0-9 _ -', () => {
    expect(isValidSlug('tarou')).toBe(true);
    expect(isValidSlug('tarou_001')).toBe(true);
    expect(isValidSlug('tarou-001')).toBe(true);
    expect(isValidSlug('Tarou')).toBe(false);
    expect(isValidSlug('tarou san')).toBe(false);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a/b')).toBe(false);
  });
});

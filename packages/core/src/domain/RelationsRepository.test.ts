import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFileSystemAdapter } from '../testing/InMemoryFileSystemAdapter.js';
import { FsRelationsRepository, createRelation } from './RelationsRepository.js';
import { nodeId } from './era.js';
import type { ProjectHandle } from '../platform.js';

describe('FsRelationsRepository', () => {
  let adapter: InMemoryFileSystemAdapter;
  let handle: ProjectHandle;
  let repo: FsRelationsRepository;

  beforeEach(() => {
    adapter = new InMemoryFileSystemAdapter();
    handle = adapter.register('test');
    repo = new FsRelationsRepository(adapter, handle);
  });

  it('returns empty array when relations.yaml is missing', async () => {
    expect(await repo.load()).toEqual([]);
  });

  it('save() then load() round-trips a simple relation', async () => {
    const a = nodeId('node.a');
    const b = nodeId('node.b');
    const rel = createRelation({ source: a, target: b, text: '幼馴染' });
    await repo.save([rel]);
    const reloaded = await repo.load();
    expect(reloaded).toEqual([rel]);
  });

  it('models bidirectional as two directed relations (one per direction)', async () => {
    const a = nodeId('node.a');
    const b = nodeId('node.b');
    const fwd = createRelation({ source: a, target: b, text: '兄' });
    const rev = createRelation({ source: b, target: a, text: '妹' });
    await repo.save([fwd, rev]);
    const reloaded = await repo.load();
    expect(reloaded).toEqual([fwd, rev]);
    expect(reloaded.map((r) => r.text)).toEqual(['兄', '妹']);
  });

  it('keeps free text relation text', async () => {
    await adapter.write(
      handle,
      'Relations/relations.yaml',
      `schemaVersion: 1
kind: relations
relations:
  - { id: rel.x, source: node.a, target: node.b, text: 互いに遠慮ない }
  - { id: rel.y, source: node.a, target: node.b, text: 宿敵 }
`,
    );
    const loaded = await repo.load();
    expect(loaded.length).toBe(2);
    expect(loaded.map((r) => r.text)).toEqual(['互いに遠慮ない', '宿敵']);
  });

  it('back-compat: loads old from/to + type schema as text', async () => {
    await adapter.write(
      handle,
      'Relations/relations.yaml',
      `schemaVersion: 1
kind: relations
relations:
  - id: rel01
    from: node.melos
    to: node.imoto
    type: 兄妹
    label_from: 兄
`,
    );
    const loaded = await repo.load();
    expect(loaded).toEqual([
      { id: 'rel01', source: 'node.melos', target: 'node.imoto', text: '兄妹' },
    ]);
  });

  it('back-compat: falls back to label/description when text/type absent', async () => {
    await adapter.write(
      handle,
      'Relations/relations.yaml',
      `schemaVersion: 1
kind: relations
relations:
  - { id: rel.a, source: node.a, target: node.b, label: 旧labelフィールド }
  - { id: rel.b, source: node.a, target: node.b, description: 旧descriptionフィールド }
`,
    );
    const loaded = await repo.load();
    expect(loaded.map((r) => r.text)).toEqual(['旧labelフィールド', '旧descriptionフィールド']);
  });
});

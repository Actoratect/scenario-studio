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
    const rel = createRelation({ source: a, target: b, type: 'friend' });
    await repo.save([rel]);
    const reloaded = await repo.load();
    expect(reloaded).toEqual([rel]);
  });

  it('preserves label when present', async () => {
    const a = nodeId('node.a');
    const b = nodeId('node.b');
    const rel = createRelation({ source: a, target: b, type: 'enemy', label: '宿敵' });
    await repo.save([rel]);
    const reloaded = await repo.load();
    expect(reloaded[0]?.label).toBe('宿敵');
  });

  it('drops entries with unknown type', async () => {
    await adapter.write(
      handle,
      'Relations/relations.yaml',
      `schemaVersion: 1
kind: relations
relations:
  - { id: rel.x, source: node.a, target: node.b, type: not_a_real_type }
  - { id: rel.y, source: node.a, target: node.b, type: friend }
`,
    );
    const loaded = await repo.load();
    expect(loaded.length).toBe(1);
    expect(loaded[0]?.type).toBe('friend');
  });
});

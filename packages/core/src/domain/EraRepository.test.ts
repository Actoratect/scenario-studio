import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFileSystemAdapter } from '../testing/InMemoryFileSystemAdapter.js';
import { FsEraRepository } from './EraRepository.js';
import { eraId } from './era.js';
import type { ProjectHandle } from '../platform.js';

describe('FsEraRepository', () => {
  let adapter: InMemoryFileSystemAdapter;
  let handle: ProjectHandle;
  let repo: FsEraRepository;

  beforeEach(() => {
    adapter = new InMemoryFileSystemAdapter();
    handle = adapter.register('test');
    repo = new FsEraRepository(adapter, handle);
  });

  it('loadAll returns empty index when Eras/ is empty', async () => {
    const idx = await repo.loadAll();
    expect(idx.all()).toEqual([]);
  });

  it('save then loadAll round-trips an era', async () => {
    await repo.save({ id: eraId('era.modern'), label: 'Modern Era' });
    const idx = await repo.loadAll();
    expect(idx.all()).toEqual(['era.modern']);
    expect(idx.get(eraId('era.modern'))?.label).toBe('Modern Era');
  });

  it('preserves parent + yearRange', async () => {
    await repo.save({ id: eraId('era.medieval'), label: 'Medieval', yearRange: [1000, 1500] });
    await repo.save({
      id: eraId('era.medieval_late'),
      label: 'Late Medieval',
      parent: eraId('era.medieval'),
      yearRange: [1300, 1500],
    });
    const idx = await repo.loadAll();
    const late = idx.get(eraId('era.medieval_late'));
    expect(late?.parent).toBe('era.medieval');
    expect(late?.yearRange).toEqual([1300, 1500]);
    expect(idx.ancestorsOf(eraId('era.medieval_late'))).toEqual([
      'era.medieval_late',
      'era.medieval',
    ]);
  });

  it('delete removes an era', async () => {
    await repo.save({ id: eraId('era.x'), label: 'X' });
    await repo.delete(eraId('era.x'));
    const idx = await repo.loadAll();
    expect(idx.all()).toEqual([]);
  });
});

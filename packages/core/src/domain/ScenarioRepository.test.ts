import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFileSystemAdapter } from '../testing/InMemoryFileSystemAdapter.js';
import { FsScenarioRepository } from './ScenarioRepository.js';
import type { ProjectHandle } from '../platform.js';

describe('FsScenarioRepository', () => {
  let adapter: InMemoryFileSystemAdapter;
  let handle: ProjectHandle;
  let repo: FsScenarioRepository;

  beforeEach(() => {
    adapter = new InMemoryFileSystemAdapter();
    handle = adapter.register('test');
    repo = new FsScenarioRepository(adapter, handle);
  });

  it('load returns empty structure when project file is missing', async () => {
    const s = await repo.load();
    expect(s.chapters).toEqual([]);
    expect(s.projectSynopsis).toBe('');
  });

  it('saveSynopsis + load round-trips synopsis text', async () => {
    await repo.saveSynopsis('# Test\n\nfirst paragraph\n');
    const s = await repo.load();
    expect(s.projectSynopsis).toContain('first paragraph');
  });

  it('addChapter creates chapter files and load picks it up', async () => {
    const ch = await repo.addChapter({
      slug: 'ch01_meeting',
      title: '出会い',
      summary: '主人公が城門で…',
    });
    await repo.saveProjectIndex([{ slug: 'ch01_meeting' }]);

    expect(await adapter.exists(handle, 'Scenarios/ch01_meeting/_index.yaml')).toBe(true);
    expect(await adapter.exists(handle, 'Scenarios/ch01_meeting/synopsis.md')).toBe(true);
    expect(await adapter.exists(handle, 'Scenarios/ch01_meeting/_scene_index.yaml')).toBe(true);

    const s = await repo.load();
    expect(s.chapters.length).toBe(1);
    expect(s.chapters[0]!.slug).toBe('ch01_meeting');
    expect(s.chapters[0]!.title).toBe('出会い');
    expect(s.chapters[0]!.summary).toContain('城門');
    expect(s.chapters[0]!.id).toBe(ch.id);
    expect(s.chapters[0]!.scenes).toEqual([]);
  });

  it('addChapter rejects duplicate slug', async () => {
    await repo.addChapter({ slug: 'ch01', title: 'A' });
    await expect(repo.addChapter({ slug: 'ch01', title: 'B' })).rejects.toThrow(/already exists/);
  });

  it('load picks up scene file even when _scene_index.yaml is empty', async () => {
    await repo.addChapter({ slug: 'ch01', title: 'Chapter 1' });
    await repo.saveProjectIndex([{ slug: 'ch01' }]);
    // 直接 .scn.yaml を置く (M6 の Script Editor 経由を模擬)
    await adapter.write(
      handle,
      'Scenarios/ch01/s01_opening.scn.yaml',
      `schemaVersion: 1\nsceneId: scene.s01_opening\nplot:\n  title: 嵐の城門\nscript: []\n`,
    );
    const s = await repo.load();
    expect(s.chapters[0]!.scenes.length).toBe(1);
    expect(s.chapters[0]!.scenes[0]!.slug).toBe('s01_opening');
    expect(s.chapters[0]!.scenes[0]!.title).toBe('嵐の城門');
  });

  it('respects scene order in _scene_index.yaml', async () => {
    await repo.addChapter({ slug: 'ch01', title: 'C' });
    await repo.saveProjectIndex([{ slug: 'ch01' }]);
    await adapter.write(
      handle,
      'Scenarios/ch01/s01.scn.yaml',
      `schemaVersion: 1\nplot:\n  title: A\nscript: []\n`,
    );
    await adapter.write(
      handle,
      'Scenarios/ch01/s02.scn.yaml',
      `schemaVersion: 1\nplot:\n  title: B\nscript: []\n`,
    );
    await adapter.write(
      handle,
      'Scenarios/ch01/_scene_index.yaml',
      `schemaVersion: 1\nkind: scene_index\nscenes:\n  - s02\n  - s01\n`,
    );
    const s = await repo.load();
    expect(s.chapters[0]!.scenes.map((sc) => sc.slug)).toEqual(['s02', 's01']);
  });
});

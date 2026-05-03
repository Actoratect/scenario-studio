import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFileSystemAdapter } from '../testing/InMemoryFileSystemAdapter.js';
import {
  initializeProject,
  loadProject,
  PROJECT_DIRS,
  PROJECT_SETTINGS_FILE,
  ProjectNotInitializedError,
} from './index.js';
import type { ProjectHandle } from '../platform.js';

describe('ProjectLoader', () => {
  let adapter: InMemoryFileSystemAdapter;
  let handle: ProjectHandle;

  beforeEach(() => {
    adapter = new InMemoryFileSystemAdapter();
    handle = adapter.register('test-project');
  });

  it('initializeProject creates ProjectSettings.yaml + skeleton dirs + .gitignore', async () => {
    const result = await initializeProject(adapter, handle, { name: 'My Project' });
    expect(result.project.settings.name).toBe('My Project');
    expect(result.project.settings.locales).toEqual(['ja', 'en']);

    expect(await adapter.exists(handle, PROJECT_SETTINGS_FILE)).toBe(true);
    expect(await adapter.exists(handle, '.gitignore')).toBe(true);
    for (const dir of PROJECT_DIRS) {
      expect(await adapter.exists(handle, `${dir}/.gitkeep`)).toBe(true);
    }
  });

  it('initializeProject refuses to overwrite existing project', async () => {
    await initializeProject(adapter, handle, { name: 'first' });
    await expect(initializeProject(adapter, handle, { name: 'second' })).rejects.toThrow(
      /already exists/,
    );
  });

  it('loadProject reads settings written by initializeProject', async () => {
    await initializeProject(adapter, handle, { name: 'Reloadable' });
    const reloaded = await loadProject(adapter, handle);
    expect(reloaded.project.settings.name).toBe('Reloadable');
    expect(reloaded.project.settings.schemaVersion).toBe(1);
    // M2 で nodes が空 Map で hydrate されること
    expect(reloaded.project.nodes.size).toBe(0);
    expect(reloaded.templates.list().length).toBe(4); // 4 builtin templates
    // M4 で eras / scenario が hydrate される (空 project でも shape が存在)
    expect(reloaded.project.eras.all()).toEqual([]);
    expect(reloaded.project.scenario.chapters).toEqual([]);
    expect(reloaded.project.scenario.projectSynopsis).toBe('');
    // M7 で glossary が hydrate される (terms.yaml が無ければ空配列)
    expect(reloaded.project.glossary).toEqual([]);
    // PR-E で relations が hydrate される (relations.yaml が無ければ空配列)
    expect(reloaded.project.relations).toEqual([]);
  });

  it('loadProject throws ProjectNotInitializedError when settings missing', async () => {
    await expect(loadProject(adapter, handle)).rejects.toBeInstanceOf(ProjectNotInitializedError);
  });
});

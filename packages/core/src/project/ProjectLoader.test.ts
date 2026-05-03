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
    const project = await initializeProject(adapter, handle, { name: 'My Project' });
    expect(project.settings.name).toBe('My Project');
    expect(project.settings.locales).toEqual(['ja', 'en']);

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
    expect(reloaded.settings.name).toBe('Reloadable');
    expect(reloaded.settings.schemaVersion).toBe(1);
  });

  it('loadProject throws ProjectNotInitializedError when settings missing', async () => {
    await expect(loadProject(adapter, handle)).rejects.toBeInstanceOf(ProjectNotInitializedError);
  });
});

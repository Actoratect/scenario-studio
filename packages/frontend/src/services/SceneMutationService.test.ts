import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./SceneAppearanceIndex', () => ({ SceneAppearanceIndex: { invalidate: vi.fn() } }));
vi.mock('./PlotBoardService', () => ({ PlotBoardService: { remapSceneReferences: vi.fn() } }));
import { SceneMutationService } from './SceneMutationService';
import { DirtyTracker } from './DirtyTracker';
import { PanelPinService } from './PanelPinService';
import { SceneSelection } from './SceneSelection';
import { PlotSelection } from './PlotSelection';
import { ScriptHistoryService } from './ScriptHistoryService';
import { GlobalHistoryService } from './GlobalHistoryService';
import { PlotBoardService } from './PlotBoardService';

const path = 'Scenarios/ch/scene.scn.yaml';

describe('SceneMutationService', () => {
  beforeEach(() => {
    DirtyTracker.reset();
    SceneSelection.clear();
    PlotSelection.clear();
    ScriptHistoryService.clear();
    GlobalHistoryService.clear();
    PanelPinService.clearPanel('script');
  });

  it('saves both script and plot before allowing a structure change', async () => {
    const script = vi.fn();
    const plot = vi.fn();
    DirtyTracker.mark({ key: path, label: 'script', saveFn: script });
    DirtyTracker.mark({ key: `${path}\u0000plot`, label: 'plot', saveFn: plot });
    DirtyTracker.mark({ key: 'other', label: 'other', saveFn: vi.fn() });
    const preparing = SceneMutationService.prepare(path);
    expect(SceneMutationService.isLocked(path)).toBe(true);
    const release = await preparing;
    expect(script).toHaveBeenCalledOnce();
    expect(plot).toHaveBeenCalledOnce();
    expect(DirtyTracker.count()).toBe(1);
    release();
    expect(SceneMutationService.isLocked(path)).toBe(false);
  });

  it('blocks renaming or deletion when a save fails and releases the lock', async () => {
    const original = { chapterSlug: 'ch', sceneSlug: 'scene' };
    SceneSelection.select(original);
    PanelPinService.pinScript('script', original);
    DirtyTracker.mark({
      key: path,
      label: 'script',
      saveFn: () => {
        throw new Error('invalid YAML');
      },
    });
    await expect(SceneMutationService.prepare(path)).rejects.toThrow('invalid YAML');
    expect(SceneMutationService.isLocked(path)).toBe(false);
    expect(DirtyTracker.isDirty()).toBe(true);
    expect(SceneSelection.selected()).toEqual(original);
    expect(PanelPinService.scriptScene('script')).toEqual(original);
  });

  it('moves selected scenes, pinned tabs and script history together', () => {
    const previous = { chapterSlug: 'ch', sceneSlug: 'scene' };
    const next = { chapterSlug: 'next', sceneSlug: 'renamed' };
    SceneSelection.select(previous);
    PlotSelection.select({ ...previous, kind: 'scene' });
    PanelPinService.pinScript('script', previous);
    ScriptHistoryService.push(path, { meta: {}, title: 'before', cast: [], blocks: [] });
    SceneMutationService.remap(previous, next);
    expect(PlotBoardService.remapSceneReferences).toHaveBeenCalledWith(previous, next);
    expect(SceneSelection.selected()).toEqual(next);
    expect(PlotSelection.selected()).toEqual({ ...next, kind: 'scene' });
    expect(PanelPinService.scriptScene('script')).toEqual(next);
    expect(ScriptHistoryService.canUndo('Scenarios/next/renamed.scn.yaml')).toBe(true);
    SceneMutationService.remap(next);
    expect(SceneSelection.selected()).toBeUndefined();
    expect(PlotSelection.selected()).toBeUndefined();
    expect(PanelPinService.isScriptPinned('script')).toBe(false);
    expect(ScriptHistoryService.canUndo('Scenarios/next/renamed.scn.yaml')).toBe(false);
  });
});

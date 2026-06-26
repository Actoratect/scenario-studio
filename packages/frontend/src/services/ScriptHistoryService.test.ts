import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedScene } from '@scenario-studio/core';
import { ScriptHistoryService } from './ScriptHistoryService';

function scene(title: string): ParsedScene {
  return {
    meta: {},
    title,
    cast: [],
    blocks: [{ kind: 'stage', text: title }],
  };
}

describe('ScriptHistoryService', () => {
  beforeEach(() => {
    ScriptHistoryService.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores undo and redo snapshots per scene path', () => {
    const current = scene('current');
    const previous = scene('previous');

    ScriptHistoryService.push('Scenarios/ch01/s01.scn.yaml', previous);
    expect(ScriptHistoryService.canUndo('Scenarios/ch01/s01.scn.yaml')).toBe(true);

    const undo = ScriptHistoryService.takeUndo('Scenarios/ch01/s01.scn.yaml', current);
    expect(undo?.title).toBe('previous');
    expect(ScriptHistoryService.canRedo('Scenarios/ch01/s01.scn.yaml')).toBe(true);

    const redo = ScriptHistoryService.takeRedo('Scenarios/ch01/s01.scn.yaml', previous);
    expect(redo?.title).toBe('current');
  });

  it('clear removes all scene histories', () => {
    ScriptHistoryService.push('Scenarios/ch01/s01.scn.yaml', scene('previous'));
    expect(ScriptHistoryService.canUndo('Scenarios/ch01/s01.scn.yaml')).toBe(true);

    ScriptHistoryService.clear();

    expect(ScriptHistoryService.canUndo('Scenarios/ch01/s01.scn.yaml')).toBe(false);
    expect(ScriptHistoryService.activePath()).toBeUndefined();
  });

  it('coalesces rapid pushes with the same merge key', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00Z'));

    const path = 'Scenarios/ch01/s01.scn.yaml';
    ScriptHistoryService.push(path, scene('before typing'), { mergeKey: 'block:1' });
    vi.advanceTimersByTime(100);
    ScriptHistoryService.push(path, scene('after first char'), { mergeKey: 'block:1' });

    const undo = ScriptHistoryService.takeUndo(path, scene('after second char'));
    expect(undo?.title).toBe('before typing');
    expect(ScriptHistoryService.canUndo(path)).toBe(false);
  });
});

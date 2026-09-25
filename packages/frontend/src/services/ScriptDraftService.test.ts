import { describe, expect, it } from 'vitest';
import type { ParsedScene } from '@scenario-studio/core';
import { ScriptDraftService } from './ScriptDraftService';

const scene: ParsedScene = { meta: {}, title: 'scene', cast: [], blocks: [] };

describe('ScriptDraftService', () => {
  it('keeps invalid raw input together with the last valid scene', () => {
    const project = {};
    const draft = ScriptDraftService.set(project, 'scene', {
      scene,
      rawEdited: true,
      rawText: 'script: [',
      parseError: 'invalid YAML',
    });
    expect(ScriptDraftService.get(project, 'scene')).toEqual(draft);
    expect(draft.scene).not.toBe(scene);
  });

  it('isolates reopened projects even when their file paths match', () => {
    const oldProject = {};
    ScriptDraftService.set(oldProject, 'scene', { scene, rawEdited: false });
    expect(ScriptDraftService.get({}, 'scene')).toBeUndefined();
  });

  it('only clears the version actually saved', () => {
    const project = {};
    const oldDraft = ScriptDraftService.set(project, 'scene', { scene, rawEdited: false });
    const newDraft = ScriptDraftService.set(project, 'scene', {
      scene: { ...scene, title: 'new' },
      rawEdited: true,
    });
    ScriptDraftService.clearSaved(project, 'scene', oldDraft);
    expect(ScriptDraftService.get(project, 'scene')).toBe(newDraft);
    ScriptDraftService.clearSaved(project, 'scene', newDraft);
    expect(ScriptDraftService.get(project, 'scene')).toBeUndefined();
  });
});

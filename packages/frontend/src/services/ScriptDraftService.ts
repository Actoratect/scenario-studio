import type { ParsedScene } from '@scenario-studio/core';
import { ScriptHistoryService } from './ScriptHistoryService';

export interface ScriptDraft {
  readonly scene: ParsedScene;
  readonly rawEdited: boolean;
  readonly rawText?: string;
  readonly parseError?: string;
}

// ProjectHistory は touch() で変わらず、再オープンでは必ず新しい参照になる。
// WeakMap により「破棄して閉じたプロジェクト」の下書きが復活するのも防ぐ。
const projects = new WeakMap<object, Map<string, ScriptDraft>>();

export const ScriptDraftService = {
  get(scope: object, path: string): ScriptDraft | undefined {
    return projects.get(scope)?.get(path);
  },

  set(scope: object, path: string, draft: ScriptDraft): ScriptDraft {
    let drafts = projects.get(scope);
    if (!drafts) {
      drafts = new Map();
      projects.set(scope, drafts);
    }
    const snapshot = { ...draft, scene: ScriptHistoryService.cloneScene(draft.scene) };
    drafts.set(path, snapshot);
    return snapshot;
  },

  /** 保存中に編集された下書きを、古い保存の完了通知で消さない。 */
  clearSaved(scope: object, path: string, saved: ScriptDraft): void {
    const drafts = projects.get(scope);
    if (drafts?.get(path) === saved) drafts.delete(path);
  },
};

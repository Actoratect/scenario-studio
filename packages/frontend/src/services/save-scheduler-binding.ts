import { SaveScheduler } from './SaveScheduler.js';
import { ProjectService } from './ProjectService.js';
import { SaveStatus } from './SaveStatus.js';
import { Toast } from './Toast.js';
import { ConflictDetector } from './ConflictDetector.js';
import type { NodeId } from '@scenario-studio/core';

// 「現在開いているプロジェクト」に紐づく SaveScheduler の singleton。
// Inspector / 他編集 panel から `useSaveScheduler()` で取得する。
// PR-D: schedule / flush / error の lifecycle を SaveStatus + Toast に伝搬。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M3

let scheduler: SaveScheduler | undefined;

function ensureScheduler(): SaveScheduler {
  if (scheduler) return scheduler;
  const inner = new SaveScheduler({
    debounceMs: 500,
    flush: async (nodeId: NodeId) => {
      const ctx = ProjectService.currentProject();
      if (!ctx) return;
      const node = ctx.project.nodes.get(nodeId);
      if (!node) return;
      SaveStatus.markSaving();
      try {
        // PR-AH: 上書き前に外部書き換えがないかチェック
        const path = ctx.nodeRepository.pathFor(node);
        const ok = await ConflictDetector.checkBeforeWrite(ctx.adapter, ctx.handle, path);
        if (!ok) {
          SaveStatus.markPending();
          Toast.info(`保存スキップ: ${path} (外部変更を温存)`, 4000);
          return;
        }
        const content = ctx.nodeRepository.serializeForSave(node);
        await ctx.adapter.write(ctx.handle, path, content);
        ConflictDetector.recordSnapshot(ctx.handle, path, content);
        SaveStatus.markSaved();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        SaveStatus.markError(msg);
        Toast.error(`保存失敗: ${msg}`);
        throw e;
      }
    },
  });
  // schedule() を proxy して SaveStatus.markPending を発火
  const original = inner.schedule.bind(inner);
  inner.schedule = (id: NodeId) => {
    SaveStatus.markPending();
    original(id);
  };
  scheduler = inner;
  return inner;
}

/**
 * Inspector など編集する panel が呼ぶ。常に同じ instance を返す。
 */
export function useSaveScheduler(): SaveScheduler {
  return ensureScheduler();
}

/**
 * project close 時に呼ぶ。pending を flush してから destroy。
 */
export function disposeSaveScheduler(): void {
  if (!scheduler) return;
  scheduler.flushAll();
  scheduler.destroy();
  scheduler = undefined;
  SaveStatus.reset();
}

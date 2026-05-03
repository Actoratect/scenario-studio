import { SaveScheduler } from './SaveScheduler.js';
import { ProjectService } from './ProjectService.js';
import type { NodeId } from '@scenario-studio/core';

// 「現在開いているプロジェクト」に紐づく SaveScheduler の singleton。
// Inspector / 他編集 panel から `useSaveScheduler()` で取得する。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M3

let scheduler: SaveScheduler | undefined;

function ensureScheduler(): SaveScheduler {
  if (scheduler) return scheduler;
  scheduler = new SaveScheduler({
    debounceMs: 500,
    flush: async (nodeId: NodeId) => {
      const ctx = ProjectService.currentProject();
      if (!ctx) return;
      const node = ctx.project.nodes.get(nodeId);
      if (!node) return;
      // NodeFieldStore からの最新フィールドを node に乗せて save (Inspector 経由で既に同期済)
      await ctx.nodeRepository.save(node);
    },
  });
  return scheduler;
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
}

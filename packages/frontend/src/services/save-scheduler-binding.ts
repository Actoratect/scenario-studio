import { SaveScheduler } from './SaveScheduler.js';
import { ProjectService } from './ProjectService.js';
import { SaveStatus } from './SaveStatus.js';
import { Toast } from './Toast.js';
import { ConflictDetector } from './ConflictDetector.js';
import { DirtyTracker } from './DirtyTracker.js';
import type { NodeId } from '@scenario-studio/core';

// 「現在開いているプロジェクト」に紐づく SaveScheduler の singleton。
// Inspector / 他編集 panel から `useSaveScheduler()` で取得する。
// PR-D: schedule / flush / error の lifecycle を SaveStatus + Toast に伝搬。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M3

let scheduler: SaveScheduler | undefined;

function ensureScheduler(): SaveScheduler {
  if (scheduler) return scheduler;
  const inner = new SaveScheduler({
    flush: async (nodeId: NodeId) => {
      const ctx = ProjectService.currentProject();
      if (!ctx) return;
      const node = ctx.project.nodes.get(nodeId);
      if (!node) return;
      const token = SaveStatus.beginSave();
      let path = '';
      try {
        // PR-AH: 上書き前に外部書き換えがないかチェック
        path = ctx.nodeRepository.pathFor(node);
        const ok = await ConflictDetector.checkBeforeWrite(ctx.adapter, ctx.handle, path);
        if (!ok) {
          SaveStatus.skipSave(token);
          Toast.info(`保存スキップ: ${path} (外部変更を温存)`, 4000);
          // 'skipped' を返して dirty を温存する。旧実装は void return で dirty が
          // 消え、未保存なのに保存バッジ・beforeunload ガードから見えなくなっていた。
          return 'skipped';
        }
        const content = ctx.nodeRepository.serializeForSave(node);
        await ctx.adapter.write(ctx.handle, path, content);
        ConflictDetector.recordSnapshot(ctx.handle, path, content);
        SaveStatus.endSave(token);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        SaveStatus.failSave(token, msg);
        // Toast は Cmd+S 側の集約トーストに一本化 (旧: ここで sticky toast を出し
        // 「保存しました」と矛盾して並んでいた)。path を message に含めて rethrow。
        throw new Error(path !== '' ? `${path}: ${msg}` : msg);
      }
    },
  });
  // schedule() を proxy して SaveStatus.markPending を発火 (dirty 検知用)
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
 * project close 時に呼ぶ。pending は捨てる (= 保存していない変更は失われる)。
 * PR (ux-overhaul) 後は明示保存運用なので、ヘッダ側で「未保存があります」確認ダイアログを
 * 出してから close するのが正しい運用。
 */
export function disposeSaveScheduler(): void {
  if (scheduler) {
    scheduler.destroy();
    scheduler = undefined;
  }
  DirtyTracker.reset();
  SaveStatus.reset();
}

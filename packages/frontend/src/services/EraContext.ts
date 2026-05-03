import { createMemo, createSignal } from 'solid-js';
import { eraId, type EraId } from '@scenario-studio/core';
import { ProjectService } from './ProjectService';

// Era スライダ / Inspector / Graph / Timeline すべてが購読する
// 「現在表示中の Era」signal。MVP は単一 era 選択。
// Phase 3 で A/B 比較の 2 era pin (05_timeline.md §2.3) 対応予定。
// 詳細: ../../../../Documentation/ScenarioEditor/05_timeline.md §2,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M4

const PROJECT_BASE_ERA = eraId('era.__base__');

const [currentEraId, setCurrentEraId] = createSignal<EraId>(PROJECT_BASE_ERA);

const availableEras = createMemo<readonly EraId[]>(() => {
  const ctx = ProjectService.currentProject();
  if (!ctx) return [];
  return ctx.project.eras.all();
});

export const EraContext = {
  /** 現在表示中の Era。`era.__base__` は「Variant 適用なし」(ベースのみ) の意。 */
  currentEraId,
  availableEras,

  /** Project に存在する era、もしくはベース sentinel。 */
  selectEra(id: EraId): void {
    setCurrentEraId(id);
  },

  selectBase(): void {
    setCurrentEraId(PROJECT_BASE_ERA);
  },

  /** EraContext.PROJECT_BASE_ERA と一致なら "no era" 状態。 */
  isBase(): boolean {
    return currentEraId() === PROJECT_BASE_ERA;
  },

  PROJECT_BASE_ERA,
};

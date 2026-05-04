import type { Component } from 'solid-js';
import { EraSelector } from './EraSelector';

// Workspace header の Era 切替 (PR-Z で EraSelector に統合)。
// UI は select 形式。Inspector header の pills 形式と signal を共有。
// 詳細: ../../../../Documentation/ScenarioEditor/05_timeline.md §2

export const EraSlider: Component = () => {
  return (
    <div class="era-slider">
      <span class="era-slider-label">時間軸:</span>
      <EraSelector variant="select" />
    </div>
  );
};

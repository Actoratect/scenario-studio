import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';

// シナリオ章 / シーンのアウトライナ Panel。Phase 1 で TanStack Virtual を載せる。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md, 07_window-system.md §5
export const OutlinePanel: Component<GroupPanelPartInitParameters> = (params) => {
  return (
    <div class="panel-content">
      <h2>Outline</h2>
      <p>章 / シーン階層の placeholder。Phase 1 で TanStack Virtual で大規模対応。</p>
      <p>
        Panel id: <code>{params.api.id}</code>
      </p>
    </div>
  );
};

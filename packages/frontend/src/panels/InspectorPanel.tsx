import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';

// 選択ノードの詳細編集 Panel。Phase 1 で SolidJS form を載せる。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md, 07_window-system.md §5
export const InspectorPanel: Component<GroupPanelPartInitParameters> = (params) => {
  return (
    <div class="panel-content">
      <h2>Inspector</h2>
      <p>選択ノードの詳細編集 placeholder。Phase 1 で template に基づくフォームを生成。</p>
      <p>
        Panel id: <code>{params.api.id}</code>
      </p>
    </div>
  );
};

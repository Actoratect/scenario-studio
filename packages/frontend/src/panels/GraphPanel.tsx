import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';

// 相関図 Panel の placeholder。実装は PoC-B / Phase 1 で SolidFlow を載せる。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md
export const GraphPanel: Component<GroupPanelPartInitParameters> = (params) => {
  return (
    <div class="panel-content">
      <h2>Graph</h2>
      <p>相関図 Lens の placeholder。PoC-B で SolidFlow → Sigma.js のベンチを実施予定。</p>
      <p>
        Panel id: <code>{params.api.id}</code>
      </p>
    </div>
  );
};

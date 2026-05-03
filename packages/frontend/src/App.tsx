import { onCleanup, onMount } from 'solid-js';
import type { Component } from 'solid-js';
import { createDockview } from 'dockview-core';
import type { CreateComponentOptions, DockviewApi, IContentRenderer } from 'dockview-core';
import { SolidPanelView } from './dockview/SolidPanelView';
import { GraphPanel } from './panels/GraphPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { OutlinePanel } from './panels/OutlinePanel';

// Dockview の component name と SolidJS Panel のマッピング。
// 詳細: ../../Documentation/ScenarioEditor/07_window-system.md §3
const PANEL_REGISTRY = {
  graph: GraphPanel,
  inspector: InspectorPanel,
  outline: OutlinePanel,
} as const;

type PanelName = keyof typeof PANEL_REGISTRY;

function isPanelName(name: string): name is PanelName {
  return name in PANEL_REGISTRY;
}

// 既存の `index.ts` (PoC-I で配置した placeholder) の再エクスポートも保つ。
export const FRONTEND_VERSION = '0.0.0';

export const App: Component = () => {
  let host: HTMLDivElement | undefined;
  let api: DockviewApi | undefined;

  onMount(() => {
    if (!host) return;

    api = createDockview(host, {
      className: 'dockview-theme-light',
      createComponent: (options: CreateComponentOptions): IContentRenderer => {
        if (!isPanelName(options.name)) {
          throw new Error(`Unknown Dockview component: ${options.name}`);
        }
        return new SolidPanelView(PANEL_REGISTRY[options.name]);
      },
    });

    // 初期レイアウト:
    //   ┌──────────────┬────────────┐
    //   │              │            │
    //   │    Graph     │ Inspector  │
    //   │              │            │
    //   ├──────────────┴────────────┤
    //   │         Outline           │
    //   └──────────────────────────-┘
    api.addPanel({ id: 'graph-1', component: 'graph', title: 'Graph' });
    api.addPanel({
      id: 'inspector-1',
      component: 'inspector',
      title: 'Inspector',
      position: { referencePanel: 'graph-1', direction: 'right' },
    });
    api.addPanel({
      id: 'outline-1',
      component: 'outline',
      title: 'Outline',
      position: { referencePanel: 'graph-1', direction: 'below' },
    });
  });

  onCleanup(() => {
    api?.dispose();
  });

  return <div class="app-shell" ref={host} />;
};

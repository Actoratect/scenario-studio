import { lazy, onCleanup, onMount } from 'solid-js';
import type { Component } from 'solid-js';
import { createDockview } from 'dockview-core';
import type { CreateComponentOptions, DockviewApi, IContentRenderer } from 'dockview-core';
import { SolidPanelView } from './dockview/SolidPanelView';
import { GraphPanel } from './panels/GraphPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { ProjectService } from './services/ProjectService';

// プロジェクトが open されている時の Dockview ベースのワークスペース。
// PoC-A の App.tsx 中身を抽出 + ScriptPanel / BenchmarkPanel を lazy() に分割
// (M1 で初期 bundle を ScriptPanel/BenchmarkPanel ぶん減らす)。
// 詳細: ../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1

// 重い Panel は dynamic import で別 chunk に。
const ScriptPanel = lazy(() =>
  import('./panels/ScriptPanel').then((m) => ({ default: m.ScriptPanel })),
);
const BenchmarkPanel = lazy(() =>
  import('./panels/BenchmarkPanel').then((m) => ({ default: m.BenchmarkPanel })),
);

// Dockview の component name と Solid Panel のマッピング。
// 詳細: ../../Documentation/ScenarioEditor/07_window-system.md §3
const PANEL_REGISTRY = {
  graph: GraphPanel,
  inspector: InspectorPanel,
  outline: OutlinePanel,
  script: ScriptPanel,
  bench: BenchmarkPanel,
} as const;

type PanelName = keyof typeof PANEL_REGISTRY;
function isPanelName(name: string): name is PanelName {
  return name in PANEL_REGISTRY;
}

export const WorkspaceShell: Component = () => {
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
    api.addPanel({
      id: 'script-1',
      component: 'script',
      title: 'Script: s01_opening',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    api.addPanel({
      id: 'bench-1',
      component: 'bench',
      title: 'Graph Bench (PoC-B)',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
  });

  onCleanup(() => {
    api?.dispose();
  });

  return (
    <div class="workspace">
      <header class="workspace-header">
        <span class="workspace-title">
          {ProjectService.currentProject()?.project.settings.name ?? 'Scenario Studio'}
        </span>
        <button class="workspace-close" onClick={() => ProjectService.close()}>
          プロジェクトを閉じる
        </button>
      </header>
      <div class="app-shell" ref={host} />
    </div>
  );
};

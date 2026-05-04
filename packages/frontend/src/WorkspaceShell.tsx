import { lazy, onCleanup, onMount } from 'solid-js';
import type { Component } from 'solid-js';
import { createDockview } from 'dockview-core';
import type { CreateComponentOptions, DockviewApi, IContentRenderer } from 'dockview-core';
import { SolidPanelView } from './dockview/SolidPanelView';
import { AiPanel } from './panels/AiPanel';
import { ConsolePanel } from './panels/ConsolePanel';
import { GlossaryPanel } from './panels/GlossaryPanel';
import { GraphPanel } from './panels/GraphPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { PlotTimelinePanel } from './panels/PlotTimelinePanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { StatsPanel } from './panels/StatsPanel';
import { SynopsisPanel } from './panels/SynopsisPanel';
import { CommandPalette } from './global/CommandPalette';
import { EraSlider } from './global/EraSlider';
import { ExportDialog } from './global/ExportDialog';
import { OnboardingBanner } from './global/OnboardingBanner';
import { SaveStatusBadge } from './global/SaveStatusBadge';
import { SearchOverlay } from './global/SearchOverlay';
import { ShortcutsOverlay } from './global/ShortcutsOverlay';
import { PanelFocus } from './services/PanelFocus';
import { ProjectService } from './services/ProjectService';
import { disposeSaveScheduler, useSaveScheduler } from './services/save-scheduler-binding';
import { Toast } from './services/Toast';

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
  synopsis: SynopsisPanel,
  script: ScriptPanel,
  bench: BenchmarkPanel,
  console: ConsolePanel,
  glossary: GlossaryPanel,
  ai: AiPanel,
  settings: SettingsPanel,
  timeline: PlotTimelinePanel,
  stats: StatsPanel,
} as const;

type PanelName = keyof typeof PANEL_REGISTRY;
function isPanelName(name: string): name is PanelName {
  return name in PANEL_REGISTRY;
}

export const WorkspaceShell: Component = () => {
  let host: HTMLDivElement | undefined;
  let api: DockviewApi | undefined;

  // 起動時に SaveScheduler を初期化 (lazy 生成だが、close 時に dispose したいので参照を持つ)
  useSaveScheduler();

  function onKeydown(e: KeyboardEvent): void {
    const meta = e.ctrlKey || e.metaKey;
    if (!meta) return;
    const ctx = ProjectService.currentProject();
    // Cmd+K: コマンド/検索 palette (project が無くても開けるが候補は空になる)
    if (e.key === 'k') {
      e.preventDefault();
      CommandPalette.toggle();
      return;
    }
    // Cmd+/ (Slash): ショートカット一覧
    if (e.key === '/') {
      e.preventDefault();
      ShortcutsOverlay.toggle();
      return;
    }
    // Cmd+F: 全文検索
    if (e.key === 'f') {
      e.preventDefault();
      SearchOverlay.toggle();
      return;
    }
    if (!ctx) return;
    // Cmd+S: 即時 flush
    if (e.key === 's') {
      e.preventDefault();
      const sched = useSaveScheduler();
      sched.flushAll();
      Toast.success('保存しました', 1500);
      return;
    }
    // Cmd+E: Export ダイアログ
    if (e.key === 'e') {
      e.preventDefault();
      ExportDialog.toggle();
      return;
    }
    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      ctx.history.undo();
    } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
      e.preventDefault();
      ctx.history.redo();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onKeydown);
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
    PanelFocus.register(api);

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
      id: 'synopsis-1',
      component: 'synopsis',
      title: 'Synopsis',
      position: { referencePanel: 'outline-1', direction: 'within' },
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
    api.addPanel({
      id: 'glossary-1',
      component: 'glossary',
      title: 'Glossary',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    api.addPanel({
      id: 'console-1',
      component: 'console',
      title: 'Console',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    api.addPanel({
      id: 'ai-1',
      component: 'ai',
      title: 'AI',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    api.addPanel({
      id: 'settings-1',
      component: 'settings',
      title: 'Settings',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    api.addPanel({
      id: 'timeline-1',
      component: 'timeline',
      title: 'Plot Timeline',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    api.addPanel({
      id: 'stats-1',
      component: 'stats',
      title: 'Stats',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
  });

  onCleanup(() => {
    window.removeEventListener('keydown', onKeydown);
    disposeSaveScheduler();
    PanelFocus.unregister();
    api?.dispose();
  });

  return (
    <div class="workspace">
      <header class="workspace-header">
        <span class="workspace-title">
          {ProjectService.currentProject()?.project.settings.name ?? 'Scenario Studio'}
        </span>
        <EraSlider />
        <SaveStatusBadge />
        <button
          class="workspace-export"
          onClick={() => ShortcutsOverlay.show()}
          title="ショートカット一覧 (Cmd+/)"
        >
          ⌨
        </button>
        <button
          class="workspace-export"
          onClick={() => ExportDialog.show()}
          title="脚本を text / Markdown に書き出し (Cmd+E)"
        >
          ⤓ Export
        </button>
        <button class="workspace-close" onClick={() => ProjectService.close()}>
          プロジェクトを閉じる
        </button>
      </header>
      <OnboardingBanner />
      <div class="app-shell" ref={host} />
    </div>
  );
};

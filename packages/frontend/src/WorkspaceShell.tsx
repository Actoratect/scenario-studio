import { lazy, onCleanup, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { createDockview } from 'dockview-core';
import type { CreateComponentOptions, DockviewApi, IContentRenderer } from 'dockview-core';
import { SolidPanelView } from './dockview/SolidPanelView';
import { AiPanel } from './panels/AiPanel';
import { ConsolePanel } from './panels/ConsolePanel';
import { EraTimelinePanel } from './panels/EraTimelinePanel';
import { GlossaryPanel } from './panels/GlossaryPanel';
import { GraphPanel } from './panels/GraphPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { PlotTimelinePanel } from './panels/PlotTimelinePanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { StatsPanel } from './panels/StatsPanel';
import { SynopsisPanel } from './panels/SynopsisPanel';
import { AboutOverlay } from './global/AboutOverlay';
import { AiSummaryOverlay } from './global/AiSummaryOverlay';
import { CommandPalette } from './global/CommandPalette';
import { EraSlider } from './global/EraSlider';
import { ExportDialog } from './global/ExportDialog';
import { IdListOverlay } from './global/IdListOverlay';
import { LocalAgentHandoffOverlay } from './global/LocalAgentHandoffOverlay';
import { OnboardingBanner } from './global/OnboardingBanner';
import { ProjectHealthOverlay } from './global/ProjectHealthOverlay';
import { SaveStatusBadge } from './global/SaveStatusBadge';
import { SearchOverlay } from './global/SearchOverlay';
import { ShortcutsOverlay } from './global/ShortcutsOverlay';
import { PanelFocus } from './services/PanelFocus';
import { ProjectHealth } from './services/ProjectHealth';
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
  'era-timeline': EraTimelinePanel,
} as const;

type PanelName = keyof typeof PANEL_REGISTRY;
function isPanelName(name: string): name is PanelName {
  return name in PANEL_REGISTRY;
}

// PR-AG: Dockview layout persistence
const LAYOUT_STORAGE_KEY = 'scenario-studio:dockview-layout';

function loadSavedLayout(): unknown | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function saveLayout(layout: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* quota / private mode */
  }
}

function clearSavedLayout(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
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
    // Cmd+I: ID 一覧
    if (e.key === 'i') {
      e.preventDefault();
      IdListOverlay.toggle();
      return;
    }
    // PR-AJ: Cmd+Shift+A — AI シーン要約 (現在選択中の scene について)
    if (e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      AiSummaryOverlay.show();
      return;
    }
    // PR-AU: Cmd+Shift+H — Local Agent Handoff
    if (e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      LocalAgentHandoffOverlay.show();
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

  function buildDefaultLayout(a: DockviewApi): void {
    a.addPanel({ id: 'graph-1', component: 'graph', title: '🕸 グラフ' });
    a.addPanel({
      id: 'inspector-1',
      component: 'inspector',
      title: '📝 インスペクタ',
      position: { referencePanel: 'graph-1', direction: 'right' },
    });
    a.addPanel({
      id: 'outline-1',
      component: 'outline',
      title: '📚 アウトライン',
      position: { referencePanel: 'graph-1', direction: 'below' },
    });
    a.addPanel({
      id: 'synopsis-1',
      component: 'synopsis',
      title: '📖 あらすじ',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    a.addPanel({
      id: 'script-1',
      component: 'script',
      title: '🎬 脚本',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    a.addPanel({
      id: 'bench-1',
      component: 'bench',
      title: '🧪 ベンチ',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    a.addPanel({
      id: 'glossary-1',
      component: 'glossary',
      title: '📘 用語集',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    a.addPanel({
      id: 'console-1',
      component: 'console',
      title: '⚠ コンソール',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    a.addPanel({
      id: 'ai-1',
      component: 'ai',
      title: '🤖 AI',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    a.addPanel({
      id: 'settings-1',
      component: 'settings',
      title: '⚙ 設定',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    a.addPanel({
      id: 'timeline-1',
      component: 'timeline',
      title: '🗂 プロット',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    a.addPanel({
      id: 'stats-1',
      component: 'stats',
      title: '📊 統計',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
    a.addPanel({
      id: 'era-timeline-1',
      component: 'era-timeline',
      title: '⏳ Era 年表',
      position: { referencePanel: 'outline-1', direction: 'within' },
    });
  }

  /** PR-AG: Dock layout を default に戻す (workspace ヘッダから) */
  function resetLayout(): void {
    if (!api) return;
    if (!window.confirm('Dockview レイアウトを初期状態に戻しますか?')) return;
    clearSavedLayout();
    api.clear();
    buildDefaultLayout(api);
    Toast.success('レイアウトを初期化しました');
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

    // PR-AG: 保存済 layout があればそれを復元、無ければ default を構築
    const saved = loadSavedLayout();
    let restored = false;
    if (saved && typeof saved === 'object') {
      try {
        api.fromJSON(saved as Parameters<DockviewApi['fromJSON']>[0]);
        restored = api.panels.length > 0;
      } catch (e) {
        console.warn('saved layout restore failed, falling back to default', e);
      }
    }
    if (!restored) buildDefaultLayout(api);

    // 以後の任意 layout 変化を localStorage に保存 (debounced)
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const persist = (): void => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (api) saveLayout(api.toJSON());
      }, 400);
    };
    api.onDidLayoutChange(persist);
    api.onDidAddPanel(persist);
    api.onDidRemovePanel(persist);
    api.onDidActivePanelChange(persist);
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
          class="workspace-export workspace-health"
          classList={{
            'workspace-health--has-error': ProjectHealth.snapshot().counts.error > 0,
            'workspace-health--has-warning':
              ProjectHealth.snapshot().counts.error === 0 &&
              ProjectHealth.snapshot().counts.warning > 0,
          }}
          onClick={() => ProjectHealthOverlay.show()}
          title="プロジェクト ヘルス (Lint / 不足項目 / 章別 進捗)"
        >
          🩺
          <Show
            when={
              ProjectHealth.snapshot().counts.error + ProjectHealth.snapshot().counts.warning > 0
            }
          >
            <span class="workspace-health-badge">
              {ProjectHealth.snapshot().counts.error + ProjectHealth.snapshot().counts.warning}
            </span>
          </Show>
        </button>
        <button
          class="workspace-export"
          onClick={() => LocalAgentHandoffOverlay.show()}
          title="ローカル AI に依頼 (Cmd+Shift+H)"
        >
          🤝
        </button>
        <button
          class="workspace-export"
          onClick={() => ShortcutsOverlay.show()}
          title="ショートカット一覧 (Cmd+/)"
        >
          ⌨
        </button>
        <button
          class="workspace-export"
          onClick={() => AboutOverlay.show()}
          title="このアプリについて / Help"
        >
          ?
        </button>
        <button
          class="workspace-export"
          onClick={() => ExportDialog.show()}
          title="脚本を text / Markdown に書き出し (Cmd+E)"
        >
          ⤓ Export
        </button>
        <button
          class="workspace-export"
          onClick={resetLayout}
          title="Dockview レイアウトを初期状態に戻す"
        >
          ⟳
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

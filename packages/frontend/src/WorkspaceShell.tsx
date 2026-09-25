import { createSignal, lazy, onCleanup, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { createDockview } from 'dockview-core';
import type {
  CreateComponentOptions,
  DockviewApi,
  IContentRenderer,
  IDockviewPanel,
  IGroupHeaderProps,
  IHeaderActionsRenderer,
} from 'dockview-core';
import { ContextMenu } from '@scenario-studio/ui-kit';
import type { ContextMenuEntry } from '@scenario-studio/ui-kit';
import { SolidPanelView } from './dockview/SolidPanelView';
import { AiPanel } from './panels/AiPanel';
import { ConsolePanel } from './panels/ConsolePanel';
import { EraTimelinePanel } from './panels/EraTimelinePanel';
import { GraphPanel } from './panels/GraphPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { PlotTimelinePanel } from './panels/PlotTimelinePanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { StatsPanel } from './panels/StatsPanel';
import { SynopsisPanel } from './panels/SynopsisPanel';
import { AboutOverlay } from './global/AboutOverlay';
import { AiPatchQueueOverlay } from './global/AiPatchQueueOverlay';
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
import { UnityReadinessOverlay } from './global/UnityReadinessOverlay';
import { PanelFocus } from './services/PanelFocus';
import { AiPatchQueue } from './services/AiPatchQueue';
import { DirtyTracker } from './services/DirtyTracker';
import { FontScaleService } from './services/FontScale';
import { GlobalHistoryService } from './services/GlobalHistoryService';
import { PanelPinService } from './services/PanelPinService';
import { PlotBoardService } from './services/PlotBoardService';
import { ProjectHealth } from './services/ProjectHealth';
import { ProjectService } from './services/ProjectService';
import { disposeSaveScheduler, useSaveScheduler } from './services/save-scheduler-binding';
import { Toast } from './services/Toast';
import { GraphPositions } from './graph/graph-positions';
import { GraphComments } from './graph/graph-comments';
import { PlotFlowEdges } from './graph/plot-flow-edges';
import { RelationsService } from './services/RelationsService';

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

const PANEL_TITLES: Record<PanelName, string> = {
  graph: '🕸 グラフ',
  inspector: '📝 インスペクタ',
  outline: '📚 アウトライン',
  synopsis: '📖 あらすじ',
  script: '🎬 脚本',
  bench: '🧪 ベンチ',
  console: '⚠ コンソール',
  ai: '🤖 AI',
  settings: '⚙ 設定',
  timeline: '🗂 プロット',
  stats: '📊 統計',
  'era-timeline': '⏳ 時間軸 年表',
};

const ADDABLE_PANELS: readonly PanelName[] = [
  'graph',
  'outline',
  'script',
  'inspector',
  'synopsis',
  'timeline',
  'era-timeline',
  'stats',
  'ai',
  'console',
  'settings',
  'bench',
];

function panelNameOf(panel: IDockviewPanel | undefined): PanelName | undefined {
  const name = panel?.view.contentComponent;
  return name && isPanelName(name) ? name : undefined;
}

function panelTitle(name: PanelName, pinned = false): string {
  return pinned ? `📌 ${PANEL_TITLES[name]}` : PANEL_TITLES[name];
}

interface HeaderActionCallbacks {
  addPanel: (name: PanelName, referencePanel?: IDockviewPanel) => void;
  closePanel: (panel: IDockviewPanel) => void;
  togglePin: (panel: IDockviewPanel) => void;
}

class WorkspaceHeaderActions implements IHeaderActionsRenderer {
  readonly element = document.createElement('div');
  private params: IGroupHeaderProps | undefined;
  private activeDisposable: { dispose(): void } | undefined;
  private open = false;

  constructor(private readonly callbacks: HeaderActionCallbacks) {
    this.element.className = 'workspace-panel-actions';
  }

  init(params: IGroupHeaderProps): void {
    this.params = params;
    this.activeDisposable = params.api.onDidActivePanelChange(() => this.render());
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.render();
  }

  dispose(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.activeDisposable?.dispose();
    this.element.replaceChildren();
  }

  private readonly onDocumentPointerDown = (e: PointerEvent): void => {
    if (!this.open) return;
    if (e.target && this.element.contains(e.target as Node)) return;
    this.open = false;
    this.render();
  };

  private closeMenu(): void {
    this.open = false;
    this.render();
  }

  private addMenuButton(
    parent: HTMLElement,
    label: string,
    onClick: () => void,
    options: { title?: string; danger?: boolean; disabled?: boolean } = {},
  ): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (options.title) button.title = options.title;
    if (options.danger) button.classList.add('workspace-panel-menu-danger');
    button.disabled = options.disabled === true;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (button.disabled) return;
      onClick();
      this.closeMenu();
    });
    parent.appendChild(button);
  }

  private addSeparator(parent: HTMLElement): void {
    const sep = document.createElement('span');
    sep.className = 'workspace-panel-menu-separator';
    parent.appendChild(sep);
  }

  private render(): void {
    this.element.replaceChildren();
    const active = this.params?.group.activePanel;
    const activeName = panelNameOf(active);

    if (active && (activeName === 'script' || activeName === 'inspector')) {
      const pinned =
        activeName === 'script'
          ? PanelPinService.isScriptPinned(active.id)
          : PanelPinService.isInspectorPinned(active.id);
      const pinButton = document.createElement('button');
      pinButton.type = 'button';
      pinButton.className = 'workspace-panel-pin-button';
      pinButton.classList.toggle('workspace-panel-pin-button--active', pinned);
      pinButton.textContent = pinned ? '📌' : '📍';
      pinButton.title = pinned ? 'ピン解除' : 'ピン止め';
      pinButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.togglePin(active);
        this.render();
      });
      this.element.appendChild(pinButton);
    }

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'workspace-panel-menu-button';
    menuButton.textContent = '☰';
    menuButton.title = 'ウィンドウメニュー';
    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.open = !this.open;
      this.render();
    });
    this.element.appendChild(menuButton);

    if (!this.open) return;
    const menu = document.createElement('div');
    menu.className = 'workspace-panel-menu';

    if (active && activeName) {
      this.addMenuButton(menu, '同じウィンドウを追加', () =>
        this.callbacks.addPanel(activeName, active),
      );
      this.addSeparator(menu);
    }

    for (const name of ADDABLE_PANELS) {
      this.addMenuButton(menu, `追加: ${PANEL_TITLES[name]}`, () =>
        this.callbacks.addPanel(name, active),
      );
    }

    if (active && (activeName === 'script' || activeName === 'inspector')) {
      const pinned =
        activeName === 'script'
          ? PanelPinService.isScriptPinned(active.id)
          : PanelPinService.isInspectorPinned(active.id);
      this.addSeparator(menu);
      this.addMenuButton(menu, pinned ? 'ピン解除' : 'ピン止め', () =>
        this.callbacks.togglePin(active),
      );
    }

    if (active) {
      this.addSeparator(menu);
      this.addMenuButton(menu, '閉じる', () => this.callbacks.closePanel(active), {
        danger: true,
      });
    }

    this.element.appendChild(menu);

    // 画面下部のグループでメニューが見切れないよう、トリガー位置に応じて
    // 上下の出し分け + 利用可能高さに max-height を合わせる (内部は overflow:auto)。
    const btnRect = menuButton.getBoundingClientRect();
    const gap = 8;
    const spaceBelow = window.innerHeight - btnRect.bottom - gap;
    const spaceAbove = btnRect.top - gap;
    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      menu.style.top = 'auto';
      menu.style.bottom = 'calc(100% + 2px)';
      menu.style.maxHeight = `${Math.max(160, Math.floor(spaceAbove))}px`;
    } else {
      menu.style.maxHeight = `${Math.max(160, Math.floor(spaceBelow))}px`;
    }
  }
}

// PR-AG: Dockview layout persistence
const LAYOUT_STORAGE_KEY = 'scenario-studio:dockview-layout';
const LAYOUT_VERSION_KEY = 'scenario-studio:dockview-layout-version';
// パネル構成や既定レイアウトを変えたらこの版数を上げる。版数が一致しない古い保存
// レイアウトは破棄して既定で開き直すため、アプリ更新後にレイアウトが崩れたまま
// 復元される問題を防ぐ。
// v3: P1 dogfood — 上段 [グラフ | インスペクタ | アウトライン] / 下段 [ツール群 | 脚本] に変更
const LAYOUT_VERSION = 3;

function loadSavedLayout(): unknown | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    if (Number(localStorage.getItem(LAYOUT_VERSION_KEY)) !== LAYOUT_VERSION) {
      // 旧版の保存レイアウトは現行のパネル構成と互換が無いので破棄する。
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
      localStorage.removeItem(LAYOUT_VERSION_KEY);
      return undefined;
    }
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
    localStorage.setItem(LAYOUT_VERSION_KEY, String(LAYOUT_VERSION));
  } catch {
    /* quota / private mode */
  }
}

function clearSavedLayout(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    localStorage.removeItem(LAYOUT_VERSION_KEY);
  } catch {
    /* ignore */
  }
}

export const WorkspaceShell: Component = () => {
  let host: HTMLDivElement | undefined;
  let api: DockviewApi | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let toolsMenu: HTMLDetailsElement | undefined;
  const [maximized, setMaximized] = createSignal(false);

  function toggleFocus(): void {
    if (!api) return;
    if (api.hasMaximizedGroup()) api.exitMaximizedGroup();
    else if (api.activePanel) api.maximizeGroup(api.activePanel);
  }

  function dismissTools(e: PointerEvent | KeyboardEvent): void {
    if (!toolsMenu?.open) return;
    if (e instanceof KeyboardEvent) {
      if (e.key === 'Escape') {
        toolsMenu.open = false;
        toolsMenu.querySelector('summary')?.focus();
      }
    } else if (e.target instanceof Node && !toolsMenu.contains(e.target)) {
      toolsMenu.open = false;
    }
  }

  // 起動時に SaveScheduler を初期化 (lazy 生成だが、close 時に dispose したいので参照を持つ)
  useSaveScheduler();

  function pendingCount(): number {
    return (
      DirtyTracker.count() +
      useSaveScheduler().pendingCount +
      [PlotBoardService, GraphPositions, GraphComments, PlotFlowEdges, RelationsService].filter(
        (service) => service.hasPending(),
      ).length
    );
  }

  /**
   * Cmd+S / 保存ボタンから呼ぶ。Node 編集 + ファイル編集 + プロットボードを flush する。
   * ノード保存も await してから結果を報告する (旧実装は fire-and-forget で、書込前に
   * 「保存しました」と出し、失敗・競合スキップも成功件数に含めていた)。
   */
  async function saveAllDirty(): Promise<{ saved: number; failed: number; skipped: number }> {
    const sched = useSaveScheduler();
    const [nodeResult, fileResult, ...graphResults] = await Promise.all([
      sched.flushAllAsync(),
      DirtyTracker.flushAll(),
      ...[PlotBoardService, GraphPositions, GraphComments, PlotFlowEdges, RelationsService].map(
        (service) => service.flushPending(),
      ),
    ]);
    const totalSaved =
      nodeResult.saved + fileResult.saved + graphResults.reduce((n, r) => n + r.saved, 0);
    const totalFailed =
      nodeResult.failed + fileResult.failed + graphResults.reduce((n, r) => n + r.failed, 0);
    // 競合で温存された (外部変更を上書きしなかった) 件数。未保存のまま残っている。
    const totalSkipped = nodeResult.skipped + fileResult.skipped;
    if (totalFailed > 0) {
      const errors = [...nodeResult.errors, ...fileResult.errors];
      const detail = errors.length > 0 ? ` (${errors.join(' / ')})` : '';
      const skip = totalSkipped > 0 ? ` / スキップ ${totalSkipped} 件` : '';
      Toast.error(`保存失敗: ${totalFailed} 件${detail}${skip}`);
    } else if (totalSkipped > 0) {
      Toast.warning(
        `保存 ${totalSaved} 件 / スキップ ${totalSkipped} 件 — 外部変更を温存したため未保存のまま残っています`,
        6000,
      );
    } else if (totalSaved > 0) {
      Toast.success(`保存しました (${totalSaved} 件)`, 1500);
    } else {
      Toast.info('変更はありません', 1200);
    }
    return { saved: totalSaved, failed: totalFailed, skipped: totalSkipped };
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest('.ss-script-visual')) return false;
    const tag = target.tagName.toLowerCase();
    return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  function onKeydown(e: KeyboardEvent): void {
    const meta = e.ctrlKey || e.metaKey;
    if (!meta || e.isComposing) return;
    const key = e.key.toLowerCase();
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
    // PR-AY: Cmd+Shift+Q — AI Patch Queue
    if (e.shiftKey && e.key.toLowerCase() === 'q') {
      e.preventDefault();
      AiPatchQueueOverlay.toggle();
      return;
    }
    if (!ctx) return;
    // Cmd+S: 全 dirty を保存
    if (e.key === 's') {
      e.preventDefault();
      void saveAllDirty();
      return;
    }
    // Cmd+E: Export ダイアログ
    if (e.key === 'e') {
      e.preventDefault();
      ExportDialog.toggle();
      return;
    }
    if (key === 'z' && !e.shiftKey) {
      if (isEditableTarget(e.target)) return;
      if (!GlobalHistoryService.canUndo()) return;
      e.preventDefault();
      void undoWithNotice('undo');
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      if (isEditableTarget(e.target)) return;
      if (!GlobalHistoryService.canRedo()) return;
      e.preventDefault();
      void undoWithNotice('redo');
    }
  }

  /**
   * Undo/Redo を実行し「何を取り消したか」を Toast で通知する。
   * 非表示パネル (背面タブのプロットボード等) の変更が無言で巻き戻る問題への対処。
   */
  async function undoWithNotice(direction: 'undo' | 'redo'): Promise<void> {
    const applied =
      direction === 'undo' ? await GlobalHistoryService.undo() : await GlobalHistoryService.redo();
    const verb = direction === 'undo' ? '元に戻す' : 'やり直す';
    if (!applied) {
      Toast.info(
        direction === 'undo' ? '取り消せる操作がありません' : 'やり直せる操作がありません',
        1500,
      );
      return;
    }
    const label =
      applied.label ??
      (applied.domain === 'project'
        ? 'ノードの編集'
        : applied.domain === 'script'
          ? '脚本の編集'
          : 'プロットボードの変更');
    Toast.info(`${verb}: ${label}`, 1800);
  }

  function nextPanelId(name: PanelName): string {
    if (!api) return `${name}-${Date.now().toString(36)}`;
    for (let i = 1; i < 1000; i += 1) {
      const id = `${name}-${i}`;
      if (!api.getPanel(id)) return id;
    }
    return `${name}-${Date.now().toString(36)}`;
  }

  function addWorkspacePanel(name: PanelName, referencePanel?: IDockviewPanel): string | undefined {
    if (!api) return undefined;
    const id = nextPanelId(name);
    if (referencePanel) {
      api.addPanel({
        id,
        component: name,
        title: panelTitle(name),
        position: { referencePanel, direction: 'within' },
      });
    } else {
      api.addPanel({ id, component: name, title: panelTitle(name) });
    }
    return id;
  }

  function closeWorkspacePanel(panel: IDockviewPanel): void {
    PanelPinService.clearPanel(panel.id);
    panel.api.close();
  }

  // タブ右クリックでコンテキストメニューを表示 (07_window-system.md §4.4)。
  // 旧実装は警告なしの即クローズで、誤右クリックでタブ配置が壊れていた。
  // dockview の既定タブは data-testid にパネル id を入れているのでそれで解決する。
  function onTabContextMenu(e: MouseEvent): void {
    if (!api) return;
    const tab = (e.target as HTMLElement | null)?.closest<HTMLElement>('.dv-tab');
    const id = tab?.getAttribute('data-testid');
    if (!id) return;
    const panel = api.getPanel(id);
    if (!panel) return;
    e.preventDefault();
    const name = panelNameOf(panel);
    const title = panel.title ?? id;
    const entries: ContextMenuEntry[] = [];
    if (name === 'script' || name === 'inspector') {
      const pinned =
        name === 'script'
          ? PanelPinService.isScriptPinned(panel.id)
          : PanelPinService.isInspectorPinned(panel.id);
      entries.push({
        id: 'pin',
        label: pinned ? 'ピン止めを解除' : 'ピン止め (選択に追従しない)',
        icon: '📌',
        onSelect: () => togglePanelPin(panel),
      });
    }
    if (name) {
      entries.push({
        id: 'duplicate',
        label: '同じ種類のパネルを追加',
        icon: '➕',
        onSelect: () => void addWorkspacePanel(name, panel),
      });
    }
    if (entries.length > 0) entries.push({ kind: 'separator' });
    entries.push({
      id: 'close-others',
      label: 'このグループの他のタブを閉じる',
      onSelect: () => {
        const others = api ? api.panels.filter((p) => p.group === panel.group && p !== panel) : [];
        for (const p of others) closeWorkspacePanel(p);
        if (others.length > 0) Toast.info(`${others.length} 個のタブを閉じました`, 1800);
      },
    });
    entries.push({
      id: 'close',
      label: `「${title}」を閉じる`,
      variant: 'danger',
      onSelect: () => closeWorkspacePanel(panel),
    });
    ContextMenu.show(e, entries, `タブ: ${title}`);
  }

  function togglePanelPin(panel: IDockviewPanel): void {
    const name = panelNameOf(panel);
    if (name === 'inspector') {
      const wasPinned = PanelPinService.isInspectorPinned(panel.id);
      const pinned = PanelPinService.toggleInspector(panel.id);
      if (!wasPinned && !pinned) {
        Toast.info('ピン止めするノードを選択してください', 1800);
        return;
      }
      panel.setTitle(panelTitle(name, pinned));
      return;
    }
    if (name === 'script') {
      const wasPinned = PanelPinService.isScriptPinned(panel.id);
      const pinned = PanelPinService.toggleScript(panel.id);
      if (!wasPinned && !pinned) {
        Toast.info('ピン止めするシーンを選択してください', 1800);
        return;
      }
      panel.setTitle(panelTitle(name, pinned));
    }
  }

  /**
   * 既定は全高の3列。中央の作業をタブで切り替え、補助パネルは必要時に追加する。
   * 保存済みレイアウトは維持し、新規起動と明示的な初期化にだけ適用する。
   */
  function buildDefaultLayout(a: DockviewApi): void {
    a.addPanel({ id: 'graph-1', component: 'graph', title: panelTitle('graph') });
    a.addPanel({
      id: 'inspector-1',
      component: 'inspector',
      title: panelTitle('inspector'),
      position: { referencePanel: 'graph-1', direction: 'right' },
    });
    a.addPanel({
      id: 'outline-1',
      component: 'outline',
      title: panelTitle('outline'),
      position: { referencePanel: 'graph-1', direction: 'left' },
    });
    const toolTabs: readonly PanelName[] = ['script', 'synopsis', 'timeline'];
    for (const name of toolTabs) {
      a.addPanel({
        id: `${name}-1`,
        component: name,
        title: panelTitle(name),
        position: { referencePanel: 'graph-1', direction: 'within' },
      });
    }
    const w = host?.clientWidth ?? 1440;
    a.getPanel('outline-1')?.api.setSize({ width: Math.round(Math.min(260, w * 0.2)) });
    a.getPanel('inspector-1')?.api.setSize({ width: Math.round(Math.min(430, w * 0.3)) });
    a.getPanel('graph-1')?.api.setActive();
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

  /**
   * 「プロジェクトを閉じる」の安全フロー。
   * 旧実装は「OK = 破棄して閉じる」が既定 (Enter) という危険なデフォルトで、
   * 件数算出も PlotBoard を数え漏らして beforeunload と食い違っていた。
   * 新フロー: OK = 保存して閉じる (安全側が既定)。保存に失敗 / スキップが残った
   * 場合は破棄してよいか改めて確認する。
   */
  async function closeProjectSafely(): Promise<void> {
    const dirty = pendingCount();
    if (dirty > 0) {
      if (
        window.confirm(
          `未保存の変更が ${dirty} 件あります。保存してから閉じますか?\n\n[OK] 保存して閉じる\n[キャンセル] 保存しない`,
        )
      ) {
        const result = await saveAllDirty();
        const remain = Math.max(result.failed + result.skipped, pendingCount());
        if (
          remain > 0 &&
          !window.confirm(
            `${remain} 件が保存できていません (失敗 ${result.failed} / 競合スキップ ${result.skipped})。破棄して閉じますか?`,
          )
        ) {
          return;
        }
      } else if (!window.confirm('保存せずに閉じますか? (未保存の変更は失われます)')) {
        return;
      }
    }
    ProjectService.close();
  }

  /** ブラウザ閉じ・タブリロード時の未保存ガード (PR: ux-overhaul)。 */
  function onBeforeUnload(e: BeforeUnloadEvent): void {
    const dirty = pendingCount();
    if (dirty > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('pointerdown', dismissTools);
    document.addEventListener('keydown', dismissTools);
    if (!host) return;
    api = createDockview(host, {
      className: 'dockview-theme-light',
      createRightHeaderActionComponent: () =>
        new WorkspaceHeaderActions({
          addPanel: addWorkspacePanel,
          closePanel: closeWorkspacePanel,
          togglePin: togglePanelPin,
        }),
      createComponent: (options: CreateComponentOptions): IContentRenderer => {
        if (!isPanelName(options.name)) {
          // 廃止された panel (例: glossary) が localStorage 由来で復元しようとされた場合は
          // 「削除済」placeholder で安全に descend する。Dockview は close() で消せる。
          console.warn(
            `[WorkspaceShell] unknown panel "${options.name}" — placeholder で表示します。タブを閉じてください。`,
          );
          return new SolidPanelView(() => (
            <div class="panel-content panel-deprecated">
              <p>このパネル ({options.name}) は廃止されました。</p>
              <p>タブの × で閉じてください。</p>
            </div>
          ));
        }
        return new SolidPanelView(PANEL_REGISTRY[options.name]);
      },
    });
    // component 種別で解決できるよう opener を渡す。ジャンプ先タブを閉じていても
    // 同種パネルへ解決 or 新規追加して自己修復する (無音失敗の解消)。
    PanelFocus.register(api, (component) =>
      isPanelName(component) ? addWorkspacePanel(component) : undefined,
    );
    api.onDidMaximizedGroupChange(() => setMaximized(api?.hasMaximizedGroup() ?? false));

    // PR-AG: 保存済 layout があればそれを復元、無ければ default を構築
    const saved = loadSavedLayout();
    let restored = false;
    if (saved && typeof saved === 'object') {
      try {
        api.fromJSON(saved as Parameters<DockviewApi['fromJSON']>[0]);
        restored = api.panels.length > 0;
      } catch (e) {
        console.warn('saved layout restore failed, falling back to default', e);
        api.clear();
      }
    }
    if (!restored) buildDefaultLayout(api);

    // 以後の任意 layout 変化を localStorage に保存 (debounced)
    const persist = (): void => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (api) saveLayout(api.toJSON());
      }, 400);
    };
    api.onDidLayoutChange(persist);
    api.onDidAddPanel(persist);
    api.onDidRemovePanel((panel) => {
      PanelPinService.clearPanel(panel.id);
      persist();
    });
    api.onDidActivePanelChange(persist);

    host.addEventListener('contextmenu', onTabContextMenu);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('pointerdown', dismissTools);
    document.removeEventListener('keydown', dismissTools);
    host?.removeEventListener('contextmenu', onTabContextMenu);
    if (saveTimer) clearTimeout(saveTimer);
    if (api) saveLayout(api.toJSON());
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
        <button
          class="workspace-save"
          classList={{
            'workspace-save--dirty': pendingCount() > 0,
          }}
          onClick={() => void saveAllDirty()}
          title="変更を保存 (Cmd+S)"
        >
          💾 保存
          <Show when={pendingCount() > 0}>
            <span class="workspace-save-count">{pendingCount()}</span>
          </Show>
        </button>
        <SaveStatusBadge />
        <span class="workspace-history">
          <button
            class="workspace-export workspace-history-btn"
            disabled={!GlobalHistoryService.canUndo()}
            onClick={() => void undoWithNotice('undo')}
            title="全体を戻す (Ctrl+Z)"
          >
            ↶ 戻る
          </button>
          <button
            class="workspace-export workspace-history-btn"
            disabled={!GlobalHistoryService.canRedo()}
            onClick={() => void undoWithNotice('redo')}
            title="全体を進める (Ctrl+Y / Ctrl+Shift+Z)"
          >
            ↷ 進む
          </button>
        </span>
        <button
          class="workspace-export"
          onClick={toggleFocus}
          aria-pressed={maximized()}
          title="選択中の作業パネルを広げる / 元の配置に戻す"
        >
          {maximized() ? '▣ 配置に戻る' : '⛶ 集中表示'}
        </button>
        <button
          class="workspace-export"
          onClick={() => ExportDialog.show()}
          title="脚本を書き出し (Ctrl+E / Cmd+E)"
        >
          ⤓ 書き出し
        </button>
        <details class="workspace-tools" ref={toolsMenu}>
          <summary>ツール・表示</summary>
          <div
            class="workspace-tools-menu"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button') && toolsMenu) toolsMenu.open = false;
            }}
          >
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
              🩺 プロジェクトの状態
              <Show
                when={
                  ProjectHealth.snapshot().counts.error + ProjectHealth.snapshot().counts.warning >
                  0
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
              🤝 ローカル AI に依頼
            </button>
            <button
              class="workspace-export"
              onClick={() => ShortcutsOverlay.show()}
              title="ショートカット一覧 (Cmd+/)"
            >
              ⌨ ショートカット一覧
            </button>
            <button
              class="workspace-export"
              onClick={() => AboutOverlay.show()}
              title="このアプリについて / Help"
            >
              ? ヘルプ・アプリ情報
            </button>
            <button
              class="workspace-export"
              onClick={() => UnityReadinessOverlay.show()}
              title="Unity Readiness — Phase 2 出力前のチェック"
            >
              🎮 Unity 出力の事前確認
            </button>
            <button
              class="workspace-export"
              onClick={() => AiPatchQueueOverlay.show()}
              title="AI Patch Queue (Cmd+Shift+Q)"
            >
              📝 Patch
              {AiPatchQueue.pendingCount() > 0 ? ` (${AiPatchQueue.pendingCount()})` : ''}
            </button>
            <button
              class="workspace-export workspace-font-scale"
              onClick={() => FontScaleService.cycle()}
              title={`フォントサイズ切替 (現在: ${FontScaleService.scale()})`}
            >
              文字サイズ A{' '}
              {FontScaleService.scale() === 'small'
                ? '−'
                : FontScaleService.scale() === 'medium'
                  ? '·'
                  : FontScaleService.scale() === 'large'
                    ? '+'
                    : '++'}
            </button>
            <button
              class="workspace-export"
              onClick={resetLayout}
              title="Dockview レイアウトを初期状態に戻す"
            >
              ⟳ レイアウトを初期化
            </button>
            <button class="workspace-close" onClick={() => void closeProjectSafely()}>
              プロジェクトを閉じる
            </button>
          </div>
        </details>
      </header>
      <OnboardingBanner />
      <div class="app-shell" ref={host} />
    </div>
  );
};

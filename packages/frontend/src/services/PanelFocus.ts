import type { DockviewApi } from 'dockview-core';

// Dockview パネルにフォーカスを当てる手段を WorkspaceShell 外に提供する (PR-R)。
// PlotTimeline / CommandPalette がシーン選択時に Script タブを active にするため。
// グローバル singleton な参照。WorkspaceShell の onMount で register、
// onCleanup で unregister。
// 詳細: ../../../../Documentation/ScenarioEditor/07_window-system.md §3

let api: DockviewApi | undefined;

export const PanelFocus = {
  register(d: DockviewApi): void {
    api = d;
  },
  unregister(): void {
    api = undefined;
  },
  /** 指定 panel id にフォーカス。存在しない場合は no-op。 */
  focus(panelId: string): boolean {
    if (!api) return false;
    const panel = api.getPanel(panelId);
    if (!panel) return false;
    panel.api.setActive();
    return true;
  },
};

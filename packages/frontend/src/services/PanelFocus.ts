import type { DockviewApi } from 'dockview-core';

// Dockview パネルにフォーカスを当てる手段を WorkspaceShell 外に提供する (PR-R)。
// PlotTimeline / CommandPalette がシーン選択時に Script タブを active にするため。
// グローバル singleton な参照。WorkspaceShell の onMount で register、
// onCleanup で unregister。
// 詳細: ../../../../Documentation/ScenarioEditor/07_window-system.md §3

// component 種別 (例: 'script') を受け取り、無ければ新規パネルを追加してその id を返す。
// 未知の component なら undefined。WorkspaceShell の addWorkspacePanel を包んで渡す。
export type PanelOpener = (component: string) => string | undefined;

let api: DockviewApi | undefined;
let opener: PanelOpener | undefined;

// 'script-1' / 'era-timeline-2' 等の panel id から末尾の連番を落として component 名を得る。
function componentOf(panelId: string): string {
  return panelId.replace(/-[^-]+$/, '');
}

export const PanelFocus = {
  register(d: DockviewApi, open?: PanelOpener): void {
    api = d;
    opener = open;
  },
  unregister(): void {
    api = undefined;
    opener = undefined;
  },
  /**
   * 指定 panel id にフォーカス。id が存在しなければ同 component 種別の生存パネルに解決し、
   * それも無ければ opener で新規に開いてから active にする。呼び出し側は初期タブ id
   * ('script-1' 等) をそのまま渡せば、タブを閉じていても自己修復でジャンプできる。
   */
  focus(panelId: string): boolean {
    if (!api) return false;
    const panel = api.getPanel(panelId);
    if (panel) {
      panel.api.setActive();
      return true;
    }
    return PanelFocus.focusComponent(componentOf(panelId));
  },
  /** component 種別でフォーカス。生存パネルが無ければ opener で開く。 */
  focusComponent(component: string): boolean {
    if (!api) return false;
    // 同種の生存パネルを優先 (複数あれば最後に追加されたものを active に)。
    const same = api.panels.filter((p) => p.view.contentComponent === component);
    const existing = same[same.length - 1];
    if (existing) {
      existing.api.setActive();
      return true;
    }
    const id = opener?.(component);
    if (!id) return false;
    const created = api.getPanel(id);
    if (!created) return false;
    created.api.setActive();
    return true;
  },
};

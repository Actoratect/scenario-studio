import { createSignal } from 'solid-js';
import { DirtyTracker } from './DirtyTracker';
import { PanelPinService } from './PanelPinService';
import { PlotSelection } from './PlotSelection';
import { SceneSelection, type SceneRef } from './SceneSelection';
import { ScriptHistoryService } from './ScriptHistoryService';
import { GlobalHistoryService } from './GlobalHistoryService';
import { SceneAppearanceIndex } from './SceneAppearanceIndex';
import { PlotBoardService } from './PlotBoardService';

const [lockedPaths, setLockedPaths] = createSignal<ReadonlySet<string>>(new Set());

export const SceneMutationService = {
  isLocked(path: string): boolean {
    return lockedPaths().has(path);
  },

  /** 名前変更・移動・削除は、同じファイルの脚本とプロットの保存完了後に行う。 */
  async prepare(path: string): Promise<() => void> {
    if (lockedPaths().has(path)) throw new Error('このシーンは変更処理中です');
    setLockedPaths(new Set([...lockedPaths(), path]));
    const release = () => {
      const next = new Set(lockedPaths());
      next.delete(path);
      setLockedPaths(next);
    };
    try {
      const keys = [path, `${path}\u0000plot`];
      const result = await DirtyTracker.flushAll(keys);
      if (result.failed || result.skipped || keys.some((key) => DirtyTracker.dirty().has(key))) {
        throw new Error(
          result.errors.join(' / ') || '未保存の変更があります。保存してから再試行してください',
        );
      }
      return release;
    } catch (e) {
      release();
      throw e;
    }
  },

  /** 開いているタブ・選択・履歴を構造変更後のシーンへ追従させる。 */
  remap(previous: SceneRef, next?: SceneRef): void {
    const matches = (ref: SceneRef | undefined) =>
      ref?.chapterSlug === previous.chapterSlug && ref.sceneSlug === previous.sceneSlug;
    if (matches(SceneSelection.selected())) {
      if (next) SceneSelection.select(next);
      else SceneSelection.clear();
    }
    const plot = PlotSelection.selected();
    if (plot?.kind === 'scene' && matches(plot)) {
      if (next) PlotSelection.select({ ...next, kind: 'scene' });
      else PlotSelection.clear();
    }
    for (const [panelId, ref] of PanelPinService.scriptPins()) {
      if (!matches(ref)) continue;
      if (next) PanelPinService.pinScript(panelId, next);
      else PanelPinService.clearPanel(panelId);
    }
    const path = `Scenarios/${previous.chapterSlug}/${previous.sceneSlug}.scn.yaml`;
    const nextPath = next ? `Scenarios/${next.chapterSlug}/${next.sceneSlug}.scn.yaml` : undefined;
    ScriptHistoryService.remapPath(path, nextPath);
    GlobalHistoryService.remapScriptPath(path, nextPath);
    PlotBoardService.remapSceneReferences(previous, next);
    SceneAppearanceIndex.invalidate();
  },
};

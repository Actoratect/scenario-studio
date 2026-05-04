import { createSignal } from 'solid-js';

// 「現在編集中 / 注目中のシーン」をプロジェクト全体で共有する signal (PR-R)。
// ScriptPanel が購読 → load。PlotTimeline / Outline / CommandPalette などから set。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md

export interface SceneRef {
  chapterSlug: string;
  sceneSlug: string;
  /** 表示用ラベル (省略可、UI 側で再構築可)。 */
  label?: string;
}

const [selected, setSelected] = createSignal<SceneRef | undefined>(undefined);

export const SceneSelection = {
  selected,
  select(ref: SceneRef): void {
    setSelected(ref);
  },
  clear(): void {
    setSelected(undefined);
  },
};

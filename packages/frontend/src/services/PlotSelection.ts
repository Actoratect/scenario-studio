import { createSignal } from 'solid-js';

export type PlotSelectionRef =
  | {
      kind: 'chapter';
      chapterSlug: string;
      label?: string;
    }
  | {
      kind: 'scene';
      chapterSlug: string;
      sceneSlug: string;
      label?: string;
    };

const [selected, setSelected] = createSignal<PlotSelectionRef | undefined>(undefined);

export const PlotSelection = {
  selected,
  select(ref: PlotSelectionRef): void {
    setSelected(ref);
  },
  clear(): void {
    setSelected(undefined);
  },
};

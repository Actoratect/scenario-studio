import { createSignal, createEffect } from 'solid-js';

// PR (ux-overhaul): フォントサイズの可変設定。
// 値は html 要素の data-font-size 属性に反映され、styles.css の :root 変数経由で
// 全体に作用する。localStorage で永続化。

export type FontScale = 'small' | 'medium' | 'large' | 'xlarge';

const STORAGE_KEY = 'scenario-studio:font-scale';

function loadInitial(): FontScale {
  if (typeof localStorage === 'undefined') return 'medium';
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'small' || v === 'medium' || v === 'large' || v === 'xlarge') return v;
  return 'medium';
}

const [scale, setScaleSignal] = createSignal<FontScale>(loadInitial());

// signal 変更を html 属性 + localStorage に反映
createEffect(() => {
  const v = scale();
  if (typeof document !== 'undefined') {
    document.documentElement.dataset['fontSize'] = v;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, v);
  }
});

export const FontScaleService = {
  scale,
  set(v: FontScale): void {
    setScaleSignal(v);
  },
  cycle(): void {
    const order: readonly FontScale[] = ['small', 'medium', 'large', 'xlarge'];
    const cur = scale();
    const idx = order.indexOf(cur);
    const next = order[(idx + 1) % order.length] ?? 'medium';
    setScaleSignal(next);
  },
};

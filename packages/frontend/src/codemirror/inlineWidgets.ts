import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { emotionLabel } from '../script/emotions';

// 脚本エディタ用 inline widget — 行内の `who: <slug>` / `emotion: <tag>` を
// それぞれサムネ円アイコン / 感情バッジに置き換える (= source 文字を non-replacing widget で前置)。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5.3

const WHO_PATTERN = /who:\s*([A-Za-z0-9_]+)/g;
// 感情値は英語 (legacy) と日本語 (新形式) の両方を許容するため Unicode 文字クラスを許す
const EMOTION_PATTERN = /emotion:\s*([^\s,}]+)/g;
const SFX_PATTERN = /\bkind:\s*sfx\b/g;
const BGM_PATTERN = /\bkind:\s*bgm\b/g;
const CHOICE_PATTERN = /\bkind:\s*choice\b/g;
const ASIDE_PATTERN = /aside:\s*([^\n,}]+)/g;

class CharacterThumbnailWidget extends WidgetType {
  constructor(readonly slug: string) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof CharacterThumbnailWidget && other.slug === this.slug;
  }

  toDOM(): HTMLElement {
    const root = document.createElement('span');
    root.className = 'cm-ss-thumb';
    root.title = `Character: ${this.slug}`;
    root.textContent = initials(this.slug);
    root.style.background = colorFor(this.slug);
    return root;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

class EmotionTagWidget extends WidgetType {
  constructor(readonly tag: string) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof EmotionTagWidget && other.tag === this.tag;
  }

  toDOM(): HTMLElement {
    const root = document.createElement('span');
    root.className = 'cm-ss-emotion';
    root.dataset.emotion = this.tag;
    root.textContent = `🎭 ${emotionLabel(this.tag)}`;
    root.style.background = emotionColor(this.tag);
    return root;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

class IconWidget extends WidgetType {
  constructor(
    readonly className: string,
    readonly icon: string,
    readonly title: string,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof IconWidget &&
      other.className === this.className &&
      other.icon === this.icon &&
      other.title === this.title
    );
  }

  toDOM(): HTMLElement {
    const root = document.createElement('span');
    root.className = this.className;
    root.title = this.title;
    root.textContent = this.icon;
    return root;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

class AsideWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof AsideWidget && other.text === this.text;
  }

  toDOM(): HTMLElement {
    const root = document.createElement('span');
    root.className = 'cm-ss-aside';
    root.textContent = `〈${this.text.trim()}〉`;
    return root;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  // 各 widget は個別パスで添えて、最後に start position 順にソートして RangeSetBuilder に積む。
  // (RangeSetBuilder は from の昇順を前提にするので、複数パターンの結果を 1 度に積めない)
  const additions: Array<{ from: number; widget: WidgetType; side: number }> = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    collectMatches(text, from, WHO_PATTERN, (slug, pos) =>
      additions.push({ from: pos, widget: new CharacterThumbnailWidget(slug), side: -1 }),
    );
    collectMatches(text, from, EMOTION_PATTERN, (tag, pos) =>
      additions.push({ from: pos, widget: new EmotionTagWidget(tag), side: -1 }),
    );
    collectMatches(text, from, ASIDE_PATTERN, (asideText, pos) =>
      additions.push({ from: pos, widget: new AsideWidget(asideText), side: -1 }),
    );
    collectKindMatches(text, from, SFX_PATTERN, (pos) =>
      additions.push({ from: pos, widget: new IconWidget('cm-ss-sfx', '🔊', 'sfx'), side: -1 }),
    );
    collectKindMatches(text, from, BGM_PATTERN, (pos) =>
      additions.push({ from: pos, widget: new IconWidget('cm-ss-bgm', '🎵', 'bgm'), side: -1 }),
    );
    collectKindMatches(text, from, CHOICE_PATTERN, (pos) =>
      additions.push({
        from: pos,
        widget: new IconWidget('cm-ss-choice', '❓', 'choice'),
        side: -1,
      }),
    );
  }
  additions.sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, widget, side } of additions) {
    builder.add(from, from, Decoration.widget({ widget, side }));
  }
  return builder.finish();
}

function collectMatches(
  text: string,
  base: number,
  pattern: RegExp,
  emit: (capture: string, pos: number) => void,
): void {
  // 各 view 更新で matchAll を最初から評価できるよう、毎回 RegExp の lastIndex はリセットされる
  for (const match of text.matchAll(pattern)) {
    const capture = match[1];
    if (capture === undefined || match.index === undefined) continue;
    emit(capture, base + match.index);
  }
}

function collectKindMatches(
  text: string,
  base: number,
  pattern: RegExp,
  emit: (pos: number) => void,
): void {
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    emit(base + match.index);
  }
}

function initials(slug: string): string {
  // ascii の場合は先頭 2 文字、それ以外は先頭 1 文字
  return /^[a-z0-9]+$/i.test(slug) ? slug.slice(0, 2).toUpperCase() : slug.slice(0, 1);
}

function colorFor(slug: string): string {
  // slug をハッシュして HSL の hue にマップ — 同じキャラが同じ色になる
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}deg 60% 70%)`;
}

const EMOTION_COLORS: Readonly<Record<string, string>> = {
  happy: 'hsl(50deg 90% 80%)',
  tired: 'hsl(220deg 30% 80%)',
  angry: 'hsl(0deg 80% 80%)',
  sad: 'hsl(220deg 60% 80%)',
  suspicious: 'hsl(280deg 40% 80%)',
};

function emotionColor(tag: string): string {
  return EMOTION_COLORS[tag] ?? 'hsl(0deg 0% 88%)';
}

/**
 * EditorView に inline widget 装飾を追加する extension。
 * - `who: <slug>` の前にサムネ (色付き円 + 略称)
 * - `emotion: <tag>` の前にバッジ
 * 既知 emotion はカラー、それ以外はグレー fallback。
 */
export const scriptInlineWidgets = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

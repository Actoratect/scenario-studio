import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

// 脚本エディタ用 inline widget — 行内の `who: <slug>` / `emotion: <tag>` を
// それぞれサムネ円アイコン / 感情バッジに置き換える (= source 文字を non-replacing widget で前置)。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5.3

const WHO_PATTERN = /who:\s*([A-Za-z0-9_]+)/g;
const EMOTION_PATTERN = /emotion:\s*([A-Za-z0-9_]+)/g;

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
    root.textContent = `🎭 ${this.tag}`;
    root.style.background = emotionColor(this.tag);
    return root;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    collectMatches(text, from, WHO_PATTERN, (slug, pos) =>
      builder.add(
        pos,
        pos,
        Decoration.widget({ widget: new CharacterThumbnailWidget(slug), side: -1 }),
      ),
    );
    collectMatches(text, from, EMOTION_PATTERN, (tag, pos) =>
      builder.add(pos, pos, Decoration.widget({ widget: new EmotionTagWidget(tag), side: -1 })),
    );
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

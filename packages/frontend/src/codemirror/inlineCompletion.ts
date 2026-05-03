import { Annotation, EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type ViewUpdate,
} from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { AiService } from '../services/AiService';

// AI inline 続き提案 (PR-F)。
// Phase 1 §0 受け入れ基準「1 行続き提案 (Tab 確定 / Esc 破棄)」を実装。
//
// 仕組み:
//   - StateField `ghostField` が現在の ghost text + アンカー pos を保持
//   - Decoration: 非編集 widget で ghost を行末にレンダリング (.cm-ss-ghost)
//   - keymap: Tab → ghost を本文に挿入 + ghost クリア
//             Esc → ghost クリア
//   - ViewPlugin: ユーザの編集を監視、800ms debounce 後に AiService.requestInline()
//   - 重複: in-flight の AbortController を持ち、新リクエストで前を abort
//   - cost guard: AiService.inlineEnabled() == false なら一切叩かない
//
// 詳細: ../../../../Documentation/ScenarioEditor/11_ai-workflow.md §6.1,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7

const DEBOUNCE_MS = 800;
const MAX_PREFIX_CHARS = 1500; // コスト保護: 上限を超えると後ろから切る

interface GhostState {
  text: string;
  anchor: number;
}

export const setGhost = StateEffect.define<GhostState | null>();
const ghostUpdateAnnotation = Annotation.define<true>();

export const ghostField = StateField.define<GhostState | null>({
  create: () => null,
  update(value, tr) {
    if (tr.docChanged && !tr.annotation(ghostUpdateAnnotation)) {
      // ユーザ編集が来たら ghost を消す (新しい候補は別途 viewPlugin が要求)
      return null;
    }
    for (const e of tr.effects) {
      if (e.is(setGhost)) return e.value;
    }
    return value;
  },
  provide: (f) =>
    EditorView.decorations.from(f, (g) => {
      if (!g) return Decoration.none;
      return Decoration.set([
        Decoration.widget({
          widget: new GhostWidget(g.text),
          side: 1, // カーソル直後に表示
        }).range(g.anchor),
      ]);
    }),
});

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  override eq(other: GhostWidget): boolean {
    return other.text === this.text;
  }
  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-ss-ghost';
    span.setAttribute('aria-label', `AI 候補: ${this.text}。Tab で確定`);
    span.textContent = this.text;
    return span;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

function acceptGhost(view: EditorView): boolean {
  const g = view.state.field(ghostField);
  if (!g || g.text.length === 0) return false;
  view.dispatch({
    changes: { from: g.anchor, to: g.anchor, insert: g.text },
    selection: { anchor: g.anchor + g.text.length },
    effects: setGhost.of(null),
    annotations: ghostUpdateAnnotation.of(true),
  });
  return true;
}

function dismissGhost(view: EditorView): boolean {
  const g = view.state.field(ghostField);
  if (!g) return false;
  view.dispatch({ effects: setGhost.of(null) });
  return true;
}

const ghostKeymap = keymap.of([
  { key: 'Tab', run: acceptGhost },
  { key: 'Escape', run: dismissGhost },
]);

class InlineRequester {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private abort: AbortController | undefined;
  private lastPrefix = '';

  schedule(view: EditorView, prefix: string): void {
    // 同じ prefix なら何もしない (cursor 移動だけで再リクエストしない)
    if (prefix === this.lastPrefix) return;
    this.lastPrefix = prefix;
    this.cancel();
    this.timer = setTimeout(() => void this.run(view, prefix), DEBOUNCE_MS);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.abort) {
      this.abort.abort();
      this.abort = undefined;
    }
  }

  destroy(): void {
    this.cancel();
  }

  private async run(view: EditorView, prefix: string): Promise<void> {
    this.timer = undefined;
    this.abort = new AbortController();
    const result = await AiService.requestInline(prefix, this.abort.signal);
    if (!result) return;
    // 結果到着時にカーソル位置 / prefix が変わっていたら破棄
    const head = view.state.selection.main.head;
    const currentPrefix = takePrefix(view.state, head);
    if (currentPrefix !== prefix) return;
    view.dispatch({
      effects: setGhost.of({ text: result, anchor: head }),
      annotations: ghostUpdateAnnotation.of(true),
    });
  }
}

function takePrefix(state: EditorState, head: number): string {
  const start = Math.max(0, head - MAX_PREFIX_CHARS);
  return state.doc.sliceString(start, head);
}

const inlineViewPlugin = ViewPlugin.fromClass(
  class {
    private requester = new InlineRequester();

    update(update: ViewUpdate): void {
      // 編集があるたびに ghost は ghostField で消えている (annotation 無し更新)
      // ここでは「編集があった」かつ「inline 有効」のときだけスケジュール
      if (!update.docChanged) return;
      if (!AiService.inlineEnabled()) return;
      const head = update.state.selection.main.head;
      const prefix = takePrefix(update.state, head);
      // 空 prefix では候補を出さない
      if (prefix.trim().length < 4) {
        this.requester.cancel();
        return;
      }
      this.requester.schedule(update.view, prefix);
    }

    destroy(): void {
      this.requester.destroy();
    }
  },
);

export function inlineCompletion(): Extension {
  return [ghostField, inlineViewPlugin, ghostKeymap];
}

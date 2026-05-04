import type { EditorView } from '@codemirror/view';

// Script editor 用のブロック挿入ヘルパ (PR-S)。
// CodeMirror の現カーソル行末に YAML スニペットを挿入し、
// その text: "" の中にカーソルを移動して即タイプ可能にする。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5

export type SnippetKind = 'line' | 'stage' | 'aside' | 'action' | 'sfx' | 'bgm' | 'choice';

interface SnippetDef {
  kind: SnippetKind;
  label: string;
  /** 挿入する YAML スニペット (改行は含めず、本体だけ)。 */
  template: (defaultWho: string) => string;
  /** template 内の最初に carret を置きたい部分文字列 (空なら先頭)。 */
  cursorAnchor: string;
}

export const SNIPPETS: readonly SnippetDef[] = [
  {
    kind: 'line',
    label: 'セリフ',
    template: (who) => `  - { kind: line, who: ${who}, emotion: calm, text: "" }`,
    cursorAnchor: 'text: "',
  },
  {
    kind: 'stage',
    label: 'ステージ',
    template: () => `  - { kind: stage, text: "" }`,
    cursorAnchor: 'text: "',
  },
  {
    kind: 'aside',
    label: '独白',
    template: () => `  - { kind: aside, text: "" }`,
    cursorAnchor: 'text: "',
  },
  {
    kind: 'action',
    label: '行動',
    template: (who) => `  - { kind: action, who: ${who}, text: "" }`,
    cursorAnchor: 'text: "',
  },
  {
    kind: 'sfx',
    label: 'SFX',
    template: () => `  - { kind: sfx, name: "" }`,
    cursorAnchor: 'name: "',
  },
  {
    kind: 'bgm',
    label: 'BGM',
    template: () => `  - { kind: bgm, cue: "", fade: 1.0 }`,
    cursorAnchor: 'cue: "',
  },
  {
    kind: 'choice',
    label: '選択肢',
    template: () =>
      `  - { kind: choice, prompt: "", options: [{ text: "選択 A", then: scene.next }] }`,
    cursorAnchor: 'prompt: "',
  },
];

export function insertSnippet(view: EditorView, kind: SnippetKind, defaultWho: string): void {
  const def = SNIPPETS.find((s) => s.kind === kind);
  if (!def) return;
  const snippet = def.template(defaultWho || 'cloud');
  const sel = view.state.selection.main;
  // カーソル行末に改行 + snippet を挿入
  const line = view.state.doc.lineAt(sel.head);
  const insertPos = line.to;
  const text = `\n${snippet}`;
  // 挿入後のカーソル位置: snippet 内の anchor に移動
  const anchorIdx = snippet.indexOf(def.cursorAnchor);
  const finalCursor =
    anchorIdx >= 0 ? insertPos + 1 + anchorIdx + def.cursorAnchor.length : insertPos + text.length;
  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: text },
    selection: { anchor: finalCursor },
    scrollIntoView: true,
  });
  view.focus();
}

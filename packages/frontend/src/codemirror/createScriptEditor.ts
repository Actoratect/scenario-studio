import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { yaml } from '@codemirror/lang-yaml';
import { scriptInlineWidgets } from './inlineWidgets';

// PoC-D の脚本エディタ最小セット。CodeMirror 6 + YAML 言語 + 自前 inline widget。
// Phase 1 で Smart 入力モード / 文字数バッジ / 改訂モード を載せる。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5

export interface ScriptEditorOptions {
  parent: HTMLElement;
  initialDoc: string;
  onChange?: (doc: string) => void;
}

export function createScriptEditor(options: ScriptEditorOptions): EditorView {
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.initialDoc,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        yaml(),
        scriptInlineWidgets,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && options.onChange) {
            options.onChange(update.state.doc.toString());
          }
        }),
      ],
    }),
  });
  return view;
}

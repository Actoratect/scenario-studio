import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { yaml } from '@codemirror/lang-yaml';
import { scriptInlineWidgets } from './inlineWidgets';
import { scriptAutocomplete, type ScriptCompletionSources } from './autocomplete';

// PoC-D の脚本エディタを M6 で本格化:
// - inline widget は character/emotion/aside/sfx/bgm/choice
// - autocomplete (who: / emotion: / kind: 候補)
// - 編集 → onChange 通知 (ScriptPanel が SaveScheduler に流す)
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M6

export interface ScriptEditorOptions {
  parent: HTMLElement;
  initialDoc: string;
  sources: ScriptCompletionSources;
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
        scriptAutocomplete(options.sources),
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

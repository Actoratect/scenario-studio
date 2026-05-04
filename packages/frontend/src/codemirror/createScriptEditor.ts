import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { yaml } from '@codemirror/lang-yaml';
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  search,
} from '@codemirror/search';
import { scriptInlineWidgets } from './inlineWidgets';
import { scriptAutocomplete, type ScriptCompletionSources } from './autocomplete';
import { inlineCompletion } from './inlineCompletion';

// PoC-D の脚本エディタを M6 で本格化:
// - inline widget は character/emotion/aside/sfx/bgm/choice
// - autocomplete (who: / emotion: / kind: 候補)
// - 編集 → onChange 通知 (ScriptPanel が SaveScheduler に流す)
// - light theme 固定 (OS dark mode に追従しない、CUDO 準拠の配色)
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M6

const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#ffffff',
      color: '#1a1d24',
      height: '100%',
    },
    '.cm-content': {
      caretColor: '#0072b2',
    },
    '.cm-cursor': {
      borderLeftColor: '#0072b2',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: '#cfe6f3',
    },
    '.cm-gutters': {
      backgroundColor: '#f5f7fa',
      color: '#8a8f96',
      borderRight: '1px solid #e6e8ec',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(0, 114, 178, 0.06)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(0, 114, 178, 0.1)',
    },
    '.cm-tooltip': {
      backgroundColor: '#ffffff',
      border: '1px solid #d4d7dc',
      color: '#1a1d24',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#0072b2',
      color: '#ffffff',
    },
    // search panel (PR-W)
    '.cm-panels': {
      backgroundColor: '#f5f7fa',
      color: '#1a1d24',
      borderBottom: '1px solid #d4d7dc',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid #d4d7dc',
    },
    '.cm-search input': {
      backgroundColor: '#ffffff',
      color: '#1a1d24',
      border: '1px solid #d4d7dc',
      padding: '2px 6px',
      borderRadius: '3px',
    },
    '.cm-search input:focus': {
      borderColor: '#0072b2',
      outline: 'none',
    },
    '.cm-search button': {
      backgroundColor: '#ffffff',
      color: '#1a1d24',
      border: '1px solid #d4d7dc',
      padding: '2px 8px',
      borderRadius: '3px',
      cursor: 'pointer',
      marginLeft: '4px',
    },
    '.cm-search button:hover': {
      borderColor: '#0072b2',
      color: '#0072b2',
    },
    '.cm-search label': {
      color: '#5a6068',
      fontSize: '12px',
    },
    '.cm-search [name=close]': {
      color: '#5a6068',
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(240, 228, 66, 0.5)',
    },
    '.cm-searchMatch-selected': {
      backgroundColor: '#f0e442',
      color: '#1a1d24',
    },
  },
  { dark: false },
);

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
        // CodeMirror 検索パネル (PR-W) — グローバル Cmd+F は global SearchOverlay に
        // 譲り、ここでは Mod+H で replace モードを開く + F3/Mod+G で次/前。
        search({ top: true }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          { key: 'Mod-h', run: openSearchPanel },
          { key: 'F3', run: findNext, shift: findPrevious, preventDefault: true },
          { key: 'Mod-g', run: findNext, shift: findPrevious, preventDefault: true },
          { key: 'Escape', run: closeSearchPanel },
        ]),
        yaml(),
        scriptAutocomplete(options.sources),
        scriptInlineWidgets,
        inlineCompletion(),
        EditorView.lineWrapping,
        lightTheme,
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

import { onCleanup, onMount } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { createScriptEditor } from '../codemirror/createScriptEditor';
import { SAMPLE_SCRIPT } from '../codemirror/sampleScript';

// 脚本エディタ Panel。CodeMirror 6 + 自前 inline widget で、
// `who: <slug>` をサムネに、`emotion: <tag>` をバッジに置き換える。
// PoC-D 範囲: エディタが乗る + widget が描画される。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5
export const ScriptPanel: Component<GroupPanelPartInitParameters> = (params) => {
  let host: HTMLDivElement | undefined;
  let view: ReturnType<typeof createScriptEditor> | undefined;

  onMount(() => {
    if (!host) return;
    view = createScriptEditor({
      parent: host,
      initialDoc: SAMPLE_SCRIPT,
    });
  });

  onCleanup(() => {
    view?.destroy();
  });

  return (
    <div class="panel-content panel-script">
      <div class="panel-script-meta">
        Scene: <code>{params.api.id}</code> · CodeMirror 6 + inline widgets (PoC-D)
      </div>
      <div class="panel-script-host" ref={host} />
    </div>
  );
};

import { createSignal, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { Spinner } from '@scenario-studio/ui-kit';
import { ProjectService } from '../services/ProjectService';
import { Toast } from '../services/Toast';

// プロジェクト全体の synopsis (Scenarios/synopsis.md) を編集する panel。
// MVP は textarea ベース。CodeMirror Markdown は M6 (脚本エディタ拡張時) に
// CM6 を再利用して切替予定。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §3.1,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M4

export const SynopsisPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [text, setText] = createSignal<string>('');
  const [saving, setSaving] = createSignal(false);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setText(ctx.project.scenario.projectSynopsis);
  });

  function scheduleSave(value: string): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void flush(value);
    }, 500);
  }

  async function flush(value: string): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setSaving(true);
    try {
      await ctx.scenarioRepository.saveSynopsis(value);
      // ProjectModel.scenario.projectSynopsis を更新 (M3 と同じ in-place pattern)
      const next = { ...ctx.project.scenario, projectSynopsis: value };
      Object.assign(ctx.project, { scenario: next });
    } catch (e) {
      console.error('synopsis save failed', e);
      Toast.error(`Synopsis 保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="panel-content panel-synopsis">
      <div class="panel-synopsis-meta">
        Project Synopsis · <code>{params.api.id}</code>
        <Show when={saving()}>
          <span class="panel-synopsis-saving">
            <Spinner /> 保存中…
          </span>
        </Show>
      </div>
      <textarea
        class="panel-synopsis-textarea"
        value={text()}
        placeholder="プロジェクト全体のあらすじを Markdown で…"
        onInput={(e) => {
          const v = e.currentTarget.value;
          setText(v);
          scheduleSave(v);
        }}
      />
    </div>
  );
};

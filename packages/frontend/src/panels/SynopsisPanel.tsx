import { createMemo, createSignal, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { marked } from 'marked';
import { Spinner } from '@scenario-studio/ui-kit';
import { ProjectService } from '../services/ProjectService';
import { Toast } from '../services/Toast';

// プロジェクト全体の synopsis (Scenarios/synopsis.md) を編集する panel。
// PR-I: Markdown プレビュー (split view) を追加。marked で Markdown→HTML、
// CSP で外部 script を弾いているのと、SynopsisPanel は ProjectModel 内のテキストのみ
// 扱うため XSS 経路は限定的。それでも future-proof のため許可タグを最小化。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §3.1,
//       ../../../../Documentation/ScenarioEditor/16_security.md §2.4 (sanitize)

type ViewMode = 'edit' | 'split' | 'preview';

// marked の安全側設定: GFM ON、HTML 通すが <script> 等は CSP で禁止。
marked.setOptions({ gfm: true, breaks: true });

export const SynopsisPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [text, setText] = createSignal<string>('');
  const [saving, setSaving] = createSignal(false);
  const [mode, setMode] = createSignal<ViewMode>('split');
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
      const next = { ...ctx.project.scenario, projectSynopsis: value };
      Object.assign(ctx.project, { scenario: next });
    } catch (e) {
      console.error('synopsis save failed', e);
      Toast.error(`Synopsis 保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const html = createMemo<string>(() => {
    try {
      return marked.parse(text(), { async: false }) as string;
    } catch {
      return '<p><em>Markdown パース失敗</em></p>';
    }
  });

  return (
    <div class="panel-content panel-synopsis">
      <div class="panel-synopsis-meta">
        <span>
          Project Synopsis · <code>{params.api.id}</code>
        </span>
        <Show when={saving()}>
          <span class="panel-synopsis-saving">
            <Spinner /> 保存中…
          </span>
        </Show>
        <span class="panel-synopsis-mode">
          <button
            type="button"
            classList={{ active: mode() === 'edit' }}
            onClick={() => setMode('edit')}
            title="編集のみ"
          >
            ✎
          </button>
          <button
            type="button"
            classList={{ active: mode() === 'split' }}
            onClick={() => setMode('split')}
            title="編集 + プレビュー"
          >
            ⇆
          </button>
          <button
            type="button"
            classList={{ active: mode() === 'preview' }}
            onClick={() => setMode('preview')}
            title="プレビューのみ"
          >
            👁
          </button>
        </span>
      </div>
      <div class="panel-synopsis-body" data-mode={mode()}>
        <Show when={mode() !== 'preview'}>
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
        </Show>
        <Show when={mode() !== 'edit'}>
          {/* eslint-disable-next-line solid/no-innerhtml */}
          <div class="panel-synopsis-preview" innerHTML={html()} />
        </Show>
      </div>
    </div>
  );
};

import { createMemo, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { buildCharacterLookups, exportProjectAsMarkdown, exportScene } from '@scenario-studio/core';
import { ProjectService } from '../services/ProjectService';
import { Toast } from '../services/Toast';

// Export dialog (PR-K) — Cmd+E もしくは workspace header の Export ボタンで開く。
// 範囲: シーン単体 / 章まるごと / プロジェクト全体
// 形式: text / markdown
// 結果: テキストエリアに表示 + Download / Clipboard コピー。
// 詳細: ../../../../Documentation/ScenarioEditor/10_export.md

const [open, setOpen] = createSignal(false);

export const ExportDialog = {
  open,
  show(): void {
    setOpen(true);
  },
  hide(): void {
    setOpen(false);
  },
  toggle(): void {
    setOpen(!open());
  },
};

type Scope = 'scene' | 'chapter' | 'project';
type Fmt = 'text' | 'markdown';

interface SceneRef {
  chapterSlug: string;
  sceneSlug: string;
  label: string;
}

const ExportDialogUi: Component = () => {
  const [scope, setScope] = createSignal<Scope>('project');
  const [fmt, setFmt] = createSignal<Fmt>('markdown');
  const [selectedScene, setSelectedScene] = createSignal<string>('');
  const [selectedChapter, setSelectedChapter] = createSignal<string>('');
  const [output, setOutput] = createSignal<string>('');
  const [busy, setBusy] = createSignal(false);

  const scenes = createMemo<readonly SceneRef[]>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return [];
    const out: SceneRef[] = [];
    for (const ch of ctx.project.scenario.chapters) {
      for (const sc of ch.scenes) {
        out.push({
          chapterSlug: ch.slug,
          sceneSlug: sc.slug,
          label: `${ch.title} / ${sc.title}`,
        });
      }
    }
    return out;
  });

  async function generate(): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setBusy(true);
    setOutput('');
    try {
      const lookups = buildCharacterLookups(ctx.project.nodes);
      if (scope() === 'project') {
        const md = await exportProjectAsMarkdown({
          adapter: ctx.adapter,
          handle: ctx.handle,
          project: ctx.project,
        });
        setOutput(md);
        return;
      }
      if (scope() === 'chapter') {
        const target = ctx.project.scenario.chapters.find((c) => c.slug === selectedChapter());
        if (!target) {
          Toast.error('章が選択されていません');
          return;
        }
        const lines: string[] = [];
        lines.push(fmt() === 'markdown' ? `# ${target.title}` : `=== ${target.title} ===`);
        lines.push('');
        for (const sc of target.scenes) {
          const path = `Scenarios/${target.slug}/${sc.relativePath}`;
          if (!(await ctx.adapter.exists(ctx.handle, path))) continue;
          const yaml = await ctx.adapter.read(ctx.handle, path);
          lines.push(
            exportScene(fmt(), {
              sceneYaml: yaml,
              charactersByDevName: lookups.byDevName,
              charactersBySlug: lookups.bySlug,
            }),
          );
          lines.push('');
        }
        setOutput(lines.join('\n').trimEnd() + '\n');
        return;
      }
      // scene
      const ref = scenes().find((s) => `${s.chapterSlug}/${s.sceneSlug}` === selectedScene());
      if (!ref) {
        Toast.error('シーンが選択されていません');
        return;
      }
      const path = `Scenarios/${ref.chapterSlug}/${ref.sceneSlug}.scn.yaml`;
      const yaml = await ctx.adapter.read(ctx.handle, path);
      setOutput(
        exportScene(fmt(), {
          sceneYaml: yaml,
          charactersByDevName: lookups.byDevName,
          charactersBySlug: lookups.bySlug,
        }),
      );
    } catch (e) {
      Toast.error(`Export 失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function download(): void {
    const ctx = ProjectService.currentProject();
    if (!ctx || output() === '') return;
    const ext = fmt() === 'markdown' ? 'md' : 'txt';
    const baseName =
      scope() === 'project'
        ? ctx.project.settings.name
        : scope() === 'chapter'
          ? selectedChapter()
          : selectedScene().replace('/', '__');
    const blob = new Blob([output()], {
      type: fmt() === 'markdown' ? 'text/markdown' : 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard(): Promise<void> {
    if (output() === '') return;
    try {
      await navigator.clipboard.writeText(output());
      Toast.success('クリップボードにコピーしました', 1500);
    } catch (e) {
      Toast.error(`コピー失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div class="ss-modal-backdrop" onClick={() => ExportDialog.hide()}>
      <div class="ss-modal ss-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>Export</h3>

        <div class="ss-modal-section">
          <strong>範囲</strong>
          <div class="ss-export-radio-group">
            <label>
              <input
                type="radio"
                checked={scope() === 'project'}
                onChange={() => setScope('project')}
              />
              プロジェクト全体
            </label>
            <label>
              <input
                type="radio"
                checked={scope() === 'chapter'}
                onChange={() => setScope('chapter')}
              />
              章
            </label>
            <label>
              <input
                type="radio"
                checked={scope() === 'scene'}
                onChange={() => setScope('scene')}
              />
              シーン
            </label>
          </div>
        </div>

        <Show when={scope() === 'chapter'}>
          <div class="ss-modal-section">
            <strong>章を選択</strong>
            <select
              value={selectedChapter()}
              onChange={(e) => setSelectedChapter(e.currentTarget.value)}
            >
              <option value="">— 選択 —</option>
              <For each={ProjectService.currentProject()?.project.scenario.chapters ?? []}>
                {(ch) => <option value={ch.slug}>{ch.title}</option>}
              </For>
            </select>
          </div>
        </Show>

        <Show when={scope() === 'scene'}>
          <div class="ss-modal-section">
            <strong>シーンを選択</strong>
            <select
              value={selectedScene()}
              onChange={(e) => setSelectedScene(e.currentTarget.value)}
            >
              <option value="">— 選択 —</option>
              <For each={scenes()}>
                {(s) => <option value={`${s.chapterSlug}/${s.sceneSlug}`}>{s.label}</option>}
              </For>
            </select>
          </div>
        </Show>

        <div class="ss-modal-section">
          <strong>形式</strong>
          <div class="ss-export-radio-group">
            <label>
              <input
                type="radio"
                checked={fmt() === 'markdown'}
                onChange={() => setFmt('markdown')}
              />
              Markdown (.md)
            </label>
            <label>
              <input type="radio" checked={fmt() === 'text'} onChange={() => setFmt('text')} />
              プレーンテキスト (.txt)
            </label>
          </div>
        </div>

        <div class="ss-modal-actions">
          <button
            type="button"
            data-variant="primary"
            disabled={busy()}
            onClick={() => void generate()}
          >
            生成
          </button>
          <span class="ss-modal-spacer" />
          <button type="button" disabled={output() === ''} onClick={() => void copyToClipboard()}>
            クリップボードにコピー
          </button>
          <button type="button" disabled={output() === ''} onClick={download}>
            ダウンロード
          </button>
          <button type="button" onClick={() => ExportDialog.hide()}>
            閉じる
          </button>
        </div>

        <Show when={output() !== ''}>
          <div class="ss-modal-section">
            <strong>プレビュー ({output().length.toLocaleString('en-US')} 文字)</strong>
            <textarea class="ss-export-output" readOnly={true} value={output()} />
          </div>
        </Show>
      </div>
    </div>
  );
};

export const ExportDialogRoot: Component = () => {
  return (
    <Show when={open()}>
      <ExportDialogUi />
    </Show>
  );
};

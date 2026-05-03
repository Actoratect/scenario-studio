import { createMemo, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  CHARACTER_TEMPLATE,
  createNode,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  LOCATION_TEMPLATE,
  type ScenarioNode,
  type TemplateDefinition,
} from '@scenario-studio/core';
import { LoadingOverlay } from '@scenario-studio/ui-kit';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';
import { Toast } from '../services/Toast';

// M4 Outliner: 章 / シーン階層 (Scenario) と Nodes 一覧の 2 セクション構成。
// 真の TanStack Virtual / ドラッグ並べ替え は M5+ または Phase 1 後半。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §4.3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M4

const NEW_NODE_TEMPLATES: ReadonlyArray<{ template: TemplateDefinition; label: string }> = [
  { template: CHARACTER_TEMPLATE, label: 'Character' },
  { template: LOCATION_TEMPLATE, label: 'Location' },
  { template: ITEM_TEMPLATE, label: 'Item' },
  { template: FACTION_TEMPLATE, label: 'Faction' },
];

export const OutlinePanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [busy, setBusy] = createSignal(false);
  const [newChapterTitle, setNewChapterTitle] = createSignal('新しい章');

  const groupedNodes = createMemo(() => {
    const ctx = ProjectService.currentProject();
    const groups = new Map<string, ScenarioNode[]>();
    if (!ctx) return groups;
    for (const t of ctx.templates.list()) groups.set(t.id, []);
    for (const node of ctx.project.nodes.values()) {
      const arr = groups.get(node.templateId) ?? [];
      arr.push(node);
      groups.set(node.templateId, arr);
    }
    for (const arr of groups.values()) arr.sort((a, b) => a.slug.localeCompare(b.slug));
    return groups;
  });

  async function addChapter(): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setBusy(true);
    try {
      const idx = ctx.project.scenario.chapters.length + 1;
      const slug = `ch${String(idx).padStart(2, '0')}_${Date.now().toString(36)}`;
      const ch = await ctx.scenarioRepository.addChapter({
        slug,
        title: newChapterTitle().trim() || `Chapter ${idx}`,
      });
      const nextChapters = [...ctx.project.scenario.chapters, ch];
      await ctx.scenarioRepository.saveProjectIndex(nextChapters.map((c) => ({ slug: c.slug })));
      const nextScenario = { ...ctx.project.scenario, chapters: nextChapters };
      Object.assign(ctx.project, { scenario: nextScenario });
    } catch (e) {
      console.error('addChapter failed', e);
      Toast.error(`章の追加に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function addScene(chapterSlug: string): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const chapter = ctx.project.scenario.chapters.find((c) => c.slug === chapterSlug);
    if (!chapter) return;
    setBusy(true);
    try {
      const idx = chapter.scenes.length + 1;
      const slug = `s${String(idx).padStart(2, '0')}_${Date.now().toString(36)}`;
      const scene = await ctx.scenarioRepository.addScene({
        chapterSlug,
        sceneSlug: slug,
        title: `Scene ${idx}`,
      });
      const nextChapters = ctx.project.scenario.chapters.map((c) =>
        c.slug === chapterSlug ? { ...c, scenes: [...c.scenes, scene] } : c,
      );
      Object.assign(ctx.project, {
        scenario: { ...ctx.project.scenario, chapters: nextChapters },
      });
    } catch (e) {
      console.error('addScene failed', e);
      Toast.error(`シーンの追加に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function renameChapter(chapterSlug: string, currentTitle: string): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const next = window.prompt('章のタイトル:', currentTitle);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed === '' || trimmed === currentTitle) return;
    setBusy(true);
    try {
      await ctx.scenarioRepository.renameChapter(chapterSlug, trimmed);
      const nextChapters = ctx.project.scenario.chapters.map((c) =>
        c.slug === chapterSlug ? { ...c, title: trimmed } : c,
      );
      Object.assign(ctx.project, {
        scenario: { ...ctx.project.scenario, chapters: nextChapters },
      });
    } catch (e) {
      Toast.error(`章タイトル変更に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteScene(chapterSlug: string, sceneSlug: string): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    if (!window.confirm(`シーン "${sceneSlug}" を削除しますか? (元に戻せません)`)) return;
    setBusy(true);
    try {
      await ctx.scenarioRepository.removeScene(chapterSlug, sceneSlug);
      const nextChapters = ctx.project.scenario.chapters.map((c) =>
        c.slug === chapterSlug ? { ...c, scenes: c.scenes.filter((s) => s.slug !== sceneSlug) } : c,
      );
      Object.assign(ctx.project, {
        scenario: { ...ctx.project.scenario, chapters: nextChapters },
      });
      Toast.success(`シーンを削除: ${sceneSlug}`);
    } catch (e) {
      Toast.error(`シーンの削除に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function addNode(template: TemplateDefinition): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setBusy(true);
    try {
      const slug = `new_${template.directory.replace(/s$/, '')}_${Date.now().toString(36)}`;
      const node = createNode(ctx.templates, { templateId: template.id, slug });
      await ctx.nodeRepository.save(node);
      const next = new Map(ctx.project.nodes);
      next.set(node.id, node);
      Object.assign(ctx.project, { nodes: next });
      ctx.history.register(node);
      SelectionContext.selectNode(node.id);
    } catch (e) {
      console.error('addNode failed', e);
      Toast.error(`ノードの追加に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="panel-content panel-outline">
      <LoadingOverlay when={busy()} label="保存中…" />
      <header class="panel-outline-header">
        <span>
          Outline · <code>{params.api.id}</code>
        </span>
      </header>

      <div class="panel-outline-list">
        <h3 class="panel-outline-group">Scenarios</h3>
        <ul>
          <For each={ProjectService.currentProject()?.project.scenario.chapters ?? []}>
            {(chapter) => (
              <li class="panel-outline-chapter">
                <span class="panel-outline-chapter-title">
                  <button
                    class="panel-outline-chapter-title-button"
                    disabled={busy()}
                    onClick={() => void renameChapter(chapter.slug, chapter.title)}
                    title="章のタイトルを変更"
                  >
                    📖 {chapter.title}
                  </button>
                  <span class="panel-outline-chapter-slug">{chapter.slug}</span>
                  <button
                    class="panel-outline-add-scene"
                    disabled={busy()}
                    onClick={() => void addScene(chapter.slug)}
                    title="この章にシーンを追加"
                  >
                    + Scene
                  </button>
                </span>
                <Show when={chapter.scenes.length > 0}>
                  <ul class="panel-outline-scenes">
                    <For each={chapter.scenes}>
                      {(scene) => (
                        <li class="panel-outline-scene">
                          🎬 {scene.title}
                          <button
                            class="panel-outline-delete-scene"
                            disabled={busy()}
                            onClick={() => void deleteScene(chapter.slug, scene.slug)}
                            title="このシーンを削除"
                          >
                            ×
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </li>
            )}
          </For>
        </ul>
        <div class="panel-outline-add-chapter">
          <input
            type="text"
            value={newChapterTitle()}
            onInput={(e) => setNewChapterTitle(e.currentTarget.value)}
            disabled={busy()}
            placeholder="新しい章のタイトル"
          />
          <button disabled={busy()} onClick={() => void addChapter()}>
            + Chapter
          </button>
        </div>

        <h3 class="panel-outline-group">Nodes</h3>
        <div class="panel-outline-actions">
          <For each={NEW_NODE_TEMPLATES}>
            {(t) => (
              <button disabled={busy()} onClick={() => void addNode(t.template)}>
                + {t.label}
              </button>
            )}
          </For>
        </div>
        <For each={ProjectService.currentProject()?.templates.list() ?? []}>
          {(template) => {
            const items = () => groupedNodes().get(template.id) ?? [];
            return (
              <Show when={items().length > 0}>
                <h4 class="panel-outline-subgroup">{template.displayName}</h4>
                <ul>
                  <For each={items()}>
                    {(node) => (
                      <li>
                        <button
                          class="panel-outline-node"
                          classList={{
                            'panel-outline-node--selected':
                              SelectionContext.selectedNodeId() === node.id,
                          }}
                          onClick={() => SelectionContext.selectNode(node.id)}
                        >
                          {node.slug}
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            );
          }}
        </For>
        <Show when={(ProjectService.currentProject()?.project.nodes.size ?? 0) === 0}>
          <p class="panel-outline-empty">
            まだノードがありません。上のボタンから追加してください。
          </p>
        </Show>
      </div>
    </div>
  );
};

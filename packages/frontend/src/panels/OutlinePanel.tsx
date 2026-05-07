import { createMemo, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  CHARACTER_TEMPLATE,
  createNode,
  EVENT_TEMPLATE,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  LOCATION_TEMPLATE,
  type NodeId,
  type ScenarioNode,
  type TemplateDefinition,
} from '@scenario-studio/core';
import { LoadingOverlay } from '@scenario-studio/ui-kit';
import { NodeThumbnail } from '../global/NodeThumbnail';
import { PanelFocus } from '../services/PanelFocus';
import { ProjectService } from '../services/ProjectService';
import { SceneSelection } from '../services/SceneSelection';
import { SelectionContext } from '../services/SelectionContext';
import { ThumbnailService } from '../services/ThumbnailService';
import { Toast } from '../services/Toast';

// M4 Outliner: 章 / シーン階層 (Scenario) と Nodes 一覧の 2 セクション構成。
// 真の TanStack Virtual / ドラッグ並べ替え は M5+ または Phase 1 後半。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §4.3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M4

const NEW_NODE_TEMPLATES: ReadonlyArray<{ template: TemplateDefinition; label: string }> = [
  { template: CHARACTER_TEMPLATE, label: 'キャラ' },
  { template: LOCATION_TEMPLATE, label: '舞台' },
  { template: ITEM_TEMPLATE, label: '物品' },
  { template: FACTION_TEMPLATE, label: '組織' },
  { template: EVENT_TEMPLATE, label: '出来事・その他' },
];

export const OutlinePanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [busy, setBusy] = createSignal(false);
  const [newChapterTitle, setNewChapterTitle] = createSignal('新しい章');
  // PR-AG: Outline 複数選択 (Cmd / Shift+クリックで節点を bulk 選択)
  const [multiSelected, setMultiSelected] = createSignal<ReadonlySet<NodeId>>(new Set());

  function toggleMulti(id: NodeId, additive: boolean): void {
    const cur = multiSelected();
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (!additive) {
      // 純粋な click は単一選択に戻す
      next.clear();
      next.add(id);
    }
    setMultiSelected(next);
  }

  function clearMulti(): void {
    setMultiSelected(new Set<NodeId>());
  }

  async function bulkDelete(): Promise<void> {
    const ctx = ProjectService.currentProject();
    const ids = [...multiSelected()];
    if (!ctx || ids.length === 0) return;
    if (!window.confirm(`選択中の ${ids.length} 件のノードを削除しますか? (元に戻せません)`))
      return;
    setBusy(true);
    try {
      for (const id of ids) {
        await ctx.nodeRepository.delete(id);
      }
      const next = new Map(ctx.project.nodes);
      for (const id of ids) next.delete(id);
      Object.assign(ctx.project, { nodes: next });
      Toast.success(`${ids.length} 件のノードを削除`);
      clearMulti();
    } catch (e) {
      Toast.error(`削除に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

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

  async function renameScene(
    chapterSlug: string,
    sceneSlug: string,
    currentTitle: string,
  ): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const newTitle = window.prompt('シーンのタイトル:', currentTitle);
    if (newTitle === null) return;
    const newSlug = window.prompt(
      'シーンの slug (英小文字 / 数字 / _ / -, 空欄で変更しない):',
      sceneSlug,
    );
    if (newSlug === null) return;
    const trimmedSlug = newSlug.trim();
    const trimmedTitle = newTitle.trim();
    if (trimmedSlug === '' || (trimmedSlug === sceneSlug && trimmedTitle === currentTitle)) return;
    if (!/^[a-z0-9_-]+$/i.test(trimmedSlug)) {
      Toast.error(`不正な slug: ${trimmedSlug}`);
      return;
    }
    setBusy(true);
    try {
      const result = await ctx.scenarioRepository.renameScene({
        chapterSlug,
        oldSlug: sceneSlug,
        newSlug: trimmedSlug,
        newTitle: trimmedTitle === currentTitle ? undefined : trimmedTitle,
      });
      const nextChapters = ctx.project.scenario.chapters.map((c) =>
        c.slug === chapterSlug
          ? {
              ...c,
              scenes: c.scenes.map((s) =>
                s.slug === sceneSlug
                  ? {
                      ...s,
                      slug: result.slug,
                      title: result.title,
                      relativePath: `${result.slug}.scn.yaml`,
                    }
                  : s,
              ),
            }
          : c,
      );
      Object.assign(ctx.project, {
        scenario: { ...ctx.project.scenario, chapters: nextChapters },
      });
      Toast.success(`シーンを変更: ${sceneSlug} → ${result.slug}`);
    } catch (e) {
      Toast.error(`シーン変更に失敗: ${e instanceof Error ? e.message : String(e)}`);
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

  async function reorderChapters(fromIdx: number, toIdx: number): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx || fromIdx === toIdx) return;
    setBusy(true);
    try {
      const arr = [...ctx.project.scenario.chapters];
      const [moved] = arr.splice(fromIdx, 1);
      if (!moved) return;
      arr.splice(toIdx, 0, moved);
      await ctx.scenarioRepository.saveProjectIndex(arr.map((c) => ({ slug: c.slug })));
      Object.assign(ctx.project, {
        scenario: { ...ctx.project.scenario, chapters: arr },
      });
    } catch (e) {
      Toast.error(`章の並べ替えに失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function reorderScenes(chapterSlug: string, fromIdx: number, toIdx: number): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx || fromIdx === toIdx) return;
    const chapter = ctx.project.scenario.chapters.find((c) => c.slug === chapterSlug);
    if (!chapter) return;
    setBusy(true);
    try {
      const scenes = [...chapter.scenes];
      const [moved] = scenes.splice(fromIdx, 1);
      if (!moved) return;
      scenes.splice(toIdx, 0, moved);
      await ctx.scenarioRepository.reorderScenes(
        chapterSlug,
        scenes.map((s) => s.slug),
      );
      const nextChapters = ctx.project.scenario.chapters.map((c) =>
        c.slug === chapterSlug ? { ...c, scenes } : c,
      );
      Object.assign(ctx.project, {
        scenario: { ...ctx.project.scenario, chapters: nextChapters },
      });
    } catch (e) {
      Toast.error(`シーンの並べ替えに失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /** PR-U: シーンを別章に移動。fromIdx は src 章内の元 index、insertAt は dst 章内の挿入位置。 */
  async function moveSceneToChapter(
    fromChapter: string,
    fromIdx: number,
    toChapter: string,
    insertAt: number,
  ): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const src = ctx.project.scenario.chapters.find((c) => c.slug === fromChapter);
    if (!src) return;
    const moved = src.scenes[fromIdx];
    if (!moved) return;
    setBusy(true);
    try {
      await ctx.scenarioRepository.moveScene({
        fromChapter,
        toChapter,
        sceneSlug: moved.slug,
        insertAt,
      });
      const nextChapters = ctx.project.scenario.chapters.map((c) => {
        if (c.slug === fromChapter) {
          return { ...c, scenes: c.scenes.filter((_, i) => i !== fromIdx) };
        }
        if (c.slug === toChapter) {
          const arr = [...c.scenes];
          arr.splice(insertAt, 0, moved);
          return { ...c, scenes: arr };
        }
        return c;
      });
      Object.assign(ctx.project, {
        scenario: { ...ctx.project.scenario, chapters: nextChapters },
      });
      Toast.success(`シーン移動: ${fromChapter} → ${toChapter}`);
    } catch (e) {
      Toast.error(`シーン移動に失敗: ${e instanceof Error ? e.message : String(e)}`);
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
            {(chapter, chIdx) => (
              <li
                class="panel-outline-chapter"
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer?.setData('application/x-ss-chapter', String(chIdx()));
                  e.dataTransfer!.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  // 章 drag (並べ替え) または scene drag (他章への移動) を受け付ける
                  if (
                    e.dataTransfer?.types.includes('application/x-ss-chapter') ||
                    e.dataTransfer?.types.includes('application/x-ss-scene')
                  ) {
                    e.preventDefault();
                    e.currentTarget.classList.add('panel-outline-chapter--drop');
                  }
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove('panel-outline-chapter--drop')}
                onDrop={(e) => {
                  e.currentTarget.classList.remove('panel-outline-chapter--drop');
                  // 章順の並べ替え
                  const fromChapterIdx = e.dataTransfer?.getData('application/x-ss-chapter');
                  if (fromChapterIdx !== undefined && fromChapterIdx !== '') {
                    e.preventDefault();
                    void reorderChapters(Number(fromChapterIdx), chIdx());
                    return;
                  }
                  // シーンの他章への移動 (drop on chapter li, not scene li)
                  const sceneRaw = e.dataTransfer?.getData('application/x-ss-scene');
                  if (sceneRaw) {
                    const [srcChap, srcIdxStr] = sceneRaw.split('::');
                    if (srcChap && srcChap !== chapter.slug && srcIdxStr !== undefined) {
                      e.preventDefault();
                      // 末尾に追加
                      void moveSceneToChapter(
                        srcChap,
                        Number(srcIdxStr),
                        chapter.slug,
                        chapter.scenes.length,
                      );
                    }
                  }
                }}
              >
                <span class="panel-outline-chapter-title">
                  <span class="panel-outline-drag-handle" title="ドラッグで並べ替え">
                    ⋮⋮
                  </span>
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
                      {(scene, sIdx) => (
                        <li
                          class="panel-outline-scene"
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer?.setData(
                              'application/x-ss-scene',
                              `${chapter.slug}::${sIdx()}`,
                            );
                            e.dataTransfer!.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            if (e.dataTransfer?.types.includes('application/x-ss-scene')) {
                              e.preventDefault();
                              e.stopPropagation(); // chapter li drop を抑止
                              e.currentTarget.classList.add('panel-outline-scene--drop');
                            }
                          }}
                          onDragLeave={(e) =>
                            e.currentTarget.classList.remove('panel-outline-scene--drop')
                          }
                          onDrop={(e) => {
                            e.currentTarget.classList.remove('panel-outline-scene--drop');
                            const raw = e.dataTransfer?.getData('application/x-ss-scene');
                            if (!raw) return;
                            const [srcChap, srcIdxStr] = raw.split('::');
                            if (!srcChap || srcIdxStr === undefined) return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (srcChap === chapter.slug) {
                              void reorderScenes(chapter.slug, Number(srcIdxStr), sIdx());
                            } else {
                              void moveSceneToChapter(
                                srcChap,
                                Number(srcIdxStr),
                                chapter.slug,
                                sIdx(),
                              );
                            }
                          }}
                        >
                          <span class="panel-outline-drag-handle" title="ドラッグで並べ替え">
                            ⋮
                          </span>
                          <button
                            class="panel-outline-scene-jump"
                            onClick={() => {
                              SceneSelection.select({
                                chapterSlug: chapter.slug,
                                sceneSlug: scene.slug,
                                label: scene.title,
                              });
                              PanelFocus.focus('script-1');
                            }}
                            title="Script タブに jump"
                          >
                            🎬 {scene.title}
                          </button>
                          <span class="panel-outline-scene-slug">{scene.slug}</span>
                          <button
                            class="panel-outline-rename-scene"
                            disabled={busy()}
                            onClick={() => void renameScene(chapter.slug, scene.slug, scene.title)}
                            title="シーンの名前 / slug を変更"
                          >
                            ✎
                          </button>
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
        <Show when={multiSelected().size > 0}>
          <div class="panel-outline-bulkbar">
            <span class="panel-outline-bulkbar-count">{multiSelected().size} 件 選択中</span>
            <button
              class="panel-outline-bulkbar-action"
              disabled={busy()}
              onClick={() => void bulkDelete()}
              title="選択中のノードを全て削除"
            >
              🗑 一括削除
            </button>
            <button
              class="panel-outline-bulkbar-action"
              disabled={busy()}
              onClick={clearMulti}
              title="選択を解除"
            >
              × 選択解除
            </button>
          </div>
        </Show>
        <For each={ProjectService.currentProject()?.templates.list() ?? []}>
          {(template) => {
            const items = () => groupedNodes().get(template.id) ?? [];
            return (
              <Show when={items().length > 0}>
                <h4 class="panel-outline-subgroup">{template.displayName}</h4>
                <ul class="panel-outline-nodes">
                  <For each={items()}>
                    {(node) => {
                      const display =
                        typeof node.fields['display_name'] === 'string'
                          ? (node.fields['display_name'] as string)
                          : node.slug;
                      return (
                        <li>
                          <button
                            class="panel-outline-node"
                            title={`${display} (${node.slug})`}
                            classList={{
                              'panel-outline-node--selected':
                                SelectionContext.selectedNodeId() === node.id,
                              'panel-outline-node--multi': multiSelected().has(node.id),
                            }}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey) {
                                e.preventDefault();
                                toggleMulti(node.id, true);
                              } else {
                                if (multiSelected().size > 0) clearMulti();
                                SelectionContext.selectNode(node.id);
                              }
                            }}
                            onDragOver={(e) => {
                              if (e.dataTransfer?.types.includes('Files')) {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'copy';
                                e.currentTarget.classList.add('panel-outline-node--drop');
                              }
                            }}
                            onDragLeave={(e) =>
                              e.currentTarget.classList.remove('panel-outline-node--drop')
                            }
                            onDrop={(e) => {
                              e.currentTarget.classList.remove('panel-outline-node--drop');
                              const files = e.dataTransfer?.files;
                              if (!files || files.length === 0) return;
                              const file = files[0];
                              if (!file || !file.type.startsWith('image/')) return;
                              e.preventDefault();
                              void ThumbnailService.uploadForNode(node, file, file.name);
                            }}
                          >
                            <NodeThumbnail node={node} size={24} />
                            <span class="panel-outline-node-label">{display}</span>
                            <Show when={display !== node.slug}>
                              <span class="panel-outline-node-sub">{node.slug}</span>
                            </Show>
                          </button>
                        </li>
                      );
                    }}
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

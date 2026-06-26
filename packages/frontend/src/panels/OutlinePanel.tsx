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
  type TemplateId,
} from '@scenario-studio/core';
import { LoadingOverlay } from '@scenario-studio/ui-kit';
import { NodeThumbnail } from '../global/NodeThumbnail';
import { PanelFocus } from '../services/PanelFocus';
import { PlotSelection } from '../services/PlotSelection';
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
  { template: LOCATION_TEMPLATE, label: '場所' },
  { template: ITEM_TEMPLATE, label: '物品' },
  { template: FACTION_TEMPLATE, label: '組織' },
  { template: EVENT_TEMPLATE, label: '出来事・その他' },
];

export const OutlinePanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [busy, setBusy] = createSignal(false);
  const [newChapterTitle, setNewChapterTitle] = createSignal('新しい章');
  const [newNodeTemplateId, setNewNodeTemplateId] = createSignal<TemplateId>(CHARACTER_TEMPLATE.id);
  const [newNodeName, setNewNodeName] = createSignal('');
  const [newNodeError, setNewNodeError] = createSignal<string | undefined>(undefined);
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set());
  // PR-AG: Outline 複数選択 (Cmd / Shift+クリックで節点を bulk 選択)
  const [multiSelected, setMultiSelected] = createSignal<ReadonlySet<NodeId>>(new Set());

  function isCollapsed(key: string): boolean {
    return collapsed().has(key);
  }

  function toggleSection(key: string): void {
    const next = new Set(collapsed());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  }

  function commitProjectUpdate(): void {
    ProjectService.touch();
  }

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
      const idSet = new Set(ids);
      const nextRelations = ctx.project.relations.filter(
        (r) => !idSet.has(r.source) && !idSet.has(r.target),
      );
      await ctx.relationsRepository.save(nextRelations);
      Object.assign(ctx.project, { nodes: next });
      Object.assign(ctx.project, { relations: nextRelations });
      for (const id of ids) ctx.history.unregister(id);
      Toast.success(`${ids.length} 件のノードを削除`);
      clearMulti();
      commitProjectUpdate();
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

  function uniqueSlug(base: string, existing: ReadonlySet<string>): string {
    if (!existing.has(base)) return base;
    for (let i = 2; i < 1000; i += 1) {
      const candidate = `${base}_${i}`;
      if (!existing.has(candidate)) return candidate;
    }
    return `${base}_${Date.now().toString(36)}`;
  }

  function openChapterPlot(chapterSlug: string, title: string): void {
    PlotSelection.select({ kind: 'chapter', chapterSlug, label: title });
    PanelFocus.focus('timeline-1');
  }

  function openScenePlot(chapterSlug: string, sceneSlug: string, title: string): void {
    PlotSelection.select({ kind: 'scene', chapterSlug, sceneSlug, label: title });
    PanelFocus.focus('timeline-1');
  }

  function openSceneScript(chapterSlug: string, sceneSlug: string, title: string): void {
    SceneSelection.select({ chapterSlug, sceneSlug, label: title });
    PanelFocus.focus('script-1');
  }

  async function addChapter(): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setBusy(true);
    try {
      const idx = ctx.project.scenario.chapters.length + 1;
      const slug = uniqueSlug(
        `ch_${String(idx).padStart(2, '0')}`,
        new Set(ctx.project.scenario.chapters.map((c) => c.slug)),
      );
      const ch = await ctx.scenarioRepository.addChapter({
        slug,
        title: newChapterTitle().trim() || `チャプター ${idx}`,
      });
      const nextChapters = [...ctx.project.scenario.chapters, ch];
      await ctx.scenarioRepository.saveProjectIndex(nextChapters.map((c) => ({ slug: c.slug })));
      const nextScenario = { ...ctx.project.scenario, chapters: nextChapters };
      Object.assign(ctx.project, { scenario: nextScenario });
      commitProjectUpdate();
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
      const slug = uniqueSlug(
        `sc_${String(idx).padStart(2, '0')}`,
        new Set(chapter.scenes.map((s) => s.slug)),
      );
      const scene = await ctx.scenarioRepository.addScene({
        chapterSlug,
        sceneSlug: slug,
        title: `シーン ${idx}`,
      });
      const nextChapters = ctx.project.scenario.chapters.map((c) =>
        c.slug === chapterSlug ? { ...c, scenes: [...c.scenes, scene] } : c,
      );
      Object.assign(ctx.project, {
        scenario: { ...ctx.project.scenario, chapters: nextChapters },
      });
      commitProjectUpdate();
    } catch (e) {
      console.error('addScene failed', e);
      Toast.error(`シーンの追加に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // TODO: 未配線の rename ハンドラ。UI に接続するまで lint 抑制。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      commitProjectUpdate();
    } catch (e) {
      Toast.error(`章タイトル変更に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // TODO: 未配線の rename ハンドラ。UI に接続するまで lint 抑制。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      commitProjectUpdate();
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
      commitProjectUpdate();
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
      commitProjectUpdate();
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
      commitProjectUpdate();
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
      commitProjectUpdate();
      Toast.success(`シーン移動: ${fromChapter} → ${toChapter}`);
    } catch (e) {
      Toast.error(`シーン移動に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function slugFromName(name: string, template: TemplateDefinition): string {
    const ascii = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    const base = ascii || `new_${template.directory.replace(/s$/, '')}`;
    return `${base}_${Date.now().toString(36)}`;
  }

  async function addNode(template: TemplateDefinition): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const name = newNodeName().trim();
    if (name === '') {
      setNewNodeError('名前を入力してください');
      return;
    }
    setNewNodeError(undefined);
    setBusy(true);
    try {
      const slug = slugFromName(name, template);
      const node = createNode(ctx.templates, {
        templateId: template.id,
        slug,
        fields: { display_name: name },
      });
      await ctx.nodeRepository.save(node);
      const next = new Map(ctx.project.nodes);
      next.set(node.id, node);
      Object.assign(ctx.project, { nodes: next });
      ctx.history.register(node);
      SelectionContext.selectNode(node.id);
      setNewNodeName('');
      commitProjectUpdate();
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
        <button
          type="button"
          class="panel-outline-group panel-outline-group-toggle"
          onClick={() => toggleSection('scenarios')}
        >
          <span>{isCollapsed('scenarios') ? '▶' : '▼'}</span>
          シナリオ全体構造
        </button>
        <Show when={!isCollapsed('scenarios')}>
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
                  onDragLeave={(e) =>
                    e.currentTarget.classList.remove('panel-outline-chapter--drop')
                  }
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
                      onClick={() => openChapterPlot(chapter.slug, chapter.title)}
                      title="プロットタブでチャプタープロットを開く"
                    >
                      📖 {chapter.title}
                    </button>
                    <button
                      class="panel-outline-add-scene"
                      disabled={busy()}
                      onClick={() => void addScene(chapter.slug)}
                      title="この章にシーンを追加"
                    >
                      + シーン
                    </button>
                  </span>
                  <Show when={chapter.summary}>
                    {(summary) => <p class="panel-outline-chapter-summary">{summary()}</p>}
                  </Show>
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
                              onClick={() => openScenePlot(chapter.slug, scene.slug, scene.title)}
                              title="プロットタブでシーンプロットを開く"
                            >
                              🎬 {scene.title}
                            </button>
                            <button
                              class="panel-outline-open-script"
                              disabled={busy()}
                              onClick={() => openSceneScript(chapter.slug, scene.slug, scene.title)}
                              title="脚本タブでこのシーンを開く"
                            >
                              脚本
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
              + チャプター
            </button>
          </div>
        </Show>

        <button
          type="button"
          class="panel-outline-group panel-outline-group-toggle"
          onClick={() => toggleSection('nodes')}
        >
          <span>{isCollapsed('nodes') ? '▶' : '▼'}</span>
          要素
        </button>
        <Show when={!isCollapsed('nodes')}>
          <div class="panel-outline-actions panel-outline-add-node-form">
            <select
              value={newNodeTemplateId()}
              disabled={busy()}
              onChange={(e) => setNewNodeTemplateId(e.currentTarget.value as TemplateId)}
            >
              <For each={NEW_NODE_TEMPLATES}>
                {(t) => <option value={t.template.id}>{t.label}</option>}
              </For>
            </select>
            <input
              type="text"
              value={newNodeName()}
              disabled={busy()}
              placeholder="追加する名前"
              onInput={(e) => {
                setNewNodeName(e.currentTarget.value);
                if (newNodeError()) setNewNodeError(undefined);
              }}
            />
            <button
              disabled={busy()}
              onClick={() => {
                const template =
                  NEW_NODE_TEMPLATES.find((t) => t.template.id === newNodeTemplateId())?.template ??
                  CHARACTER_TEMPLATE;
                void addNode(template);
              }}
            >
              + 追加
            </button>
          </div>
          <Show when={newNodeError()}>
            {(msg) => <p class="panel-outline-form-error">{msg()}</p>}
          </Show>
        </Show>
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
            const key = () => `template:${template.id}`;
            return (
              <Show when={!isCollapsed('nodes') && items().length > 0}>
                <button
                  type="button"
                  class="panel-outline-subgroup panel-outline-group-toggle"
                  onClick={() => toggleSection(key())}
                >
                  <span>{isCollapsed(key()) ? '▶' : '▼'}</span>
                  {template.displayName}
                  <small>{items().length}</small>
                </button>
                <Show when={!isCollapsed(key())}>
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
                                  return;
                                }
                                // scroll-to-top 退化防止: 選択直後にパネルが reflow して
                                // 親 container が先頭に戻る現象を見ているので、
                                // scrollTop を保存→次フレームで復元する。
                                const scroller = e.currentTarget.closest(
                                  '.panel-outline-list',
                                ) as HTMLElement | null;
                                const savedScroll = scroller?.scrollTop ?? 0;
                                if (multiSelected().size > 0) clearMulti();
                                SelectionContext.selectNode(node.id);
                                if (scroller) {
                                  requestAnimationFrame(() => {
                                    if (scroller.scrollTop !== savedScroll) {
                                      scroller.scrollTop = savedScroll;
                                    }
                                  });
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
              </Show>
            );
          }}
        </For>
        <Show
          when={
            !isCollapsed('nodes') &&
            (ProjectService.currentProject()?.project.nodes.size ?? 0) === 0
          }
        >
          <p class="panel-outline-empty">
            まだノードがありません。上のボタンから追加してください。
          </p>
        </Show>
      </div>
    </div>
  );
};

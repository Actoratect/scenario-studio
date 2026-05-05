import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { parseYaml, type YamlValue } from '@scenario-studio/core';
import { PanelFocus } from '../services/PanelFocus';
import { ProjectService } from '../services/ProjectService';
import { SceneSelection } from '../services/SceneSelection';
import { Toast } from '../services/Toast';

// Plot Timeline panel (PR-P)。
// 章を横カラム、シーンを縦カードにした Kanban 風タイムラインで物語の流れを俯瞰。
// 各シーンカード: タイトル + 1 行プロット冒頭 + cast チップ + script 行数 (色 + 数字)。
// クリック → Toast で案内 (将来 Script panel へ jump)。
// 詳細: ../../../../Documentation/ScenarioEditor/05_timeline.md,
//       ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §4

interface SceneSummary {
  chapterSlug: string;
  sceneSlug: string;
  title: string;
  cast: readonly string[];
  beat?: string | undefined;
  lineCount: number;
  preview: string;
}

export const PlotTimelinePanel: Component<GroupPanelPartInitParameters> = (params) => {
  const ctx = createMemo(() => ProjectService.currentProject());
  const chapters = createMemo(() => ctx()?.project.scenario.chapters ?? []);
  const [busy, setBusy] = createSignal(false);

  // PR-AD: drag-reorder。Outline と同じ DataTransfer 形式を使う。
  //   chapter drag: application/x-ss-chapter = "<idx>"
  //   scene drag:   application/x-ss-scene   = "<chapterSlug>::<sceneIdx>"
  async function reorderChapters(fromIdx: number, toIdx: number): Promise<void> {
    const c = ctx();
    if (!c || fromIdx === toIdx) return;
    setBusy(true);
    try {
      const arr = [...c.project.scenario.chapters];
      const [moved] = arr.splice(fromIdx, 1);
      if (!moved) return;
      arr.splice(toIdx, 0, moved);
      await c.scenarioRepository.saveProjectIndex(arr.map((ch) => ({ slug: ch.slug })));
      Object.assign(c.project, { scenario: { ...c.project.scenario, chapters: arr } });
    } catch (e) {
      Toast.error(`章の並べ替えに失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function reorderScenes(chapterSlug: string, fromIdx: number, toIdx: number): Promise<void> {
    const c = ctx();
    if (!c || fromIdx === toIdx) return;
    const chapter = c.project.scenario.chapters.find((ch) => ch.slug === chapterSlug);
    if (!chapter) return;
    setBusy(true);
    try {
      const scenes = [...chapter.scenes];
      const [moved] = scenes.splice(fromIdx, 1);
      if (!moved) return;
      scenes.splice(toIdx, 0, moved);
      await c.scenarioRepository.reorderScenes(
        chapterSlug,
        scenes.map((s) => s.slug),
      );
      const next = c.project.scenario.chapters.map((ch) =>
        ch.slug === chapterSlug ? { ...ch, scenes } : ch,
      );
      Object.assign(c.project, { scenario: { ...c.project.scenario, chapters: next } });
    } catch (e) {
      Toast.error(`シーンの並べ替えに失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function moveSceneAcross(
    fromChapter: string,
    fromIdx: number,
    toChapter: string,
    insertAt: number,
  ): Promise<void> {
    const c = ctx();
    if (!c) return;
    const src = c.project.scenario.chapters.find((ch) => ch.slug === fromChapter);
    if (!src) return;
    const moved = src.scenes[fromIdx];
    if (!moved) return;
    setBusy(true);
    try {
      await c.scenarioRepository.moveScene({
        fromChapter,
        toChapter,
        sceneSlug: moved.slug,
        insertAt,
      });
      const next = c.project.scenario.chapters.map((ch) => {
        if (ch.slug === fromChapter) {
          return { ...ch, scenes: ch.scenes.filter((_, i) => i !== fromIdx) };
        }
        if (ch.slug === toChapter) {
          const arr = [...ch.scenes];
          arr.splice(insertAt, 0, moved);
          return { ...ch, scenes: arr };
        }
        return ch;
      });
      Object.assign(c.project, { scenario: { ...c.project.scenario, chapters: next } });
      Toast.success(`シーン移動: ${fromChapter} → ${toChapter}`);
    } catch (e) {
      Toast.error(`シーン移動に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // 全シーンの要約を一括ロード。source は ctx + chapters の組合せ。
  const fetchSource = createMemo(() => {
    const c = ctx();
    return c ? { ctx: c, chs: chapters() } : null;
  });
  const [summaries] = createResource(fetchSource, async (src) => {
    if (!src) return new Map<string, SceneSummary>();
    const out = new Map<string, SceneSummary>();
    for (const ch of src.chs) {
      for (const sc of ch.scenes) {
        const path = `Scenarios/${ch.slug}/${sc.relativePath}`;
        if (!(await src.ctx.adapter.exists(src.ctx.handle, path))) continue;
        try {
          const text = await src.ctx.adapter.read(src.ctx.handle, path);
          const summary = parseSceneSummary(text, ch.slug, sc.slug, sc.title);
          out.set(`${ch.slug}/${sc.slug}`, summary);
        } catch {
          // YAML パース失敗は無視 (preview だけ無くなる)
        }
      }
    }
    return out;
  });

  function activate(s: SceneSummary): void {
    SceneSelection.select({
      chapterSlug: s.chapterSlug,
      sceneSlug: s.sceneSlug,
      label: s.title,
    });
    if (!PanelFocus.focus('script-1')) {
      Toast.info(`シーン: ${s.chapterSlug}/${s.sceneSlug}`);
    }
  }

  // 統計
  const stats = createMemo(() => {
    const all = summaries();
    if (!all) return { scenes: 0, lines: 0, casts: new Set<string>() };
    let lines = 0;
    const casts = new Set<string>();
    for (const s of all.values()) {
      lines += s.lineCount;
      for (const c of s.cast) casts.add(c);
    }
    return { scenes: all.size, lines, casts };
  });

  return (
    <div class="panel-content panel-timeline">
      <header class="panel-timeline-header">
        <span>
          Plot Timeline · <code>{params.api.id}</code>
        </span>
        <span class="panel-timeline-stats">
          {chapters().length} 章 · {stats().scenes} シーン · {stats().lines.toLocaleString('en-US')}{' '}
          行 · 登場 {stats().casts.size} 人
        </span>
      </header>
      <div class="panel-timeline-track">
        <Show
          when={chapters().length > 0}
          fallback={
            <div class="panel-timeline-empty">
              <p>章がまだありません。Outline タブで「+ Chapter」を押してください。</p>
            </div>
          }
        >
          <For each={chapters()}>
            {(ch, idx) => (
              <div
                class="panel-timeline-column"
                onDragOver={(e) => {
                  // 章 drag (並び替え) または scene drag (他章への末尾追加) を受け付ける
                  if (
                    e.dataTransfer?.types.includes('application/x-ss-chapter') ||
                    e.dataTransfer?.types.includes('application/x-ss-scene')
                  ) {
                    e.preventDefault();
                    e.currentTarget.classList.add('panel-timeline-column--drop');
                  }
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove('panel-timeline-column--drop')}
                onDrop={(e) => {
                  e.currentTarget.classList.remove('panel-timeline-column--drop');
                  const chapRaw = e.dataTransfer?.getData('application/x-ss-chapter');
                  if (chapRaw) {
                    e.preventDefault();
                    void reorderChapters(Number(chapRaw), idx());
                    return;
                  }
                  const sceneRaw = e.dataTransfer?.getData('application/x-ss-scene');
                  if (sceneRaw) {
                    const [srcChap, srcIdxStr] = sceneRaw.split('::');
                    if (srcChap && srcChap !== ch.slug && srcIdxStr !== undefined) {
                      e.preventDefault();
                      void moveSceneAcross(srcChap, Number(srcIdxStr), ch.slug, ch.scenes.length);
                    }
                  }
                }}
              >
                <div
                  class="panel-timeline-column-header"
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer?.setData('application/x-ss-chapter', String(idx()));
                    e.dataTransfer!.effectAllowed = 'move';
                  }}
                  title="ドラッグで章を並べ替え"
                >
                  <span class="panel-timeline-drag-handle">⋮⋮</span>
                  <span class="panel-timeline-column-num">{idx() + 1}</span>
                  <span class="panel-timeline-column-title">{ch.title}</span>
                  <span class="panel-timeline-column-slug">{ch.slug}</span>
                </div>
                <Show when={ch.summary}>
                  {(s) => <p class="panel-timeline-column-summary">{s()}</p>}
                </Show>
                <ul class="panel-timeline-cards">
                  <For
                    each={ch.scenes}
                    fallback={
                      <li class="panel-timeline-empty-scene">シーン無し (Outline で「+ Scene」)</li>
                    }
                  >
                    {(sc, sIdx) => {
                      const s = (): SceneSummary | undefined =>
                        summaries()?.get(`${ch.slug}/${sc.slug}`);
                      return (
                        <li
                          class="panel-timeline-card"
                          classList={{ 'panel-timeline-card--busy': busy() }}
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer?.setData(
                              'application/x-ss-scene',
                              `${ch.slug}::${sIdx()}`,
                            );
                            e.dataTransfer!.effectAllowed = 'move';
                            e.stopPropagation();
                          }}
                          onDragOver={(e) => {
                            if (e.dataTransfer?.types.includes('application/x-ss-scene')) {
                              e.preventDefault();
                              e.stopPropagation();
                              e.currentTarget.classList.add('panel-timeline-card--drop');
                            }
                          }}
                          onDragLeave={(e) =>
                            e.currentTarget.classList.remove('panel-timeline-card--drop')
                          }
                          onDrop={(e) => {
                            e.currentTarget.classList.remove('panel-timeline-card--drop');
                            const raw = e.dataTransfer?.getData('application/x-ss-scene');
                            if (!raw) return;
                            const [srcChap, srcIdxStr] = raw.split('::');
                            if (!srcChap || srcIdxStr === undefined) return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (srcChap === ch.slug) {
                              void reorderScenes(ch.slug, Number(srcIdxStr), sIdx());
                            } else {
                              void moveSceneAcross(srcChap, Number(srcIdxStr), ch.slug, sIdx());
                            }
                          }}
                          onClick={() => s() && activate(s() as SceneSummary)}
                        >
                          <div class="panel-timeline-card-header">
                            <span class="panel-timeline-drag-handle">⋮</span>
                            <span class="panel-timeline-card-title">{sc.title}</span>
                            <Show when={s()}>
                              {(sum) => (
                                <span
                                  class="panel-timeline-card-lines"
                                  title={`${sum().lineCount} script lines`}
                                >
                                  {sum().lineCount}
                                </span>
                              )}
                            </Show>
                          </div>
                          <Show when={s()?.beat}>
                            {(b) => <span class="panel-timeline-card-beat">{b()}</span>}
                          </Show>
                          <Show when={s()?.preview}>
                            {(p) => <p class="panel-timeline-card-preview">{p()}</p>}
                          </Show>
                          <Show when={(s()?.cast.length ?? 0) > 0}>
                            <div class="panel-timeline-card-cast">
                              <For each={s()?.cast ?? []}>
                                {(who) => <span class="panel-timeline-card-chip">{who}</span>}
                              </For>
                            </div>
                          </Show>
                        </li>
                      );
                    }}
                  </For>
                </ul>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

function parseSceneSummary(
  yaml: string,
  chapterSlug: string,
  sceneSlug: string,
  fallbackTitle: string,
): SceneSummary {
  const { value } = parseYaml(yaml);
  const v = isMapping(value) ? value : {};
  const plot = isMapping(v['plot']) ? (v['plot'] as { [k: string]: YamlValue }) : undefined;
  const title =
    plot && typeof plot['title'] === 'string'
      ? plot['title']
      : typeof v['title'] === 'string'
        ? v['title']
        : fallbackTitle;
  const cast: string[] = [];
  if (plot && Array.isArray(plot['cast'])) {
    for (const c of plot['cast']) if (typeof c === 'string') cast.push(c);
  }
  const beat = plot && typeof plot['beat'] === 'string' ? plot['beat'] : undefined;
  const script = Array.isArray(v['script']) ? v['script'] : [];
  let lineCount = 0;
  let firstLineText = '';
  for (const item of script) {
    if (!isMapping(item)) continue;
    const kind = item['kind'];
    if (kind === 'line' || kind === 'action') lineCount++;
    if (firstLineText === '' && (kind === 'stage' || kind === 'line' || kind === 'aside')) {
      const text = item['text'];
      if (typeof text === 'string') firstLineText = text;
    }
  }
  const preview = firstLineText.length > 60 ? firstLineText.slice(0, 60) + '…' : firstLineText;
  const out: SceneSummary = {
    chapterSlug,
    sceneSlug,
    title,
    cast,
    lineCount,
    preview,
  };
  if (beat !== undefined) out.beat = beat;
  return out;
}

function isMapping(v: unknown): v is { [k: string]: YamlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

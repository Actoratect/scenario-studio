import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import {
  parseSceneYaml,
  serializeSceneYaml,
  type ParsedScene,
  type YamlValue,
} from '@scenario-studio/core';
import { DirtyTracker } from '../services/DirtyTracker';
import { bumpScriptLintVersion } from '../services/LintService';
import { ProjectService } from '../services/ProjectService';
import { SceneAppearanceIndex } from '../services/SceneAppearanceIndex';
import { Toast } from '../services/Toast';
import { StableTextInput, StableTextarea } from '../global/StableTextControl';

// PR (ux-overhaul): Plot tab 右側に常駐する「プロット詳細」サイドバー。
// 選択中シーンの plot.* (title / beat / tension / status / cast) を編集できる。
// 編集は DirtyTracker に積むだけで、ヘッダ「💾 保存」で flush される。
// クリックで脚本タブにジャンプはしない (= 詳細を読みながら検討するための場所)。

export type PlotDetailSelection =
  | {
      kind: 'chapter';
      chapterSlug: string;
      label?: string | undefined;
    }
  | {
      kind: 'scene';
      chapterSlug: string;
      sceneSlug: string;
      label?: string | undefined;
    };

export interface PlotDetailRailProps {
  selected: PlotDetailSelection | undefined;
}

const COLLAPSED_KEY = 'scenario-studio:plot-rail-collapsed';
const WIDTH_KEY = 'scenario-studio:plot-rail-width';
function loadCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(COLLAPSED_KEY) === 'true';
}
function saveCollapsed(v: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? 'true' : 'false');
  } catch {
    /* quota / private mode */
  }
}
function loadWidth(): number {
  if (typeof localStorage === 'undefined') return 320;
  const raw = localStorage.getItem(WIDTH_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n >= 200 && n <= 800 ? n : 320;
}
function saveWidth(w: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(WIDTH_KEY, String(Math.round(w)));
  } catch {
    /* quota */
  }
}

interface ScenePlotData {
  title: string;
  beat: string;
  cast: readonly string[];
  castText: string;
  tension: number | undefined;
  status: string;
}

interface ChapterPlotData {
  title: string;
  plot: string;
}

function isMapping(v: unknown): v is { [k: string]: YamlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// PR (ux-overhaul-3): per-path staging。タブを切替えても編集が破棄されないよう、
// path -> ParsedScene を Map で保持。保存ボタンで flush + 該当 path の staging を delete。
const scenePlotStaging = new Map<string, ParsedScene>();
const sceneCastTextStaging = new Map<string, string>();
const chapterPlotStaging = new Map<string, ChapterPlotData>();

function extractScenePlot(parsed: ParsedScene): ScenePlotData {
  const plot = isMapping(parsed.meta['plot'])
    ? (parsed.meta['plot'] as { [k: string]: YamlValue })
    : {};
  return {
    title: typeof plot['title'] === 'string' ? plot['title'] : '',
    beat: typeof plot['beat'] === 'string' ? plot['beat'] : '',
    cast: parsed.cast,
    castText: parsed.cast.join(', '),
    tension: typeof plot['tension'] === 'number' ? plot['tension'] : undefined,
    status: typeof plot['status'] === 'string' ? plot['status'] : '',
  };
}

export const PlotDetailRail: Component<PlotDetailRailProps> = (props) => {
  const [collapsed, setCollapsed] = createSignal(loadCollapsed());
  const [width, setWidth] = createSignal(loadWidth());
  const [plotRevision, setPlotRevision] = createSignal(0);
  const bumpPlotRevision = (): void => {
    setPlotRevision((n) => n + 1);
  };

  const sceneSource = createMemo(() => {
    const sel = props.selected;
    if (!sel || sel.kind !== 'scene') return undefined;
    const path = scenePath(sel.chapterSlug, sel.sceneSlug);
    return path ? { ...sel, path } : undefined;
  });

  function toggle(): void {
    const next = !collapsed();
    setCollapsed(next);
    saveCollapsed(next);
  }

  // 左端の resize handle を drag して幅を変える。
  function startWidthResize(e: MouseEvent): void {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width();
    function onMove(ev: MouseEvent): void {
      const dx = startX - ev.clientX; // 左にドラッグで広げる
      const nw = Math.max(200, Math.min(800, startW + dx));
      setWidth(nw);
    }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      saveWidth(width());
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // 選択シーンの YAML を resource で load。selected.path を key にして cache が変わる。
  // staging に既存があればそれを優先 (タブ切替で編集を破棄しない)。
  const [parsed, { mutate, refetch }] = createResource(
    sceneSource,
    async (src): Promise<ParsedScene | undefined> => {
      const staged = scenePlotStaging.get(src.path);
      if (staged) return staged;
      const ctx = ProjectService.currentProject();
      if (!ctx) return undefined;
      if (!(await ctx.adapter.exists(ctx.handle, src.path))) return undefined;
      const text = await ctx.adapter.read(ctx.handle, src.path);
      try {
        return parseSceneYaml(text);
      } catch (e) {
        Toast.error(`シーン読込に失敗: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
      }
    },
  );

  // PR (ux-overhaul-2): フリッカ防止 — refetch 中も前値を保持。
  const scenePlot = createMemo<ScenePlotData | undefined>(() => {
    void plotRevision();
    if (props.selected?.kind !== 'scene') return undefined;
    const p = parsed.latest;
    const src = sceneSource();
    if (!p || !src) return undefined;
    const data = extractScenePlot(p);
    return {
      ...data,
      castText: sceneCastTextStaging.get(src.path) ?? data.castText,
    };
  });

  const chapterPlot = createMemo<ChapterPlotData | undefined>(() => {
    void plotRevision();
    const sel = props.selected;
    if (!sel || sel.kind !== 'chapter') return undefined;
    const staged = chapterPlotStaging.get(sel.chapterSlug);
    if (staged) return staged;
    const ctx = ProjectService.currentProject();
    const ch = ctx?.project.scenario.chapters.find((c) => c.slug === sel.chapterSlug);
    if (!ch) return undefined;
    return { title: ch.title, plot: ch.summary ?? '' };
  });

  /** plot.* を更新して dirty マーク。書き戻しはヘッダ保存ボタンで一括 flush。 */
  function updateScenePlot(patch: Partial<ScenePlotData>): void {
    const cur = parsed();
    const src = sceneSource();
    if (!cur || !src) return;
    const oldPlotRaw = isMapping(cur.meta['plot'])
      ? (cur.meta['plot'] as { [k: string]: YamlValue })
      : {};
    const nextPlotRaw: { [k: string]: YamlValue } = { ...oldPlotRaw };
    if (patch.title !== undefined) nextPlotRaw['title'] = patch.title;
    if (patch.beat !== undefined) nextPlotRaw['beat'] = patch.beat;
    if (patch.tension !== undefined) {
      if (Number.isFinite(patch.tension)) nextPlotRaw['tension'] = patch.tension;
      else delete nextPlotRaw['tension'];
    }
    if (patch.status !== undefined) {
      if (patch.status === '') delete nextPlotRaw['status'];
      else nextPlotRaw['status'] = patch.status;
    }
    if (patch.cast !== undefined) nextPlotRaw['cast'] = [...patch.cast];

    const nextMeta = { ...cur.meta, plot: nextPlotRaw };
    // ParsedScene の cast/title プロパティも reactive に更新
    const nextParsed: ParsedScene = {
      meta: nextMeta,
      title:
        patch.title !== undefined
          ? patch.title
          : typeof nextPlotRaw['title'] === 'string'
            ? nextPlotRaw['title']
            : cur.title,
      cast: patch.cast !== undefined ? patch.cast : cur.cast,
      blocks: cur.blocks,
    };
    mutate(nextParsed);
    scenePlotStaging.set(src.path, nextParsed);
    if (patch.castText !== undefined) sceneCastTextStaging.set(src.path, patch.castText);
    bumpPlotRevision();
    const selectedSnapshot = src; // closure 用に snapshot
    DirtyTracker.mark({
      key: src.path,
      label: src.label ?? sceneLabel(src.chapterSlug, src.sceneSlug),
      saveFn: async () => {
        const ctx = ProjectService.currentProject();
        if (!ctx) return;
        const latest = scenePlotStaging.get(selectedSnapshot.path) ?? nextParsed;
        const latestPlot = isMapping(latest.meta['plot'])
          ? (latest.meta['plot'] as { [k: string]: YamlValue })
          : {};
        const yaml = serializeSceneYaml(latest);
        await ctx.adapter.write(ctx.handle, selectedSnapshot.path, yaml);
        scenePlotStaging.delete(selectedSnapshot.path);
        sceneCastTextStaging.delete(selectedSnapshot.path);
        bumpScriptLintVersion();
        SceneAppearanceIndex.invalidate();
        // PR (ux-overhaul-3): 保存後に in-memory の chapter.scene.title を新しい
        // plot.title に同期。これでプロットタブの card / Outline 等で即座に反映される。
        const newTitle =
          typeof latestPlot['title'] === 'string' ? (latestPlot['title'] as string) : undefined;
        if (newTitle !== undefined) {
          updateSceneTitleInProject(
            selectedSnapshot.chapterSlug,
            selectedSnapshot.sceneSlug,
            newTitle,
          );
        }
      },
    });
  }

  function updateChapterPlot(patch: Partial<ChapterPlotData>): void {
    const sel = props.selected;
    if (!sel || sel.kind !== 'chapter') return;
    const current = chapterPlot();
    if (!current) return;
    const next = { ...current, ...patch };
    chapterPlotStaging.set(sel.chapterSlug, next);
    bumpPlotRevision();
    DirtyTracker.mark({
      key: `Scenarios/${sel.chapterSlug}/_index.yaml`,
      label: next.title,
      saveFn: async () => {
        const ctx = ProjectService.currentProject();
        if (!ctx) return;
        const latest = chapterPlotStaging.get(sel.chapterSlug) ?? next;
        await ctx.scenarioRepository.updateChapter({
          chapterSlug: sel.chapterSlug,
          title: latest.title,
          summary: latest.plot,
        });
        chapterPlotStaging.delete(sel.chapterSlug);
        updateChapterInProject(sel.chapterSlug, latest);
      },
    });
  }

  function commitScenePlotToProject(): void {
    const src = sceneSource();
    if (!src) return;
    const latest = scenePlotStaging.get(src.path) ?? parsed.latest;
    if (!latest) return;
    const latestPlot = isMapping(latest.meta['plot'])
      ? (latest.meta['plot'] as { [k: string]: YamlValue })
      : {};
    const title = typeof latestPlot['title'] === 'string' ? latestPlot['title'] : latest.title;
    updateSceneTitleInProject(src.chapterSlug, src.sceneSlug, title);
  }

  function commitChapterPlotToProject(): void {
    const sel = props.selected;
    if (!sel || sel.kind !== 'chapter') return;
    const latest = chapterPlotStaging.get(sel.chapterSlug);
    if (!latest) return;
    updateChapterInProject(sel.chapterSlug, latest);
  }

  return (
    <aside
      class="ss-plot-rail ss-script-rail"
      classList={{ 'ss-script-rail--collapsed': collapsed() }}
      style={{ width: collapsed() ? '28px' : `${width()}px` }}
    >
      <Show when={!collapsed()}>
        <div
          class="ss-plot-rail-resize"
          onMouseDown={startWidthResize}
          title="ドラッグでパネル幅を変更"
        />
      </Show>
      <header class="ss-script-rail-header">
        <button
          type="button"
          class="ss-script-rail-toggle"
          onClick={toggle}
          title={collapsed() ? 'rail を展開' : 'rail を折りたたむ'}
        >
          {collapsed() ? '◀' : '▶'}
        </button>
        <Show when={!collapsed()}>
          <span class="ss-script-rail-title">
            {props.selected?.kind === 'chapter' ? '📋 チャプタープロット' : '📋 シーンプロット'}
          </span>
        </Show>
      </header>
      <Show when={!collapsed()}>
        <div class="ss-script-rail-body">
          <Show
            when={props.selected}
            fallback={
              <p class="ss-script-rail-empty" style={{ padding: '12px' }}>
                アウトラインか左のカードをクリックすると、ここでプロットを編集できます。
              </p>
            }
          >
            {(sel) => (
              <Show
                when={sel().kind === 'chapter'}
                fallback={
                  <Show when={scenePlot()} fallback={<p class="ss-script-rail-empty">読込中…</p>}>
                    {(p) => (
                      <>
                        <section class="ss-script-rail-section">
                          <h4 class="ss-script-rail-h">対象シーン</h4>
                          <p class="ss-plot-rail-target">
                            {sceneLabel(
                              sel().chapterSlug,
                              (sel() as Extract<PlotDetailSelection, { kind: 'scene' }>).sceneSlug,
                            )}
                          </p>
                        </section>
                        <section class="ss-script-rail-section">
                          <h4 class="ss-script-rail-h">シーンタイトル</h4>
                          <StableTextInput
                            class="ss-plot-rail-input"
                            value={p().title}
                            placeholder="シーンの題名"
                            onInput={(value) => updateScenePlot({ title: value })}
                            onBlur={commitScenePlotToProject}
                          />
                        </section>
                        <section class="ss-script-rail-section">
                          <h4 class="ss-script-rail-h">シーンプロット</h4>
                          <StableTextarea
                            class="ss-plot-rail-textarea"
                            rows="8"
                            value={p().beat}
                            placeholder={'起 — \n承 — \n転 — \n結 — '}
                            onInput={(value) => updateScenePlot({ beat: value })}
                            onBlur={commitScenePlotToProject}
                          />
                        </section>
                        <section class="ss-script-rail-section">
                          <h4 class="ss-script-rail-h">テンション (0.0〜1.0)</h4>
                          <input
                            type="number"
                            class="ss-plot-rail-input"
                            step="0.05"
                            min="0"
                            max="1"
                            value={p().tension ?? ''}
                            onInput={(e) => {
                              const v = Number(e.currentTarget.value);
                              updateScenePlot({ tension: Number.isFinite(v) ? v : undefined });
                            }}
                          />
                        </section>
                        <section class="ss-script-rail-section">
                          <h4 class="ss-script-rail-h">ステータス</h4>
                          <StableTextInput
                            class="ss-plot-rail-input"
                            value={p().status}
                            placeholder="例: draft / review / done"
                            onInput={(value) => updateScenePlot({ status: value })}
                            onBlur={commitScenePlotToProject}
                          />
                        </section>
                        <section class="ss-script-rail-section">
                          <h4 class="ss-script-rail-h">キャスト</h4>
                          <StableTextarea
                            class="ss-plot-rail-textarea"
                            rows="3"
                            value={p().castText}
                            placeholder="カンマ区切りでキャラ名を列挙"
                            onInput={(value) =>
                              updateScenePlot({
                                castText: value,
                                cast: value
                                  .split(/[,、]/u)
                                  .map((s) => s.trim())
                                  .filter((s) => s !== ''),
                              })
                            }
                            onBlur={commitScenePlotToProject}
                          />
                          <Show when={p().cast.length > 0}>
                            <div class="ss-script-rail-chips">
                              <For each={p().cast}>
                                {(c) => <span class="ss-script-rail-chip">{c}</span>}
                              </For>
                            </div>
                          </Show>
                        </section>
                        <section class="ss-script-rail-section">
                          <button
                            type="button"
                            class="ss-plot-rail-reload"
                            onClick={() => {
                              const src = sceneSource();
                              if (!src) return;
                              scenePlotStaging.delete(src.path);
                              sceneCastTextStaging.delete(src.path);
                              DirtyTracker.clear(src.path);
                              void refetch();
                            }}
                            title="ファイルから再読込 (未保存変更は破棄)"
                          >
                            ⟳ 再読込 (未保存破棄)
                          </button>
                        </section>
                      </>
                    )}
                  </Show>
                }
              >
                <Show when={chapterPlot()} fallback={<p class="ss-script-rail-empty">読込中…</p>}>
                  {(p) => (
                    <>
                      <section class="ss-script-rail-section">
                        <h4 class="ss-script-rail-h">対象チャプター</h4>
                        <p class="ss-plot-rail-target">{p().title}</p>
                      </section>
                      <section class="ss-script-rail-section">
                        <h4 class="ss-script-rail-h">チャプタータイトル</h4>
                        <StableTextInput
                          class="ss-plot-rail-input"
                          value={p().title}
                          placeholder="チャプターの題名"
                          onInput={(value) => updateChapterPlot({ title: value })}
                          onBlur={commitChapterPlotToProject}
                        />
                      </section>
                      <section class="ss-script-rail-section">
                        <h4 class="ss-script-rail-h">チャプタープロット</h4>
                        <StableTextarea
                          class="ss-plot-rail-textarea"
                          rows="10"
                          value={p().plot}
                          placeholder="このチャプター全体のあらすじ / 狙い"
                          onInput={(value) => updateChapterPlot({ plot: value })}
                          onBlur={commitChapterPlotToProject}
                        />
                      </section>
                    </>
                  )}
                </Show>
              </Show>
            )}
          </Show>
        </div>
      </Show>
    </aside>
  );
};

function scenePath(chapterSlug: string, sceneSlug: string): string | undefined {
  const ctx = ProjectService.currentProject();
  const chapter = ctx?.project.scenario.chapters.find((c) => c.slug === chapterSlug);
  const scene = chapter?.scenes.find((s) => s.slug === sceneSlug);
  return scene ? `Scenarios/${chapterSlug}/${scene.relativePath}` : undefined;
}

function sceneLabel(chapterSlug: string, sceneSlug: string): string {
  const ctx = ProjectService.currentProject();
  const chapter = ctx?.project.scenario.chapters.find((c) => c.slug === chapterSlug);
  const scene = chapter?.scenes.find((s) => s.slug === sceneSlug);
  if (chapter && scene) return `${chapter.title} / ${scene.title}`;
  return sceneSlug;
}

function updateChapterInProject(chapterSlug: string, data: ChapterPlotData): void {
  const ctx = ProjectService.currentProject();
  if (!ctx) return;
  const nextChapters = ctx.project.scenario.chapters.map((c) => {
    if (c.slug !== chapterSlug) return c;
    const summary = data.plot.trim();
    const base = { ...c, title: data.title.trim() || c.title };
    return summary === '' ? { ...base, summary: undefined } : { ...base, summary };
  });
  Object.assign(ctx.project, { scenario: { ...ctx.project.scenario, chapters: nextChapters } });
  ProjectService.touch();
}

function updateSceneTitleInProject(chapterSlug: string, sceneSlug: string, title: string): void {
  const ctx = ProjectService.currentProject();
  if (!ctx) return;
  const nextTitle = title.trim();
  const nextChapters = ctx.project.scenario.chapters.map((c) =>
    c.slug === chapterSlug
      ? {
          ...c,
          scenes: c.scenes.map((s) =>
            s.slug === sceneSlug ? { ...s, title: nextTitle || s.title } : s,
          ),
        }
      : c,
  );
  Object.assign(ctx.project, { scenario: { ...ctx.project.scenario, chapters: nextChapters } });
  ProjectService.touch();
}

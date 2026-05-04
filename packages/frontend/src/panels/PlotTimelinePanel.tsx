import { createMemo, createResource, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { parseYaml, type YamlValue } from '@scenario-studio/core';
import { ProjectService } from '../services/ProjectService';
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
    Toast.info(
      `シーン: ${s.chapterSlug}/${s.sceneSlug} (Script パネルでドロップダウン選択 / Cmd+K でも可)`,
    );
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
              <div class="panel-timeline-column">
                <div class="panel-timeline-column-header">
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
                    {(sc) => {
                      const s = (): SceneSummary | undefined =>
                        summaries()?.get(`${ch.slug}/${sc.slug}`);
                      return (
                        <li
                          class="panel-timeline-card"
                          onClick={() => s() && activate(s() as SceneSummary)}
                        >
                          <div class="panel-timeline-card-header">
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

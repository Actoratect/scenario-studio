import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import {
  parseSceneYaml,
  serializeSceneYaml,
  type ParsedScene,
  type YamlValue,
} from '@scenario-studio/core';
import { DirtyTracker } from '../services/DirtyTracker';
import { ProjectService } from '../services/ProjectService';
import { Toast } from '../services/Toast';

// PR (ux-overhaul): Plot tab 右側に常駐する「プロット詳細」サイドバー。
// 選択中シーンの plot.* (title / beat / tension / status / cast) を編集できる。
// 編集は DirtyTracker に積むだけで、ヘッダ「💾 保存」で flush される。
// クリックで脚本タブにジャンプはしない (= 詳細を読みながら検討するための場所)。

export interface PlotDetailSelection {
  chapterSlug: string;
  sceneSlug: string;
  /** scene.scn.yaml までの相対 path。 */
  path: string;
  label: string;
}

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

interface PlotData {
  title: string;
  beat: string;
  cast: readonly string[];
  tension: number | undefined;
  status: string;
}

function isMapping(v: unknown): v is { [k: string]: YamlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extractPlot(parsed: ParsedScene): PlotData {
  const plot = isMapping(parsed.meta['plot']) ? (parsed.meta['plot'] as { [k: string]: YamlValue }) : {};
  return {
    title: typeof plot['title'] === 'string' ? plot['title'] : '',
    beat: typeof plot['beat'] === 'string' ? plot['beat'] : '',
    cast: parsed.cast,
    tension: typeof plot['tension'] === 'number' ? plot['tension'] : undefined,
    status: typeof plot['status'] === 'string' ? plot['status'] : '',
  };
}

export const PlotDetailRail: Component<PlotDetailRailProps> = (props) => {
  const [collapsed, setCollapsed] = createSignal(loadCollapsed());
  const [width, setWidth] = createSignal(loadWidth());

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
  const [parsed, { mutate, refetch }] = createResource(
    () => (props.selected ? props.selected.path : ''),
    async (path: string): Promise<ParsedScene | undefined> => {
      if (!path) return undefined;
      const ctx = ProjectService.currentProject();
      if (!ctx) return undefined;
      if (!(await ctx.adapter.exists(ctx.handle, path))) return undefined;
      const text = await ctx.adapter.read(ctx.handle, path);
      try {
        return parseSceneYaml(text);
      } catch (e) {
        Toast.error(`シーン読込に失敗: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
      }
    },
  );

  // PR (ux-overhaul-2): フリッカ防止 — refetch 中も前値を保持。
  const plot = createMemo<PlotData | undefined>(() => {
    const p = parsed.latest;
    return p ? extractPlot(p) : undefined;
  });

  /** plot.* を更新して dirty マーク。書き戻しはヘッダ保存ボタンで一括 flush。 */
  function updatePlot(patch: Partial<PlotData>): void {
    const cur = parsed();
    const sel = props.selected;
    if (!cur || !sel) return;
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
      if (patch.status.trim() === '') delete nextPlotRaw['status'];
      else nextPlotRaw['status'] = patch.status.trim();
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
    DirtyTracker.mark({
      key: sel.path,
      label: sel.label,
      saveFn: async () => {
        const ctx = ProjectService.currentProject();
        if (!ctx) return;
        const yaml = serializeSceneYaml(nextParsed);
        await ctx.adapter.write(ctx.handle, sel.path, yaml);
      },
    });
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
          <span class="ss-script-rail-title">📋 プロット詳細</span>
        </Show>
      </header>
      <Show when={!collapsed()}>
        <div class="ss-script-rail-body">
          <Show
            when={props.selected}
            fallback={
              <p class="ss-script-rail-empty" style={{ padding: '12px' }}>
                左のプロットカードをクリックすると、ここで plot 情報を編集できます。
              </p>
            }
          >
            {(sel) => (
              <Show
                when={plot()}
                fallback={<p class="ss-script-rail-empty">読込中…</p>}
              >
                {(p) => (
                  <>
                    <section class="ss-script-rail-section">
                      <h4 class="ss-script-rail-h">対象シーン</h4>
                      <p class="ss-plot-rail-target">{sel().label}</p>
                      <p class="ss-plot-rail-path">{sel().path}</p>
                    </section>
                    <section class="ss-script-rail-section">
                      <h4 class="ss-script-rail-h">タイトル</h4>
                      <input
                        type="text"
                        class="ss-plot-rail-input"
                        value={p().title}
                        placeholder="シーンの題名"
                        onInput={(e) => updatePlot({ title: e.currentTarget.value })}
                      />
                    </section>
                    <section class="ss-script-rail-section">
                      <h4 class="ss-script-rail-h">プロット (起承転結)</h4>
                      <textarea
                        class="ss-plot-rail-textarea"
                        rows="8"
                        value={p().beat}
                        placeholder={
                          '起 — \n承 — \n転 — \n結 — '
                        }
                        onInput={(e) => updatePlot({ beat: e.currentTarget.value })}
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
                          updatePlot({ tension: Number.isFinite(v) ? v : undefined });
                        }}
                      />
                    </section>
                    <section class="ss-script-rail-section">
                      <h4 class="ss-script-rail-h">ステータス</h4>
                      <input
                        type="text"
                        class="ss-plot-rail-input"
                        value={p().status}
                        placeholder="例: draft / review / done"
                        onInput={(e) => updatePlot({ status: e.currentTarget.value })}
                      />
                    </section>
                    <section class="ss-script-rail-section">
                      <h4 class="ss-script-rail-h">キャスト</h4>
                      <textarea
                        class="ss-plot-rail-textarea"
                        rows="3"
                        value={p().cast.join(', ')}
                        placeholder="カンマ区切りで dev_name / slug を列挙"
                        onInput={(e) =>
                          updatePlot({
                            cast: e.currentTarget.value
                              .split(/[,、]/u)
                              .map((s) => s.trim())
                              .filter((s) => s !== ''),
                          })
                        }
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
                        onClick={() => refetch()}
                        title="ファイルから再読込 (未保存変更は破棄)"
                      >
                        ⟳ 再読込
                      </button>
                    </section>
                  </>
                )}
              </Show>
            )}
          </Show>
        </div>
      </Show>
    </aside>
  );
};

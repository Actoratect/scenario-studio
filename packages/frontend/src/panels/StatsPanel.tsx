import { createMemo, createResource, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { CHARACTER_TEMPLATE, parseYaml, type YamlValue } from '@scenario-studio/core';
import { PanelFocus } from '../services/PanelFocus';
import { ProjectService } from '../services/ProjectService';
import { SceneSelection } from '../services/SceneSelection';
import { SelectionContext } from '../services/SelectionContext';

// プロジェクト統計パネル (PR-V)。
// - 章 / シーン / 行数 / 文字数 サマリ
// - キャラクター別 登場行数ランキング (top 10、クリックで Inspector jump)
// - 章別 文字数ランキング (クリックで Script jump)
// - 未使用キャラクター (どのシーンの who: にも出ない)
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md

interface CharStat {
  slug: string;
  display: string;
  nodeId: string;
  lines: number;
  chars: number;
}

interface ChapterStat {
  slug: string;
  title: string;
  scenes: number;
  lines: number;
  chars: number;
  /** 最初のシーン (jump 用)。無ければ undefined。 */
  firstScene?: { sceneSlug: string; title: string };
}

interface StatsResult {
  sceneCount: number;
  totalLines: number;
  totalChars: number;
  byCharacter: readonly CharStat[];
  byChapter: readonly ChapterStat[];
  unusedCharacters: readonly { nodeId: string; slug: string; display: string }[];
}

const EMPTY: StatsResult = {
  sceneCount: 0,
  totalLines: 0,
  totalChars: 0,
  byCharacter: [],
  byChapter: [],
  unusedCharacters: [],
};

export const StatsPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const ctx = createMemo(() => ProjectService.currentProject());

  const source = createMemo(() => {
    const c = ctx();
    return c
      ? {
          c,
          chs: c.project.scenario.chapters,
          nodes: c.project.nodes,
        }
      : null;
  });

  const [stats] = createResource(source, async (src): Promise<StatsResult> => {
    if (!src) return EMPTY;
    return computeStats(src.c, src.chs, src.nodes);
  });

  function jumpToCharacter(c: CharStat): void {
    SelectionContext.selectNode(c.nodeId as never);
    PanelFocus.focus('inspector-1');
  }

  function jumpToChapter(c: ChapterStat): void {
    if (c.firstScene) {
      SceneSelection.select({
        chapterSlug: c.slug,
        sceneSlug: c.firstScene.sceneSlug,
        label: c.firstScene.title,
      });
      PanelFocus.focus('script-1');
    } else {
      PanelFocus.focus('outline-1');
    }
  }

  function jumpToUnused(u: { nodeId: string }): void {
    SelectionContext.selectNode(u.nodeId as never);
    PanelFocus.focus('inspector-1');
  }

  return (
    <div class="panel-content panel-stats">
      <header class="panel-stats-header">
        Project Stats · <code>{params.api.id}</code>
      </header>
      <Show when={ctx()} fallback={<p>プロジェクトが開かれていません。</p>}>
        <Show when={stats()} fallback={<p>計算中…</p>}>
          {(s) => (
            <>
              <section class="panel-stats-section">
                <h3>サマリ</h3>
                <ul class="panel-stats-summary">
                  <li>
                    <strong>{s().sceneCount}</strong>
                    <span>シーン</span>
                  </li>
                  <li>
                    <strong>{s().totalLines.toLocaleString('en-US')}</strong>
                    <span>セリフ行</span>
                  </li>
                  <li>
                    <strong>{s().totalChars.toLocaleString('en-US')}</strong>
                    <span>文字</span>
                  </li>
                  <li>
                    <strong>{s().byCharacter.filter((c) => c.lines > 0).length}</strong>
                    <span>登場キャラ</span>
                  </li>
                </ul>
              </section>

              <section class="panel-stats-section">
                <h3>キャラクター別 登場行数 (Top 10)</h3>
                <Show when={s().byCharacter.length > 0} fallback={<p>データなし</p>}>
                  <ol class="panel-stats-rank">
                    <For each={s().byCharacter.slice(0, 10)}>
                      {(c) => {
                        const max = s().byCharacter[0]?.lines ?? 1;
                        const pct = max === 0 ? 0 : Math.round((c.lines / max) * 100);
                        return (
                          <li class="panel-stats-rank-row">
                            <button
                              type="button"
                              class="panel-stats-rank-link"
                              onClick={() => jumpToCharacter(c)}
                            >
                              {c.display}
                            </button>
                            <div class="panel-stats-bar">
                              <div class="panel-stats-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span class="panel-stats-num">{c.lines}</span>
                          </li>
                        );
                      }}
                    </For>
                  </ol>
                </Show>
              </section>

              <section class="panel-stats-section">
                <h3>章別 文字数</h3>
                <Show when={s().byChapter.length > 0} fallback={<p>データなし</p>}>
                  <ol class="panel-stats-rank">
                    <For each={s().byChapter}>
                      {(c) => {
                        const max = Math.max(...s().byChapter.map((x) => x.chars), 1);
                        const pct = Math.round((c.chars / max) * 100);
                        return (
                          <li class="panel-stats-rank-row">
                            <button
                              type="button"
                              class="panel-stats-rank-link"
                              onClick={() => jumpToChapter(c)}
                            >
                              {c.title}
                            </button>
                            <div class="panel-stats-bar">
                              <div
                                class="panel-stats-bar-fill panel-stats-bar-fill--alt"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span class="panel-stats-num">
                              {c.chars.toLocaleString('en-US')} 字
                            </span>
                          </li>
                        );
                      }}
                    </For>
                  </ol>
                </Show>
              </section>

              <section class="panel-stats-section">
                <h3>
                  未使用キャラクター{' '}
                  <span class="panel-stats-meta">({s().unusedCharacters.length} 件)</span>
                </h3>
                <p class="panel-stats-hint">
                  シーンの <code>who:</code> から一度も呼ばれていないキャラ。 Lint の orphan-node
                  とは別 (こちらは脚本中での出番を見る)。
                </p>
                <Show when={s().unusedCharacters.length > 0} fallback={<p>無し</p>}>
                  <ul class="panel-stats-unused">
                    <For each={s().unusedCharacters}>
                      {(u) => (
                        <li>
                          <button
                            type="button"
                            class="panel-stats-rank-link"
                            onClick={() => jumpToUnused(u)}
                          >
                            {u.display} <code>{u.slug}</code>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>
            </>
          )}
        </Show>
      </Show>
    </div>
  );
};

// ===== ヘルパ =====

async function computeStats(
  ctx: NonNullable<ReturnType<typeof ProjectService.currentProject>>,
  chs: readonly {
    slug: string;
    title: string;
    scenes: readonly { slug: string; title: string; relativePath: string }[];
  }[],
  nodes: ReadonlyMap<string, import('@scenario-studio/core').ScenarioNode>,
): Promise<StatsResult> {
  // キャラ lookup (slug + dev_name どちらでも引けるように)
  const characters = new Map<string, { slug: string; display: string; nodeId: string }>();
  for (const node of nodes.values()) {
    if (node.templateId !== CHARACTER_TEMPLATE.id) continue;
    const display =
      typeof node.fields['display_name'] === 'string' && node.fields['display_name'] !== ''
        ? (node.fields['display_name'] as string)
        : node.slug;
    const entry = { slug: node.slug, display, nodeId: node.id };
    characters.set(node.slug, entry);
    const dev = node.fields['dev_name'];
    if (typeof dev === 'string' && dev !== '') {
      characters.set(dev, entry);
    }
  }

  const charLines = new Map<string, { lines: number; chars: number }>();
  const seenSlugs = new Set<string>();
  let sceneCount = 0;
  let totalLines = 0;
  let totalChars = 0;
  const chapterStats: ChapterStat[] = [];

  for (const ch of chs) {
    let chLines = 0;
    let chChars = 0;
    let chSceneCount = 0;
    for (const sc of ch.scenes) {
      const path = `Scenarios/${ch.slug}/${sc.relativePath}`;
      if (!(await ctx.adapter.exists(ctx.handle, path))) continue;
      sceneCount++;
      chSceneCount++;
      try {
        const text = await ctx.adapter.read(ctx.handle, path);
        const { value } = parseYaml(text);
        if (!isMapping(value)) continue;
        const script = (value as { [k: string]: YamlValue })['script'];
        if (!Array.isArray(script)) continue;
        for (const item of script) {
          if (!isMapping(item)) continue;
          const kind = item['kind'];
          const text2 = item['text'];
          const charsLen = typeof text2 === 'string' ? text2.length : 0;
          totalChars += charsLen;
          chChars += charsLen;
          if (kind === 'line' || kind === 'action') {
            totalLines++;
            chLines++;
            const who = item['who'];
            if (typeof who === 'string') {
              seenSlugs.add(who);
              const cur = charLines.get(who) ?? { lines: 0, chars: 0 };
              charLines.set(who, { lines: cur.lines + 1, chars: cur.chars + charsLen });
            }
          }
        }
      } catch {
        // skip bad YAML
      }
    }
    const stat: ChapterStat = {
      slug: ch.slug,
      title: ch.title,
      scenes: chSceneCount,
      lines: chLines,
      chars: chChars,
    };
    if (ch.scenes[0]) {
      stat.firstScene = { sceneSlug: ch.scenes[0].slug, title: ch.scenes[0].title };
    }
    chapterStats.push(stat);
  }

  // キャラランキング (登場ある順)
  const byCharacter: CharStat[] = [];
  for (const [slug, counts] of charLines) {
    const c = characters.get(slug);
    if (!c) {
      byCharacter.push({
        slug,
        display: slug,
        nodeId: '',
        lines: counts.lines,
        chars: counts.chars,
      });
      continue;
    }
    byCharacter.push({
      slug: c.slug,
      display: c.display,
      nodeId: c.nodeId,
      lines: counts.lines,
      chars: counts.chars,
    });
  }
  byCharacter.sort((a, b) => b.lines - a.lines);

  // 未使用キャラ: characters にあって seenSlugs / dev_name にも出てこないもの
  const unusedCharacters: { nodeId: string; slug: string; display: string }[] = [];
  const usedNodeIds = new Set<string>();
  for (const slug of seenSlugs) {
    const c = characters.get(slug);
    if (c) usedNodeIds.add(c.nodeId);
  }
  for (const node of nodes.values()) {
    if (node.templateId !== CHARACTER_TEMPLATE.id) continue;
    if (usedNodeIds.has(node.id)) continue;
    const display =
      typeof node.fields['display_name'] === 'string' && node.fields['display_name'] !== ''
        ? (node.fields['display_name'] as string)
        : node.slug;
    unusedCharacters.push({ nodeId: node.id, slug: node.slug, display });
  }
  unusedCharacters.sort((a, b) => a.display.localeCompare(b.display));

  return {
    sceneCount,
    totalLines,
    totalChars,
    byCharacter,
    byChapter: chapterStats,
    unusedCharacters,
  };
}

function isMapping(v: unknown): v is { [k: string]: YamlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

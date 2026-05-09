import { createMemo, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { CHARACTER_TEMPLATE, type ParsedScene, type ScenarioNode } from '@scenario-studio/core';
import { NodeThumbnail } from '../global/NodeThumbnail';
import { deriveGlossary, scanGlossary } from '../services/GlossaryHighlight';
import { LintService } from '../services/LintService';
import { PanelFocus } from '../services/PanelFocus';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';

// PR-AS: Script Context Rail (UX-2)。
// ScriptPanel の右側に常駐する read-only サイドバー。
// 執筆中に別タブへ移動せず、シーンの cast / glossary hits / lint /
// 文字数密度 / AI に送る文脈プレビューが見える。
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §B

const COLLAPSED_KEY = 'scenario-studio:script-rail-collapsed';

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

export interface ScriptContextRailProps {
  parsed: ParsedScene;
  /** 表示中の scene 識別子。未選択 (sample 表示中) は undefined。 */
  chapterSlug: string | undefined;
  sceneSlug: string | undefined;
}

interface CastEntry {
  identifier: string; // who: の値 (slug or dev_name)
  node: ScenarioNode | undefined;
  display: string;
  count: number;
}

export const ScriptContextRail: Component<ScriptContextRailProps> = (props) => {
  const [collapsed, setCollapsed] = createSignal(loadCollapsed());

  function toggle(): void {
    const next = !collapsed();
    setCollapsed(next);
    saveCollapsed(next);
  }

  // 全ノードを (slug + dev_name) → ScenarioNode の lookup map にする
  const characterByIdentifier = createMemo(() => {
    const ctx = ProjectService.currentProject();
    const map = new Map<string, ScenarioNode>();
    if (!ctx) return map;
    for (const node of ctx.project.nodes.values()) {
      if (node.templateId !== CHARACTER_TEMPLATE.id) continue;
      map.set(node.slug, node);
      const dev = node.fields['dev_name'];
      if (typeof dev === 'string' && dev !== '') map.set(dev, node);
    }
    return map;
  });

  /** scene の who: で実際に登場するキャラを発言数付きで集計。 */
  const cast = createMemo<readonly CastEntry[]>(() => {
    const counter = new Map<string, number>();
    for (const block of props.parsed.blocks) {
      if ((block.kind === 'line' || block.kind === 'action') && block.who) {
        counter.set(block.who, (counter.get(block.who) ?? 0) + 1);
      }
    }
    const entries: CastEntry[] = [];
    const lookup = characterByIdentifier();
    for (const [id, count] of counter) {
      const node = lookup.get(id);
      const display =
        (node && typeof node.fields['display_name'] === 'string'
          ? (node.fields['display_name'] as string)
          : node?.slug) ?? id;
      entries.push({ identifier: id, node, display, count });
    }
    return entries.sort((a, b) => b.count - a.count);
  });

  /** scene の全 text を結合した文字列。glossary scan に使う。 */
  const sceneText = createMemo(() =>
    props.parsed.blocks
      .map((b) => {
        if ('text' in b && typeof b.text === 'string') return b.text;
        return '';
      })
      .join('\n'),
  );

  const glossaryScan = createMemo(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx)
      return {
        okTerms: [] as readonly string[],
        violations: [] as readonly { match: string; term: string }[],
      };
    return scanGlossary(sceneText(), deriveGlossary(ctx.project));
  });

  /** Lint issues — 現在 scene に関連しそうなもののみ filter。
   *  consecutive-same-speaker / empty-script / script-unknown-who は scene label を含む。 */
  const sceneIssues = createMemo(() => {
    const all = LintService.issues();
    if (!props.chapterSlug || !props.sceneSlug) return [];
    const sceneSlug = props.sceneSlug;
    return all.filter((i) => {
      // message 中に scene slug が含まれているもの (緩い fuzzy match)
      // OR scene 共通 (consecutive / empty / unknown-who) で他は除外
      if (
        i.ruleId === 'consecutive-same-speaker' ||
        i.ruleId === 'empty-script' ||
        i.ruleId === 'script-unknown-who'
      ) {
        return i.message.includes(sceneSlug) || i.message.includes(`/ ${sceneSlug}`);
      }
      return false;
    });
  });

  /** 文字数 / line 数 / 平均 */
  const density = createMemo(() => {
    let lines = 0;
    let chars = 0;
    for (const b of props.parsed.blocks) {
      const t = 'text' in b && typeof b.text === 'string' ? b.text : '';
      chars += t.length;
      if (b.kind === 'line' || b.kind === 'action') lines++;
    }
    return { lines, chars, avg: lines > 0 ? Math.round(chars / lines) : 0 };
  });

  function jumpToCharacter(node: ScenarioNode | undefined): void {
    if (!node) return;
    SelectionContext.selectNode(node.id);
    PanelFocus.focus('inspector-1');
  }

  return (
    <aside class="ss-script-rail" classList={{ 'ss-script-rail--collapsed': collapsed() }}>
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
          <span class="ss-script-rail-title">📋 シーン詳細</span>
        </Show>
      </header>

      <Show when={!collapsed()}>
        <div class="ss-script-rail-body">
          {/* シーンメタ */}
          <section class="ss-script-rail-section">
            <h4 class="ss-script-rail-h">概要</h4>
            <Show
              when={props.parsed.title}
              fallback={<p class="ss-script-rail-empty">タイトル未設定</p>}
            >
              <p class="ss-script-rail-title-text">{props.parsed.title}</p>
            </Show>
            <dl class="ss-script-rail-meta">
              <dt>ブロック</dt>
              <dd>{props.parsed.blocks.length}</dd>
              <dt>セリフ</dt>
              <dd>{density().lines}</dd>
              <dt>文字</dt>
              <dd>{density().chars.toLocaleString('en-US')}</dd>
              <dt>平均</dt>
              <dd>{density().avg} 字/行</dd>
            </dl>
          </section>

          {/* Cast */}
          <section class="ss-script-rail-section">
            <h4 class="ss-script-rail-h">登場 ({cast().length})</h4>
            <Show
              when={cast().length > 0}
              fallback={<p class="ss-script-rail-empty">セリフ無し</p>}
            >
              <ul class="ss-script-rail-cast">
                <For each={cast()}>
                  {(c) => (
                    <li>
                      <button
                        type="button"
                        class="ss-script-rail-cast-row"
                        classList={{ 'ss-script-rail-cast-row--missing': !c.node }}
                        onClick={() => jumpToCharacter(c.node)}
                        title={
                          c.node
                            ? 'Inspector で開く'
                            : 'プロジェクトに該当キャラなし (script-unknown-who)'
                        }
                        disabled={!c.node}
                      >
                        <Show
                          when={c.node}
                          fallback={<span class="ss-script-rail-cast-missing">⚠</span>}
                        >
                          {(n) => <NodeThumbnail node={n()} size={20} />}
                        </Show>
                        <span class="ss-script-rail-cast-name">{c.display}</span>
                        <span class="ss-script-rail-cast-count">{c.count}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>

          {/* Glossary */}
          <Show when={glossaryScan().okTerms.length > 0 || glossaryScan().violations.length > 0}>
            <section class="ss-script-rail-section">
              <h4 class="ss-script-rail-h">用語</h4>
              <Show when={glossaryScan().okTerms.length > 0}>
                <div class="ss-script-rail-chips">
                  <For each={glossaryScan().okTerms}>
                    {(t) => <span class="ss-script-rail-chip ss-script-rail-chip--ok">✓ {t}</span>}
                  </For>
                </div>
              </Show>
              <Show when={glossaryScan().violations.length > 0}>
                <div class="ss-script-rail-chips">
                  <For each={glossaryScan().violations}>
                    {(v) => (
                      <span class="ss-script-rail-chip ss-script-rail-chip--warn">
                        ⚠ {v.match} → {v.term}
                      </span>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          </Show>

          {/* Lint hints */}
          <Show when={sceneIssues().length > 0}>
            <section class="ss-script-rail-section">
              <h4 class="ss-script-rail-h">警告 ({sceneIssues().length})</h4>
              <ul class="ss-script-rail-issues">
                <For each={sceneIssues()}>
                  {(i) => (
                    <li class="ss-script-rail-issue" data-severity={i.severity}>
                      <span class="ss-script-rail-issue-rule">[{i.ruleId}]</span>
                      <span class="ss-script-rail-issue-msg">
                        {i.message.replace(/^\[[^\]]+\]\s*/, '')}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>

          {/* AI 文脈プレビュー (折りたたみ) */}
          <section class="ss-script-rail-section">
            <h4 class="ss-script-rail-h">AI 文脈</h4>
            <details class="ss-script-rail-ai-preview">
              <summary>Cmd+Shift+A で送られる内容 (折りたたみ)</summary>
              <pre>
                {sceneText().slice(0, 800)}
                {sceneText().length > 800 ? '…' : ''}
              </pre>
            </details>
            <p class="ss-script-rail-hint">
              テキスト欄を右クリック → 「🤖 自然に / 短く / …」で部分書換
            </p>
          </section>
        </div>
      </Show>
    </aside>
  );
};

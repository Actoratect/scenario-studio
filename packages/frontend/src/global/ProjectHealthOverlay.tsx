import { createSignal, For, Match, Show, Switch } from 'solid-js';
import type { Component } from 'solid-js';
import type { LintIssue, NodeId } from '@scenario-studio/core';
import { AiService } from '../services/AiService';
import { PanelFocus } from '../services/PanelFocus';
import {
  ProjectHealth,
  type ChapterProgress,
  type HealthIssueKind,
} from '../services/ProjectHealth';
import { ProjectService } from '../services/ProjectService';
import { SceneSelection } from '../services/SceneSelection';
import { SelectionContext } from '../services/SelectionContext';

// PR-AT: Project Health overlay (UX-1)。
// 起動直後に「今日は何を直せば前進するか」を見せる。
// 既定タブを増やさず、Workspace header の 🩺 ボタン + Cmd+K から呼ばれる。
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §A

const [open, setOpen] = createSignal(false);

export const ProjectHealthOverlay = {
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

function jumpToLint(issue: LintIssue): void {
  if (issue.nodeId) {
    SelectionContext.selectNode(issue.nodeId);
    PanelFocus.focus('inspector-1');
    ProjectHealthOverlay.hide();
    return;
  }
  // scene 系 lint は message から scene slug を抽出して jump
  const m = /\[([^/]+) \/ ([^\]]+)\]/.exec(issue.message);
  if (m) {
    const ctx = ProjectService.currentProject();
    if (ctx) {
      const ch = ctx.project.scenario.chapters.find((c) => c.title === m[1]);
      if (ch) {
        const sc = ch.scenes.find((s) => s.title === m[2]);
        if (sc) {
          SceneSelection.select({
            chapterSlug: ch.slug,
            sceneSlug: sc.slug,
            label: sc.title,
          });
          PanelFocus.focus('script-1');
          ProjectHealthOverlay.hide();
          return;
        }
      }
    }
  }
  // 何もできない時は Console panel を開く
  PanelFocus.focus('console-1');
  ProjectHealthOverlay.hide();
}

function jumpToCurated(c: HealthIssueKind): void {
  if (c.kind === 'missing-thumbnail' || c.kind === 'unset-display-name') {
    SelectionContext.selectNode(c.nodeId as NodeId);
    PanelFocus.focus('inspector-1');
  } else if (c.kind === 'scene-empty-cast') {
    SceneSelection.select({
      chapterSlug: c.chapterSlug,
      sceneSlug: c.sceneSlug,
      label: c.label,
    });
    PanelFocus.focus('script-1');
  } else {
    jumpToLint(c.issue);
    return;
  }
  ProjectHealthOverlay.hide();
}

function jumpToChapter(p: ChapterProgress): void {
  PanelFocus.focus('outline-1');
  ProjectHealthOverlay.hide();
  void p;
}

const SEVERITY_LABEL = { error: '⛔ エラー', warning: '⚠️ 警告', info: 'ℹ️ ヒント' };

const Ui: Component = () => {
  const snap = (): ReturnType<typeof ProjectHealth.snapshot> => ProjectHealth.snapshot();
  const aiStatus = (): string => {
    const s = AiService.status();
    if (s.kind === 'unlocked') return `unlocked (${s.providerId})`;
    if (s.kind === 'no-key') return '未設定 (no-key)';
    return 'locked';
  };
  return (
    <div class="ss-modal-backdrop" onClick={() => ProjectHealthOverlay.hide()}>
      <div class="ss-modal ss-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>🩺 プロジェクト ヘルス</h3>
        <p class="ss-modal-caption">
          今プロジェクトの状態。各項目をクリックで該当箇所にジャンプします。
        </p>

        {/* 概要バー */}
        <div class="ss-health-summary">
          <span class="ss-health-pill ss-health-pill--error">⛔ {snap().counts.error}</span>
          <span class="ss-health-pill ss-health-pill--warning">⚠️ {snap().counts.warning}</span>
          <span class="ss-health-pill ss-health-pill--info">ℹ️ {snap().counts.info}</span>
          <span class="ss-health-pill ss-health-pill--neutral">🤖 AI: {aiStatus()}</span>
        </div>

        {/* Top Lint */}
        <Show when={snap().topIssues.length > 0}>
          <section class="ss-health-section">
            <h4>Lint Top {Math.min(snap().topIssues.length, 12)} 件</h4>
            <ul class="ss-health-list">
              <For each={snap().topIssues}>
                {(i) => (
                  <li>
                    <button
                      type="button"
                      class="ss-health-row"
                      data-severity={i.severity}
                      onClick={() => jumpToLint(i)}
                      title={i.nodeId ? 'Inspector に jump' : 'Console panel を開く'}
                    >
                      <span class="ss-health-row-label">{SEVERITY_LABEL[i.severity]}</span>
                      <span class="ss-health-row-rule">[{i.ruleId}]</span>
                      <span class="ss-health-row-msg">{i.message}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>

        {/* Curated production / metadata 不足 */}
        <Show when={snap().curatedIssues.length > 0}>
          <section class="ss-health-section">
            <h4>制作上の不足 (上位 {Math.min(snap().curatedIssues.length, 20)} 件)</h4>
            <ul class="ss-health-list">
              <For each={snap().curatedIssues.slice(0, 20)}>
                {(c) => (
                  <li>
                    <button
                      type="button"
                      class="ss-health-row"
                      data-severity="info"
                      onClick={() => jumpToCurated(c)}
                    >
                      <Switch>
                        <Match when={c.kind === 'missing-thumbnail'}>
                          <span class="ss-health-row-label">🖼 サムネ未設定</span>
                          <span class="ss-health-row-msg">
                            {(c as Extract<HealthIssueKind, { kind: 'missing-thumbnail' }>).display}{' '}
                            (
                            {
                              (c as Extract<HealthIssueKind, { kind: 'missing-thumbnail' }>)
                                .templateLabel
                            }
                            )
                          </span>
                        </Match>
                        <Match when={c.kind === 'unset-display-name'}>
                          <span class="ss-health-row-label">🏷 名前未設定</span>
                          <span class="ss-health-row-msg">
                            {(c as Extract<HealthIssueKind, { kind: 'unset-display-name' }>).slug} (
                            {
                              (c as Extract<HealthIssueKind, { kind: 'unset-display-name' }>)
                                .templateLabel
                            }
                            )
                          </span>
                        </Match>
                      </Switch>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>

        {/* 章別 進捗 */}
        <Show when={snap().chapterProgress.length > 0}>
          <section class="ss-health-section">
            <h4>章別 進捗</h4>
            <ul class="ss-health-chapters">
              <For each={snap().chapterProgress}>
                {(p) => {
                  const filled = p.totalScenes - p.emptyScenes;
                  const pct = p.totalScenes > 0 ? Math.round((filled / p.totalScenes) * 100) : 0;
                  return (
                    <li class="ss-health-chapter">
                      <button
                        type="button"
                        class="ss-health-chapter-row"
                        onClick={() => jumpToChapter(p)}
                        title="Outline で開く"
                      >
                        <span class="ss-health-chapter-title">{p.title}</span>
                        <div class="ss-health-chapter-bar">
                          <div class="ss-health-chapter-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span class="ss-health-chapter-stat">
                          {filled}/{p.totalScenes} ({pct}%)
                        </span>
                      </button>
                    </li>
                  );
                }}
              </For>
            </ul>
          </section>
        </Show>

        <Show
          when={
            snap().topIssues.length === 0 &&
            snap().curatedIssues.length === 0 &&
            snap().chapterProgress.length === 0
          }
        >
          <p class="ss-modal-caption">
            プロジェクトが開かれていない、または問題が検出されていません。
          </p>
        </Show>

        <div class="ss-modal-actions">
          <span class="ss-modal-spacer" />
          <button type="button" data-variant="primary" onClick={() => ProjectHealthOverlay.hide()}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export const ProjectHealthOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <Ui />
    </Show>
  );
};

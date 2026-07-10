import { createResource, createSignal, For, Match, Show, Switch } from 'solid-js';
import type { Component } from 'solid-js';
import type { LintIssue, NodeId } from '@scenario-studio/core';
import { AiService } from '../services/AiService';
import { DirtyTracker } from '../services/DirtyTracker';
import { PanelFocus } from '../services/PanelFocus';
import {
  ProjectHealth,
  type ChapterProgress,
  type HealthIssueKind,
} from '../services/ProjectHealth';
import { ProjectService } from '../services/ProjectService';
import { SceneSelection } from '../services/SceneSelection';
import { SelectionContext } from '../services/SelectionContext';
import { useSaveScheduler } from '../services/save-scheduler-binding';
import { Toast } from '../services/Toast';
import { TrashService, type TrashEntry } from '../services/TrashService';
import { ModalBase } from './ModalBase';

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

  // 🗑 ソフトデリートされた項目 (P1)。overlay を開くたびに .editor/trash を読み直す。
  const [trashRevision, setTrashRevision] = createSignal(0);
  const [trashEntries] = createResource(trashRevision, async (): Promise<readonly TrashEntry[]> => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return [];
    try {
      return await TrashService.list(ctx.adapter, ctx.handle);
    } catch {
      return [];
    }
  });

  async function restoreTrash(entry: TrashEntry): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    // reload() は未保存 staging を破棄するため、dirty があるうちは復元させない
    const dirty = DirtyTracker.count() + useSaveScheduler().pendingCount;
    if (dirty > 0) {
      Toast.warning(`未保存の変更が ${dirty} 件あります。Cmd+S で保存してから復元してください`);
      return;
    }
    let res = await TrashService.restore(ctx.adapter, ctx.handle, entry.trashPath);
    if (!res.ok && res.reason === 'exists') {
      if (
        !window.confirm(`${res.originalPath} には既にファイルがあります。上書きして復元しますか?`)
      ) {
        return;
      }
      res = await TrashService.restore(ctx.adapter, ctx.handle, entry.trashPath, {
        overwrite: true,
      });
    }
    if (!res.ok || !res.originalPath) {
      Toast.error('復元に失敗しました (ゴミ箱のエントリを読めません)');
      return;
    }
    try {
      // シーンの場合は章の _scene_index.yaml へ再登録してから reload で反映
      const m = /^Scenarios\/([^/]+)\/(.+)\.scn\.yaml$/.exec(res.originalPath);
      if (m) await ctx.scenarioRepository.registerScene(m[1]!, m[2]!);
      await ProjectService.reload();
      Toast.success(`復元しました: ${entry.label}`);
    } catch (e) {
      Toast.error(`復元後の再読込に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
    setTrashRevision((n) => n + 1);
  }
  return (
    <ModalBase
      onClose={() => ProjectHealthOverlay.hide()}
      dialogClass="ss-modal ss-modal--wide"
      labelledBy="ss-project-health-title"
    >
      <h3 id="ss-project-health-title">🩺 プロジェクト ヘルス</h3>
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
                          {(c as Extract<HealthIssueKind, { kind: 'missing-thumbnail' }>).display} (
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

      {/* 🗑 最近削除した項目 (ソフトデリートの復元 UI) */}
      <Show when={(trashEntries() ?? []).length > 0}>
        <section class="ss-health-section">
          <h4>🗑 最近削除した項目 ({(trashEntries() ?? []).length})</h4>
          <ul class="ss-health-list">
            <For each={trashEntries() ?? []}>
              {(entry) => (
                <li>
                  <button
                    type="button"
                    class="ss-health-row"
                    data-severity="info"
                    onClick={() => void restoreTrash(entry)}
                    title={`${entry.originalPath} へ復元`}
                  >
                    <span class="ss-health-row-label">↩ 復元</span>
                    <span class="ss-health-row-msg">{entry.label}</span>
                    <span class="ss-health-row-rule">
                      {entry.deletedAt.replace('T', ' ').slice(0, 16)}
                    </span>
                  </button>
                </li>
              )}
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
    </ModalBase>
  );
};

export const ProjectHealthOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <Ui />
    </Show>
  );
};

import { createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { NodeId } from '@scenario-studio/core';
import { PanelFocus } from '../services/PanelFocus';
import { SceneSelection } from '../services/SceneSelection';
import { SelectionContext } from '../services/SelectionContext';
import { UnityReadiness, type ReadinessIssue } from '../services/UnityReadiness';

// PR-AW: Unity Readiness overlay (UX-4)。
// Workspace header の 🎮 ボタンから呼ぶ。Phase 2 Unity 連携の前に
// 「ゲーム実装に流す準備状況」を一覧化する。
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §F

const [open, setOpen] = createSignal(false);

export const UnityReadinessOverlay = {
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

const SEVERITY_LABEL = { error: '⛔ エラー', warning: '⚠️ 警告', info: 'ℹ️ ヒント' };
const CATEGORY_LABEL: Record<ReadinessIssue['category'], string> = {
  thumbnail: '🖼 画像',
  audio: '🔊 音声',
  flow: '🗺 フロー',
  localization: '🌐 翻訳',
  metadata: '🏷 メタ',
};

function jump(issue: ReadinessIssue): void {
  if (!issue.jump) return;
  if (issue.jump.kind === 'node') {
    SelectionContext.selectNode(issue.jump.nodeId as NodeId);
    PanelFocus.focus('inspector-1');
  } else {
    SceneSelection.select({
      chapterSlug: issue.jump.chapterSlug,
      sceneSlug: issue.jump.sceneSlug,
      label: issue.jump.sceneSlug,
    });
    PanelFocus.focus('script-1');
  }
  UnityReadinessOverlay.hide();
}

const Ui: Component = () => {
  const r = (): ReturnType<typeof UnityReadiness.report> => UnityReadiness.report();
  const errorCount = (): number => r().issues.filter((i) => i.severity === 'error').length;
  const warnCount = (): number => r().issues.filter((i) => i.severity === 'warning').length;
  const infoCount = (): number => r().issues.filter((i) => i.severity === 'info').length;
  return (
    <div class="ss-modal-backdrop" onClick={() => UnityReadinessOverlay.hide()}>
      <div class="ss-modal ss-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>🎮 Unity Readiness</h3>
        <p class="ss-modal-caption">
          Phase 2 で Unity に流す前の準備状況。エラー / 警告は事前に解消、
          ヒントは「次にやる」目安。各行クリックで該当箇所にジャンプします。
        </p>

        {/* 概要 */}
        <ul class="ss-readiness-summary">
          <li>
            <strong>{r().summary.totalScenes}</strong>
            <span>シーン</span>
          </li>
          <li>
            <strong>{r().summary.totalCharacters}</strong>
            <span>キャラ</span>
          </li>
          <li>
            <strong>{r().summary.totalLines.toLocaleString('en-US')}</strong>
            <span>セリフ</span>
          </li>
          <li>
            <strong>{r().summary.totalSfxCues}</strong>
            <span>SFX cue</span>
          </li>
          <li>
            <strong>{r().summary.totalBgmCues}</strong>
            <span>BGM cue</span>
          </li>
          <li>
            <strong classList={{ 'ss-readiness-summary-warn': r().summary.unreachableScenes > 0 }}>
              {r().summary.unreachableScenes}
            </strong>
            <span>到達不能</span>
          </li>
        </ul>

        {/* severity bar */}
        <div class="ss-readiness-bar">
          <span class="ss-readiness-pill ss-readiness-pill--error">⛔ {errorCount()}</span>
          <span class="ss-readiness-pill ss-readiness-pill--warning">⚠️ {warnCount()}</span>
          <span class="ss-readiness-pill ss-readiness-pill--info">ℹ️ {infoCount()}</span>
        </div>

        <Show
          when={r().issues.length > 0}
          fallback={<p class="ss-modal-caption">問題は検出されていません。</p>}
        >
          <ul class="ss-readiness-list">
            <For each={r().issues}>
              {(i) => (
                <li>
                  <button
                    type="button"
                    class="ss-readiness-row"
                    data-severity={i.severity}
                    onClick={() => jump(i)}
                    disabled={!i.jump}
                    title={i.jump ? '該当箇所に jump' : ''}
                  >
                    <span class="ss-readiness-row-label">{SEVERITY_LABEL[i.severity]}</span>
                    <span class="ss-readiness-row-cat">{CATEGORY_LABEL[i.category]}</span>
                    <span class="ss-readiness-row-msg">
                      <strong>{i.title}</strong> — {i.detail}
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <p class="ss-readiness-cli-hint">
          <strong>Phase 2 への準備:</strong> このレポートが緑になった段階で
          <code>scenario export --check</code> (Phase 2) や Unity Bridge 連携が安定します。
          現状は「事前検証」用途です。
        </p>

        <div class="ss-modal-actions">
          <span class="ss-modal-spacer" />
          <button type="button" data-variant="primary" onClick={() => UnityReadinessOverlay.hide()}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export const UnityReadinessOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <Ui />
    </Show>
  );
};

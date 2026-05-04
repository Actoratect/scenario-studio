import { createMemo, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { ProjectService } from '../services/ProjectService';

// 空プロジェクト 時に「次に何をするか」を案内する banner (PR-N)。
// 1 ノード 1 章でも追加されたら自動で消える。
// localStorage で「もう表示しない」もできるが MVP では不要 (1 度操作すれば消える)。

export const OnboardingBanner: Component = () => {
  const isEmpty = createMemo(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return false;
    return ctx.project.nodes.size === 0 && ctx.project.scenario.chapters.length === 0;
  });

  return (
    <Show when={isEmpty()}>
      <div class="ss-onboarding">
        <div class="ss-onboarding-step">
          <span class="ss-onboarding-num">1</span>
          <strong>ノードを追加</strong>
          <span class="ss-onboarding-detail">
            Outline タブの「+ Character」「+ Location」などからキャラ / 場所を作成
          </span>
        </div>
        <div class="ss-onboarding-arrow">→</div>
        <div class="ss-onboarding-step">
          <span class="ss-onboarding-num">2</span>
          <strong>章とシーンを追加</strong>
          <span class="ss-onboarding-detail">
            Outline タブの「+ Chapter」 / 章タイトル横の「+ Scene」
          </span>
        </div>
        <div class="ss-onboarding-arrow">→</div>
        <div class="ss-onboarding-step">
          <span class="ss-onboarding-num">3</span>
          <strong>脚本を書く</strong>
          <span class="ss-onboarding-detail">
            Script タブで シーン選択 → セリフ入力 (⌘ / で全ショートカット)
          </span>
        </div>
      </div>
    </Show>
  );
};

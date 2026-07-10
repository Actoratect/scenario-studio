import { createEffect, createMemo, createResource, createSignal, For, on, Show } from 'solid-js';
import type { Component, JSX } from 'solid-js';
import { parseSceneYaml } from '@scenario-studio/core';
import { PanelFocus } from '../services/PanelFocus';
import { ProjectService } from '../services/ProjectService';
import { ScriptHistoryService } from '../services/ScriptHistoryService';

// 空プロジェクト時に「次に何をするか」を案内する banner (PR-N, P1 で対話化)。
// P1: 各ステップの完了を個別判定 (1=ノード / 2=シーン / 3=脚本ブロック) して ✓ を付け、
// ステップクリックで該当パネル (アウトライン / 脚本) にジャンプできる。
// 全ステップ完了で自動消滅。途中でも × で dismiss でき、localStorage に記憶する。

const STORAGE_PREFIX = 'scenario-studio:onboarding-dismissed:';

/** dismiss はプロジェクト名単位で記憶する (handle.id はセッションごとに変わるため)。 */
function storageKey(projectName: string): string {
  return `${STORAGE_PREFIX}${projectName}`;
}

// 親コンテナ (.ss-onboarding) の CSS は据え置き、step の button 化に伴う
// ブラウザ既定スタイルの打ち消しだけ inline で行う (styles.css は親が編集中のため触らない)。
const STEP_BUTTON_STYLE: JSX.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0',
  margin: '0',
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  'text-align': 'left',
};

const CLOSE_BUTTON_STYLE: JSX.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0 4px',
  'margin-left': '8px',
  'font-size': '16px',
  'line-height': '1',
  color: 'var(--ss-text-muted)',
  cursor: 'pointer',
};

interface OnboardingStep {
  num: number;
  title: string;
  detail: string;
  /** クリックでフォーカスする Dockview component 名。 */
  target: 'outline' | 'script';
  done: () => boolean;
}

export const OnboardingBanner: Component = () => {
  const ctx = ProjectService.currentProject;

  // × で閉じた直後のセッション内 fallback (localStorage 書込み失敗時も今は閉じる)
  const [sessionClosed, setSessionClosed] = createSignal(false);

  const dismissed = createMemo(() => {
    if (sessionClosed()) return true;
    const c = ctx();
    if (!c) return true;
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(storageKey(c.project.settings.name)) === '1';
    } catch {
      return false;
    }
  });

  function dismiss(): void {
    const c = ctx();
    if (c && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(storageKey(c.project.settings.name), '1');
      } catch {
        // localStorage 不可でも sessionClosed で今セッション中は閉じる
      }
    }
    setSessionClosed(true);
  }

  // ステップ 1: ノードが 1 つ以上ある
  const step1Done = createMemo(() => {
    const c = ctx();
    return !!c && c.project.nodes.size > 0;
  });

  // ステップ 2: シーンが 1 つ以上ある (章だけでは未完了)
  const sceneFiles = createMemo<readonly string[]>(() => {
    const c = ctx();
    if (!c) return [];
    return c.project.scenario.chapters.flatMap((ch) =>
      ch.scenes.map((s) => `Scenarios/${ch.slug}/${s.relativePath}`),
    );
  });
  const step2Done = createMemo(() => sceneFiles().length > 0);

  // ステップ 3: いずれかのシーンに「ユーザが書いた」脚本ブロックがある。
  // シーン YAML を読む軽い近似 (先頭 20 シーンまで)。一度でも検出したら再チェックしない。
  // addScene が置く初期 placeholder (stage「ここに状況を…」) だけのシーンは未着手とみなす
  // (文言は core の FsScenarioRepository.addScene と揃えること)。
  // 脚本編集の検知は ScriptHistoryService.revision (編集ごとに bump) に依存する。
  const PRISTINE_STAGE_TEXT = 'ここに状況を…';
  const [blocksSeen, setBlocksSeen] = createSignal(false);
  // プロジェクト切替時にセッション内の状態をリセット (dismiss の永続分は localStorage が持つ)
  createEffect(
    on(
      () => ctx()?.project.settings.name,
      () => {
        setBlocksSeen(false);
        setSessionClosed(false);
      },
    ),
  );
  const [step3Check] = createResource(
    () => {
      const c = ctx();
      if (!c || dismissed() || blocksSeen()) return undefined;
      const paths = sceneFiles();
      if (paths.length === 0) return undefined;
      return { c, paths: paths.slice(0, 20), rev: ScriptHistoryService.revision() };
    },
    async (src) => {
      for (const path of src.paths) {
        try {
          const text = await src.c.adapter.read(src.c.handle, path);
          const blocks = parseSceneYaml(text).blocks;
          const authored = blocks.some(
            (b) => !(b.kind === 'stage' && b.text === PRISTINE_STAGE_TEXT),
          );
          if (authored) {
            setBlocksSeen(true);
            return true;
          }
        } catch {
          // 壊れた / 読めないシーンは未完了扱いで無視
        }
      }
      return false;
    },
  );
  const step3Done = createMemo(() => blocksSeen() || step3Check() === true);

  const steps: readonly OnboardingStep[] = [
    {
      num: 1,
      title: 'ノードを追加',
      detail: 'アウトラインの「要素」で種別を選び、名前を入れて「+ 追加」',
      target: 'outline',
      done: step1Done,
    },
    {
      num: 2,
      title: '章とシーンを追加',
      detail: 'アウトラインの「+ チャプター」/ 章タイトル横の「+ シーン」',
      target: 'outline',
      done: step2Done,
    },
    {
      num: 3,
      title: '脚本を書く',
      detail: '「🎬 脚本」タブでシーンを選んで台詞を入力 — Ctrl+/ (Mac: ⌘/) で全ショートカット',
      target: 'script',
      done: step3Done,
    },
  ];

  const visible = createMemo(() => {
    if (!ctx()) return false;
    if (dismissed()) return false;
    // 全ステップ完了で自動消滅
    return !(step1Done() && step2Done() && step3Done());
  });

  return (
    <Show when={visible()}>
      <div class="ss-onboarding">
        <For each={steps}>
          {(step, i) => (
            <>
              <Show when={i() > 0}>
                <div class="ss-onboarding-arrow">→</div>
              </Show>
              <button
                type="button"
                class="ss-onboarding-step"
                style={STEP_BUTTON_STYLE}
                title={step.target === 'outline' ? 'アウトラインパネルを開く' : '脚本パネルを開く'}
                onClick={() => PanelFocus.focusComponent(step.target)}
              >
                <span
                  class="ss-onboarding-num"
                  style={step.done() ? { background: 'var(--ss-accent-green)' } : undefined}
                >
                  {step.done() ? '✓' : String(step.num)}
                </span>
                <strong>{step.title}</strong>
                <span class="ss-onboarding-detail">{step.detail}</span>
              </button>
            </>
          )}
        </For>
        <button
          type="button"
          style={CLOSE_BUTTON_STYLE}
          title="このガイドを閉じる (再表示しません)"
          aria-label="オンボーディングガイドを閉じる"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </Show>
  );
};

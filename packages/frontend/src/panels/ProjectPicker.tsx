import { createSignal, For, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { ProjectNotInitializedError } from '@scenario-studio/core';
import { Spinner } from '@scenario-studio/ui-kit';
import {
  PickedFolderAlreadyProjectError,
  PickedFolderNotInitializedError,
  ProjectService,
} from '../services/ProjectService';
import { Toast } from '../services/Toast';

// 「未だプロジェクトを開いていない」状態の welcome / picker UI。
// 新規 / 開く / サンプル / 最近開いた の 4 アクション。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1

export const ProjectPicker: Component = () => {
  const [busy, setBusy] = createSignal(false);
  const [newName, setNewName] = createSignal('My Project');

  onMount(() => {
    void ProjectService.refreshRecent();
  });

  async function onOpen(): Promise<void> {
    setBusy(true);
    try {
      await ProjectService.openWithPicker();
    } catch (e) {
      // P1: 未初期化フォルダを選んだ場合は「ここに新規作成しますか?」の対話に切替える
      // (picker を再度開かせず、選択済みフォルダをそのまま初期化する)
      if (e instanceof PickedFolderNotInitializedError) {
        const ok = window.confirm(
          'このフォルダはまだ Scenario Studio プロジェクトではありません。ここに新規プロジェクトを作成しますか?',
        );
        if (ok) {
          try {
            await ProjectService.initializePicked(e.picked, e.picked.handle.name);
            Toast.success(`「${e.picked.handle.name}」に新規プロジェクトを作成しました`);
          } catch (e2) {
            console.error('initialize picked failed', e2);
            Toast.error(
              `プロジェクトを作成できません: ${e2 instanceof Error ? e2.message : String(e2)}`,
            );
          }
        }
        return;
      }
      console.error('open failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      // ユーザのキャンセル (AbortError) は通知しない
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        Toast.error(`プロジェクトを開けません: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(): Promise<void> {
    setBusy(true);
    try {
      await ProjectService.createWithPicker(newName().trim() || 'Untitled');
    } catch (e) {
      // P1: 既にプロジェクトがあるフォルダを選んだ場合は「既存として開き直しますか?」に切替える
      if (e instanceof PickedFolderAlreadyProjectError) {
        const ok = window.confirm(
          'このフォルダには既にプロジェクトがあります。「既存プロジェクトを開く」で開き直しますか?',
        );
        if (ok) {
          try {
            await ProjectService.openPickedExisting(e.picked);
          } catch (e2) {
            console.error('open picked existing failed', e2);
            Toast.error(
              `プロジェクトを開けません: ${e2 instanceof Error ? e2.message : String(e2)}`,
            );
          }
        }
        return;
      }
      console.error('create failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        Toast.error(`プロジェクトを作成できません: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onOpenRecent(id: string): Promise<void> {
    const recent = ProjectService.recentProjects().find((p) => p.id === id);
    if (!recent) return;
    setBusy(true);
    try {
      const opened = await ProjectService.openRecent(recent);
      if (!opened) {
        // P1: 失敗理由 (権限拒否 / 未初期化) を分けた日本語で案内する
        const err = ProjectService.lastError();
        if (err instanceof ProjectNotInitializedError) {
          Toast.error(
            `「${recent.name}」のフォルダに ProjectSettings.yaml が見つかりません。フォルダを移動・削除したか、プロジェクトではなくなっています。「既存プロジェクトを開く」から選び直してください`,
          );
        } else {
          Toast.error(
            `「${recent.name}」のフォルダへのアクセス許可が得られませんでした。もう一度クリックしてダイアログで「許可」を選ぶか、「既存プロジェクトを開く」から選び直してください`,
          );
        }
      }
    } catch (e) {
      console.error('open recent failed', e);
      // フォルダ自体が移動・削除されている場合は NotFoundError になる
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        Toast.error(
          `「${recent.name}」のフォルダが見つかりません (移動または削除された可能性があります)。「既存プロジェクトを開く」から選び直してください`,
        );
      } else {
        Toast.error(`プロジェクトを開けません: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  /** P1: bundle 済 走れメロス サンプルを選択フォルダに展開して開く (PR-AE の FF7 版を復活) */
  async function onOpenSample(): Promise<void> {
    if (
      !window.confirm(
        'サンプル『走れメロス』を開きます。空フォルダを 1 つ選んでください (そこに 40 個ほどのファイルが書き出されます)。',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await ProjectService.openMerosSample();
      Toast.success('サンプル『走れメロス』を展開しました');
    } catch (e) {
      console.error('open meros sample failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        Toast.error(`サンプルを開けません: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="picker">
      <header class="picker-header">
        <h1>Scenario Studio</h1>
        <p>multi-target scenario editor — Phase 1 MVP (Browser standalone)</p>
      </header>

      <Show
        when={ProjectService.supportsNativeFs()}
        fallback={
          <div class="picker-card picker-warn">
            <strong>This browser does not support File System Access API.</strong>
            <p>Use Chrome or Edge for first-class folder access. Sandbox (OPFS) mode is planned.</p>
          </div>
        }
      >
        <section class="picker-card">
          <h2>新規プロジェクト</h2>
          <p>
            空のフォルダを選ぶと <code>ProjectSettings.yaml</code> + 構造を作成します。
          </p>
          <label>
            プロジェクト名:
            <input
              type="text"
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              disabled={busy()}
            />
          </label>
          <button data-variant="primary" onClick={() => void onCreate()} disabled={busy()}>
            <Show when={busy()}>
              <Spinner /> 待機中…
            </Show>
            <Show when={!busy()}>フォルダを選んで新規作成</Show>
          </button>
        </section>

        <section class="picker-card">
          <h2>既存プロジェクトを開く</h2>
          <p>
            <code>ProjectSettings.yaml</code> がある既存フォルダを開きます。
          </p>
          <button onClick={() => void onOpen()} disabled={busy()}>
            <Show when={busy()}>
              <Spinner /> 待機中…
            </Show>
            <Show when={!busy()}>フォルダを選んで開く</Show>
          </button>
        </section>

        <section class="picker-card picker-card--sample">
          <h2>📖 サンプル『走れメロス』を試す</h2>
          <p>
            キャラ / 場所 / 章 / シーン / 脚本が一通り入ったパブリックドメイン作品のサンプル。
            空のフォルダを選ぶと、そこに展開して開きます。
          </p>
          <button data-variant="primary" onClick={() => void onOpenSample()} disabled={busy()}>
            <Show when={busy()}>
              <Spinner /> 展開中…
            </Show>
            <Show when={!busy()}>サンプルを展開して開く</Show>
          </button>
        </section>

        <section class="picker-card">
          <h2>最近開いた</h2>
          <Show
            when={ProjectService.recentProjects().length > 0}
            fallback={<p class="picker-empty">まだありません</p>}
          >
            <ul class="picker-recent">
              <For each={ProjectService.recentProjects()}>
                {(r) => (
                  <li classList={{ 'picker-recent--pinned': r.pinned }}>
                    <button
                      class="picker-recent-pin"
                      disabled={busy()}
                      onClick={() => void ProjectService.setPinned(r.id, !r.pinned)}
                      title={r.pinned ? 'pin を外す' : '上に pin'}
                    >
                      {r.pinned ? '📌' : '📍'}
                    </button>
                    <button
                      class="picker-recent-open"
                      disabled={busy()}
                      onClick={() => void onOpenRecent(r.id)}
                    >
                      <strong>{r.name}</strong>
                      <span class="picker-recent-time">
                        {new Date(r.lastOpened).toLocaleString()}
                      </span>
                    </button>
                    <button
                      class="picker-recent-forget"
                      disabled={busy()}
                      onClick={() => {
                        if (window.confirm(`"${r.name}" をリストから削除しますか?`)) {
                          void ProjectService.forget(r.id);
                        }
                      }}
                      title="リストから削除"
                    >
                      ×
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </Show>

      <Show when={ProjectService.lastError()}>
        {(err) => (
          <div class="picker-error">
            <strong>Error:</strong> {err().message}
          </div>
        )}
      </Show>
    </div>
  );
};

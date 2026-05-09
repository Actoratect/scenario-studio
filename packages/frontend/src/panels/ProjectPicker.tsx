import { createSignal, For, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { Spinner } from '@scenario-studio/ui-kit';
import { ProjectService } from '../services/ProjectService';
import { Toast } from '../services/Toast';

// 「未だプロジェクトを開いていない」状態の welcome / picker UI。
// 新規 / 開く / 最近開いた の 3 アクション。
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
      console.error('create failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        Toast.error(`プロジェクトを作成できません: ${msg}`);
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
                      onClick={() => void ProjectService.openRecent(r)}
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

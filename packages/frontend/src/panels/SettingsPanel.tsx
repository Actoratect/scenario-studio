import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { eraId, type EraDefinition, type EraId, type ProjectSettings } from '@scenario-studio/core';
import { LoadingOverlay } from '@scenario-studio/ui-kit';
import { ProjectService } from '../services/ProjectService';
import { Toast } from '../services/Toast';

// プロジェクト設定パネル (PR-M)。
// - プロジェクト名 (workspace title に直結)
// - locale 一覧 (read-only、PR-B 後は ja のみ実用、将来 export 多言語化のとき編集可に)
// - Era CRUD (add / rename / change parent / delete)
//
// AI provider 設定は AiPanel に既にあるためここでは扱わない。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md,
//       ../../../../Documentation/ScenarioEditor/05_timeline.md

export const SettingsPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const ctx = createMemo(() => ProjectService.currentProject());
  const settings = createMemo<ProjectSettings | undefined>(() => ctx()?.project.settings);

  const [name, setName] = createSignal<string>('');
  const [busy, setBusy] = createSignal(false);

  // settings が ctx 切替 / 保存後に変わったら local state を同期
  createEffect(() => {
    const s = settings();
    if (s) setName(s.name);
  });

  async function saveName(): Promise<void> {
    const s = settings();
    if (!s) return;
    const trimmed = name().trim();
    if (trimmed === '' || trimmed === s.name) return;
    setBusy(true);
    try {
      await ProjectService.updateSettings({ ...s, name: trimmed });
      Toast.success(`プロジェクト名を変更: ${trimmed}`);
    } catch (e) {
      Toast.error(`設定保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="panel-content panel-settings">
      <LoadingOverlay when={busy()} label="保存中…" />
      <header class="panel-settings-header">
        Settings · <code>{params.api.id}</code>
      </header>

      <Show when={ctx()} fallback={<p>プロジェクトが開かれていません。</p>}>
        <section class="panel-settings-section">
          <h3>プロジェクト名</h3>
          <p class="panel-settings-hint">workspace header / 出力タイトル に使われる名前。</p>
          <div class="panel-settings-form">
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              disabled={busy()}
            />
            <button
              type="button"
              data-variant="primary"
              disabled={busy() || name().trim() === '' || name().trim() === settings()?.name}
              onClick={() => void saveName()}
            >
              保存
            </button>
          </div>
        </section>

        <section class="panel-settings-section">
          <h3>Locale</h3>
          <p class="panel-settings-hint">
            現在は ja 固定 (PR-B で多言語入力 UI を撤去)。多言語 export は Phase 3 で再追加予定。
          </p>
          <ul class="panel-settings-list">
            <For each={settings()?.locales ?? []}>
              {(loc) => (
                <li>
                  <code>{loc}</code>
                </li>
              )}
            </For>
          </ul>
        </section>

        <EraSection />

        <section class="panel-settings-section">
          <h3>その他</h3>
          <ul class="panel-settings-list">
            <li>
              schemaVersion: <code>{settings()?.schemaVersion}</code>
            </li>
            <li>
              lastEra: <code>{settings()?.lastEra ?? '(none)'}</code>
            </li>
          </ul>
        </section>
      </Show>
    </div>
  );
};

// ===== Era CRUD =====

const EraSection: Component = () => {
  const ctx = createMemo(() => ProjectService.currentProject());
  const eras = createMemo<readonly EraDefinition[]>(() => {
    const c = ctx();
    if (!c) return [];
    const ids = c.project.eras.all();
    return ids
      .map((id) => c.project.eras.get(id))
      .filter((e): e is EraDefinition => e !== undefined);
  });

  const [busy, setBusy] = createSignal(false);
  const [newId, setNewId] = createSignal('');
  const [newLabel, setNewLabel] = createSignal('');
  const [newParent, setNewParent] = createSignal('');

  async function addEra(): Promise<void> {
    const c = ctx();
    if (!c) return;
    const id = newId().trim();
    const label = newLabel().trim();
    if (!id || !label) {
      Toast.warning('id と label は必須');
      return;
    }
    if (!id.startsWith('era.')) {
      Toast.warning('id は "era." で始める必要があります');
      return;
    }
    setBusy(true);
    try {
      const def: EraDefinition = { id: eraId(id), label };
      if (newParent().trim() !== '') def.parent = eraId(newParent().trim());
      await c.eraRepository.save(def);
      // 再 hydrate
      await refreshEras();
      Toast.success(`Era 追加: ${label}`);
      setNewId('');
      setNewLabel('');
      setNewParent('');
    } catch (e) {
      Toast.error(`Era 追加に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function renameEra(era: EraDefinition): Promise<void> {
    const c = ctx();
    if (!c) return;
    const next = window.prompt('Era ラベル:', era.label);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed === '' || trimmed === era.label) return;
    setBusy(true);
    try {
      await c.eraRepository.save({ ...era, label: trimmed });
      await refreshEras();
    } catch (e) {
      Toast.error(`Era 編集に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEra(era: EraDefinition): Promise<void> {
    const c = ctx();
    if (!c) return;
    // 子 Era がいる場合は警告
    const hasChildren = eras().some((e) => e.parent === era.id);
    const msg = hasChildren
      ? `Era "${era.label}" は子 Era の親になっています。削除すると子 Era は孤児化します。続けますか?`
      : `Era "${era.label}" を削除しますか?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await c.eraRepository.delete(era.id);
      await refreshEras();
      Toast.success(`Era 削除: ${era.label}`);
    } catch (e) {
      Toast.error(`Era 削除に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshEras(): Promise<void> {
    const c = ctx();
    if (!c) return;
    const next = await c.eraRepository.loadAll();
    Object.assign(c.project, { eras: next });
  }

  function indentForEra(era: EraDefinition): number {
    let depth = 0;
    let cursor: EraId | undefined = era.parent;
    const c = ctx();
    if (!c) return 0;
    while (cursor) {
      depth++;
      const parent = c.project.eras.get(cursor);
      cursor = parent?.parent;
      if (depth > 8) break; // 防御
    }
    return depth;
  }

  return (
    <section class="panel-settings-section">
      <h3>Era 階層</h3>
      <p class="panel-settings-hint">
        時代 / 局面の単位。ノードのフィールドは Era ごとに override できる (PR-L)。
      </p>
      <ul class="panel-settings-era-list">
        <For
          each={eras()}
          fallback={
            <li class="panel-settings-empty">
              Era が定義されていません。下のフォームで追加してください。
            </li>
          }
        >
          {(era) => (
            <li
              class="panel-settings-era-item"
              style={{ 'padding-left': `${indentForEra(era) * 16}px` }}
            >
              <span class="panel-settings-era-id">
                <code>{era.id}</code>
              </span>
              <span class="panel-settings-era-label">{era.label}</span>
              <Show when={era.parent}>
                <span class="panel-settings-era-parent">
                  parent: <code>{era.parent}</code>
                </span>
              </Show>
              <span class="panel-settings-era-actions">
                <button type="button" disabled={busy()} onClick={() => void renameEra(era)}>
                  ✎
                </button>
                <button
                  type="button"
                  class="panel-settings-era-delete"
                  disabled={busy()}
                  onClick={() => void deleteEra(era)}
                >
                  ×
                </button>
              </span>
            </li>
          )}
        </For>
      </ul>

      <div class="panel-settings-era-form">
        <input
          type="text"
          placeholder="id (例: era.medieval)"
          value={newId()}
          onInput={(e) => setNewId(e.currentTarget.value)}
        />
        <input
          type="text"
          placeholder="label (例: 中世)"
          value={newLabel()}
          onInput={(e) => setNewLabel(e.currentTarget.value)}
        />
        <select
          value={newParent()}
          onChange={(e) => setNewParent(e.currentTarget.value)}
          title="親 Era (任意)"
        >
          <option value="">— 親 Era なし —</option>
          <For each={eras()}>{(era) => <option value={era.id}>{era.label}</option>}</For>
        </select>
        <button
          type="button"
          data-variant="primary"
          disabled={busy() || !newId() || !newLabel()}
          onClick={() => void addEra()}
        >
          + 追加
        </button>
      </div>
    </section>
  );
};

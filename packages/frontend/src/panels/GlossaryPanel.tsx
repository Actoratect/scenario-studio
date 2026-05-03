import { createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import type { GlossaryTerm } from '@scenario-studio/core';
import { LoadingOverlay } from '@scenario-studio/ui-kit';
import { ProjectService } from '../services/ProjectService';
import { Toast } from '../services/Toast';

// 用語集 panel (M7)。
// MVP は単一テーブル + 簡易フォーム。検索 / インポート / AI 一括翻訳は Phase 1 後半 / 3 で。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §3.3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7

export const GlossaryPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [busy, setBusy] = createSignal(false);
  const [draft, setDraft] = createSignal({
    term: '',
    aliases: '',
    forbidden: '',
    description: '',
  });

  function reset(): void {
    setDraft({ term: '', aliases: '', forbidden: '', description: '' });
  }

  async function persist(next: readonly GlossaryTerm[]): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setBusy(true);
    try {
      await ctx.glossaryRepository.save(next);
      Object.assign(ctx.project, { glossary: next });
    } catch (e) {
      console.error('glossary save failed', e);
      Toast.error(`用語集の保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function addTerm(): Promise<void> {
    const d = draft();
    if (!d.term.trim()) return;
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const next: GlossaryTerm = {
      term: d.term.trim(),
      aliases: splitCsv(d.aliases),
      forbidden: splitCsv(d.forbidden),
      ...(d.description.trim() ? { description: d.description.trim() } : {}),
    };
    await persist([...(ctx.project.glossary ?? []), next]);
    reset();
  }

  async function deleteTerm(term: GlossaryTerm): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    await persist(ctx.project.glossary.filter((t) => t.term !== term.term));
  }

  return (
    <div class="panel-content panel-glossary">
      <LoadingOverlay when={busy()} label="保存中…" />
      <header class="panel-glossary-header">
        Glossary · <code>{params.api.id}</code>
      </header>

      <div class="panel-glossary-list">
        <Show
          when={(ProjectService.currentProject()?.project.glossary ?? []).length > 0}
          fallback={<p class="panel-glossary-empty">用語が登録されていません。</p>}
        >
          <table>
            <thead>
              <tr>
                <th>用語</th>
                <th>別表記</th>
                <th>禁止表記</th>
                <th>説明</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={ProjectService.currentProject()!.project.glossary}>
                {(t) => (
                  <tr>
                    <td>{t.term}</td>
                    <td>{t.aliases.join(', ')}</td>
                    <td class="panel-glossary-forbidden">{t.forbidden.join(', ')}</td>
                    <td>{t.description ?? ''}</td>
                    <td>
                      <button disabled={busy()} onClick={() => void deleteTerm(t)}>
                        ×
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>

      <div class="panel-glossary-form">
        <input
          type="text"
          placeholder="正式表記 (必須)"
          value={draft().term}
          onInput={(e) => setDraft({ ...draft(), term: e.currentTarget.value })}
          disabled={busy()}
        />
        <input
          type="text"
          placeholder="別表記 (カンマ区切り)"
          value={draft().aliases}
          onInput={(e) => setDraft({ ...draft(), aliases: e.currentTarget.value })}
          disabled={busy()}
        />
        <input
          type="text"
          placeholder="禁止表記 (カンマ区切り)"
          value={draft().forbidden}
          onInput={(e) => setDraft({ ...draft(), forbidden: e.currentTarget.value })}
          disabled={busy()}
        />
        <input
          type="text"
          placeholder="説明 (任意)"
          value={draft().description}
          onInput={(e) => setDraft({ ...draft(), description: e.currentTarget.value })}
          disabled={busy()}
        />
        <button disabled={busy() || !draft().term.trim()} onClick={() => void addTerm()}>
          + 追加
        </button>
      </div>
    </div>
  );
};

function splitCsv(s: string): readonly string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');
}

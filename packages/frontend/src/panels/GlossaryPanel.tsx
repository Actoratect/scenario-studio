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
      // signal を bump → For が再描画される (これが無いと ＋ ボタンで挿入しても画面に出ない)
      ProjectService.touch();
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

  /**
   * 指定 index の前に空行 (placeholder term) を挿入。term は仮 "新しい用語 N" で
   * 衝突を避け、ユーザーがその場で書き換える想定。
   */
  async function insertAt(index: number): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const existing = ctx.project.glossary;
    let n = 1;
    let candidate = `新しい用語 ${n}`;
    while (existing.some((g) => g.term === candidate)) {
      n += 1;
      candidate = `新しい用語 ${n}`;
    }
    const placeholder: GlossaryTerm = { term: candidate, aliases: [], forbidden: [] };
    const next = [...existing.slice(0, index), placeholder, ...existing.slice(index)];
    await persist(next);
  }

  /**
   * 既存の用語の特定 field を inline 編集 → 確定。
   * term (= 主キー) の変更も許容するが、空文字 / 既存衝突は reject する。
   */
  async function updateTerm(
    original: GlossaryTerm,
    patch: Partial<{
      term: string;
      aliases: readonly string[];
      forbidden: readonly string[];
      description: string;
    }>,
  ): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const next: GlossaryTerm = {
      term: (patch.term ?? original.term).trim(),
      aliases: patch.aliases ?? original.aliases,
      forbidden: patch.forbidden ?? original.forbidden,
      ...(patch.description !== undefined
        ? patch.description.trim() === ''
          ? {}
          : { description: patch.description.trim() }
        : original.description !== undefined
          ? { description: original.description }
          : {}),
    };
    if (next.term === '') {
      Toast.error('用語名は空にできません');
      return;
    }
    if (next.term !== original.term && ctx.project.glossary.some((g) => g.term === next.term)) {
      Toast.error(`「${next.term}」は既に存在します`);
      return;
    }
    const replaced = ctx.project.glossary.map((t) => (t.term === original.term ? next : t));
    await persist(replaced);
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
          <table class="panel-glossary-table">
            {/* 列幅は colgroup で割合指定。境界 drag でリサイズしたい場合は将来 JS 化。
                table-layout: fixed と組み合わせて、列の widthが安定するようにする。 */}
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: 'auto' }} />
              <col style={{ width: '32px' }} />
            </colgroup>
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
                {(t, i) => (
                  <>
                    {/* 行間ホバー → ＋ ボタンで挿入 (Excel 風) */}
                    <tr class="panel-glossary-insert-row">
                      <td colspan={5}>
                        <button
                          type="button"
                          class="panel-glossary-insert-btn"
                          disabled={busy()}
                          onClick={() => void insertAt(i())}
                          title="この行の前に新しい用語を追加"
                        >
                          ＋
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <input
                          type="text"
                          class="panel-glossary-cell-input"
                          value={t.term}
                          disabled={busy()}
                          onChange={(e) => {
                            const v = e.currentTarget.value;
                            if (v !== t.term) void updateTerm(t, { term: v });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          class="panel-glossary-cell-input"
                          value={t.aliases.join(', ')}
                          disabled={busy()}
                          placeholder="カンマ区切り"
                          onChange={(e) => {
                            const v = splitCsv(e.currentTarget.value);
                            if (v.join(',') !== t.aliases.join(','))
                              void updateTerm(t, { aliases: v });
                          }}
                        />
                      </td>
                      <td class="panel-glossary-forbidden">
                        <input
                          type="text"
                          class="panel-glossary-cell-input"
                          value={t.forbidden.join(', ')}
                          disabled={busy()}
                          placeholder="カンマ区切り"
                          onChange={(e) => {
                            const v = splitCsv(e.currentTarget.value);
                            if (v.join(',') !== t.forbidden.join(','))
                              void updateTerm(t, { forbidden: v });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          class="panel-glossary-cell-input"
                          value={t.description ?? ''}
                          disabled={busy()}
                          onChange={(e) => {
                            const v = e.currentTarget.value;
                            if (v !== (t.description ?? '')) void updateTerm(t, { description: v });
                          }}
                        />
                      </td>
                      <td>
                        <button
                          disabled={busy()}
                          onClick={() => void deleteTerm(t)}
                          title="この用語を削除"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  </>
                )}
              </For>
              {/* 末尾の挿入行 (= 既存リスト末尾に追加) */}
              <tr class="panel-glossary-insert-row">
                <td colspan={5}>
                  <button
                    type="button"
                    class="panel-glossary-insert-btn"
                    disabled={busy()}
                    onClick={() =>
                      void insertAt(ProjectService.currentProject()!.project.glossary.length)
                    }
                    title="末尾に新しい用語を追加"
                  >
                    ＋
                  </button>
                </td>
              </tr>
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
